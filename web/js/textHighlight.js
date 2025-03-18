import { settingsHelper, API_PREFIX } from "./settings.js";
import { hexToRgb } from "./util.js";
import { BooruApi } from "./booruTagApi.js";
import { api } from "../../../scripts/api.js";

const booruApi = new BooruApi();

// Global shared resources
const globalResources = {
    validLoras: null,
    validEmbeddings: null,
    colors: null,
    highlightType: false,
    errorColor: "var(--error-text)",
};

// Track all enhanced textareas
const enhancedTextareas = new WeakSet();

// Initialize global resources
async function initializeGlobalResources() {
    globalResources.validLoras = await getValidFiles("loras");
    globalResources.validEmbeddings = await getValidFiles("embeddings");
    await updateTextColors();
}

// Initialize resources when script loads
initializeGlobalResources();

// Update all textareas when settings change
api.addEventListener("update_text_highlight", async () => {
    document.querySelectorAll("textarea").forEach((textarea) => {
        const overlay = textarea.previousSibling;
        if (overlay && overlay.classList.contains("input-overlay")) {
            setOverlayStyle(textarea, overlay);
            syncText(textarea, overlay);
        }
    });
});

settingsHelper.addReloadSettingsListener(() => {
    // Update global resources when settings change
    initializeGlobalResources();
});

// Create observer for new textareas
const textareaObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
            if (node.nodeType === 1) {
                // Check the added node itself
                if (node.tagName === "TEXTAREA") {
                    enhanceTextarea(node);
                }
                // Check children of added node
                node.querySelectorAll("textarea").forEach((textarea) => {
                    enhanceTextarea(textarea);
                });
            }
        });
    });
});

// Start observing the whole document
textareaObserver.observe(document.body, {
    childList: true,
    subtree: true,
});

// Main function to enhance a textarea
function enhanceTextarea(textarea) {
    if (
        enhancedTextareas.has(textarea) ||
        textarea.closest(".settings-container") ||
        !textarea.classList.contains("comfy-multiline-input")
    ) {
        return;
    }
    enhancedTextareas.add(textarea);

    // Create overlay div
    const overlayEl = document.createElement("div");
    overlayEl.className = "input-overlay";
    textarea.parentNode.insertBefore(overlayEl, textarea);
    textarea.style.background = "transparent";

    // Setup the textarea and overlay
    setOverlayPosition(textarea, overlayEl);
    setOverlayStyle(textarea, overlayEl);
    setTextColors(textarea, overlayEl);
    addTooltips(textarea);

    // Add scroll sync
    textarea.addEventListener("scroll", () => {
        overlayEl.scrollTop = textarea.scrollTop;
        overlayEl.scrollLeft = textarea.scrollLeft;
    });

    // Add event listeners
    textarea.addEventListener("input", () => {
        syncText(textarea, overlayEl);
        setOverlayStyle(textarea, overlayEl);
    });

    textarea.addEventListener("paste", () => {
        // Use setTimeout to ensure we get the updated value after the paste operation
        setTimeout(() => {
            try {
                if (overlayEl && document.contains(overlayEl)) {
                    syncText(textarea, overlayEl);
                    setOverlayStyle(textarea, overlayEl);
                } else {
                    console.error(
                        "Overlay element not found during paste operation"
                    );
                }
            } catch (err) {
                console.error("Error handling paste event:", err);
            }
        }, 10);
    });

    api.addEventListener("update_text_highlight", (event) => {
        setTextColors(textarea, overlayEl);
        setOverlayStyle(textarea, overlayEl);
        syncText(textarea, overlayEl);
    });

    textarea.addEventListener("keydown", (event) => {
        if (
            event.ctrlKey &&
            (event.key === "ArrowUp" || event.key === "ArrowDown")
        ) {
            setTimeout(() => {
                syncText(textarea, overlayEl);
            }, 10);
        }
    });

    // Add observer for style changes
    const observer = new MutationObserver(() => {
        setOverlayPosition(textarea, overlayEl);
    });

    observer.observe(textarea, {
        attributes: true,
        attributeFilter: ["style"],
        childList: true,
        subtree: true,
        characterData: true,
    });

    // Clean up overlay if textarea is removed
    const parentObserver = new MutationObserver(() => {
        if (!document.contains(textarea)) {
            overlayEl.remove();
        }
    });

    parentObserver.observe(textarea.parentNode, {
        childList: true,
    });
}

// Initialize highlighting on existing textareas
document.querySelectorAll("textarea").forEach((textarea) => {
    enhanceTextarea(textarea);
});

async function setTextHighlightType() {
    const highlightGradient = await settingsHelper.getSetting(
        "Textbox Highlight Type"
    );
    globalResources.highlightType = highlightGradient === "strength";
}

async function updateTextColors() {
    const customTextboxColors = await settingsHelper.getSetting(
        "Textbox Colors"
    );
    await setTextHighlightType();
    globalResources.colors = customTextboxColors
        .split("\n")
        .map((color) => (color.charAt(0) === "#" ? hexToRgb(color) : color));
}

function setTextColors(inputEl, overlayEl) {
    // Use global resources instead of setting them on the element
    syncText(inputEl, overlayEl);
}

function escapeHtml(char) {
    switch (char) {
        case "<":
            return "&lt;";
        case ">":
            return "&gt;";
        default:
            return char;
    }
}

function interpolateColor(color1, color2, factor) {
    const rgb1 = color1.match(/\d+/g).map(Number);
    const rgb2 = color2.match(/\d+/g).map(Number);

    const r = Math.round(rgb1[0] + factor * (rgb2[0] - rgb1[0]));
    const g = Math.round(rgb1[1] + factor * (rgb2[1] - rgb1[1]));
    const b = Math.round(rgb1[2] + factor * (rgb2[2] - rgb1[2]));

    return `rgb(${r}, ${g}, ${b})`;
}

function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function charToType(char) {
    switch (char) {
        case "<":
            return "-lora";
        case "e":
            return "-embedding";
        default:
            return "";
    }
}

function extractLoraName(text, currentIndex) {
    const loraPrefix = "lora:";
    const startIndex =
        text.lastIndexOf(loraPrefix, currentIndex) + loraPrefix.length;

    // Find the end of the LoRA name (next space, comma, or ".safetensors")
    let endIndex = text.indexOf(" ", startIndex);
    const commaIndex = text.indexOf(",", startIndex);
    const safetensorsIndex = text.indexOf(".safetensors", startIndex);

    if (endIndex === -1 || (commaIndex !== -1 && commaIndex < endIndex)) {
        endIndex = commaIndex;
    }
    if (
        endIndex === -1 ||
        (safetensorsIndex !== -1 && safetensorsIndex < endIndex)
    ) {
        endIndex = safetensorsIndex;
    }

    // If there's no space, comma, or ".safetensors" after the LoRA name, consider the end of the text
    const loraName =
        endIndex === -1
            ? text.slice(startIndex)
            : text.slice(startIndex, endIndex);
    return loraName;
}

function validateName(type, name) {
    const validFiles =
        type === "lora"
            ? globalResources.validLoras
            : globalResources.validEmbeddings;
    if (!validFiles) {
        console.error("Valid names not defined or not an array.");
        return false;
    }
    return validFiles.includes(name);
}

function processTag(tag) {
    let trimmedTag = tag.trim();

    // Remove HTML tags
    trimmedTag = trimmedTag.replace(/<|>/g, "");

    // Remove the first character if it is a parenthesis
    if (trimmedTag.startsWith("(")) {
        trimmedTag = trimmedTag.substring(1).trim();
    }

    // Special handling for lora tags
    if (trimmedTag.toLowerCase().startsWith("&lt;lora:")) {
        const matches = trimmedTag.match(/:/g);
        if (matches && matches.length >= 2) {
            const secondColonIndex = trimmedTag.indexOf(
                ":",
                trimmedTag.indexOf(":") + 1
            );
            trimmedTag = trimmedTag.substring(0, secondColonIndex).trim();
        }
    } else {
        // Remove everything after the first colon for non-lora tags
        const colonIndex = trimmedTag.indexOf(":");
        if (colonIndex !== -1) {
            trimmedTag = trimmedTag.substring(0, colonIndex).trim();
        }
    }

    return trimmedTag;
}

const charPairs = {
    "(": ")",
    "<": ">",
};

async function syncText(inputEl, overlayEl, tries = 1) {
    const text = inputEl.value;
    overlayEl.textContent = text;

    const colors = globalResources.colors;
    const errorColor = globalResources.errorColor;
    const shouldHighlightGradient = globalResources.highlightType;
    const loraColor = colors ? colors[0] : undefined;

    if (
        !colors ||
        !errorColor ||
        !loraColor ||
        shouldHighlightGradient == undefined
    ) {
        if (tries < 5) {
            setTimeout(() => syncText(inputEl, overlayEl, tries++), tries * 5);
        }
        return;
    }

    let uniqueIdCounter = 0;
    const generateUniqueId = (type = "") => `span-${uniqueIdCounter++}${type}`;

    let nestingLevel = 0;
    let highlightedText = "";
    let lastIndex = 0;
    let spanStack = [];
    const uniqueIdMap = new Map();

    /*
     * This loop iterates over each character in the `text` string to apply syntax highlighting and handle special cases.
     * - lastIndex: index of the last processed character, used to slice text segments.
     * - spanStack: stack to manage opened spans, storing their ids, start positions, original colors, and characters.
     */
    for (let i = 0; i < text.length; i++) {
        const char = text[i].toLowerCase();

        // Handle escape characters
        if (
            char === "\\" &&
            i + 1 < text.length &&
            (text[i + 1] === "(" || text[i + 1] === ")")
        ) {
            i++;
            continue;
        }

        // Handle wrong escape characters
        if (
            char === "/" &&
            i + 1 < text.length &&
            (text[i + 1] === "(" || text[i + 1] === ")")
        ) {
            highlightedText +=
                text.slice(lastIndex, i) +
                `<span style="background-color: ${errorColor};">/</span>`;
            console.error(`Replace "${char}" at char ${i} with "\\"`);
            lastIndex = i + 1;
            continue;
        }

        let color = colors[nestingLevel % colors.length];
        let uniqueId = generateUniqueId(charToType(char));
        if (globalResources.highlightType === true) {
            color = `id-${uniqueId}`;
        }
        switch (char) {
            case "(":
            case "<":
                highlightedText +=
                    text.slice(lastIndex, i) +
                    `<span id="${uniqueId}" style="background-color: ${color};">${escapeHtml(
                        char
                    )}`;
                spanStack.push({
                    id: uniqueId,
                    start: highlightedText.length,
                    originalSpan: `<span id="${uniqueId}" style="background-color: ${color};">`,
                    nestingLevel,
                    originalColor: color,
                    originalChar: char,
                });
                nestingLevel++;
                lastIndex = i + 1;
                break;
            case "e":
                let embeddingColor = colors[0];
                const embeddingPrefix = "embedding:";

                // Check if the text starts with "embedding:" at position i
                if (text.toLowerCase().startsWith(embeddingPrefix, i)) {
                    // Find the end of the embedding (next space or comma)
                    let endIndex = i + embeddingPrefix.length;
                    while (
                        endIndex < text.length &&
                        text[endIndex] !== " " &&
                        text[endIndex] !== ","
                    ) {
                        endIndex++;
                    }

                    // Get the full embedding text
                    const embeddingText = text.slice(i, endIndex);
                    if (
                        validateName(
                            "embedding",
                            embeddingText.split(":")[1]
                        ) === false
                    ) {
                        embeddingColor = errorColor;
                    }
                    const wrappedEmbedding = `<span id="${uniqueId}" style="background-color: ${embeddingColor};">${escapeHtml(
                        embeddingText
                    )}</span>`;
                    highlightedText +=
                        text.slice(lastIndex, i) + wrappedEmbedding;
                    lastIndex = i + embeddingText.length;
                }
                break;
            case ")":
            case ">":
                if (nestingLevel > 0) {
                    const { id, originalColor, originalChar } =
                        spanStack[spanStack.length - 1];
                    if (charPairs[originalChar] === char) {
                        spanStack.pop();
                        highlightedText +=
                            text.slice(lastIndex, i) +
                            `${escapeHtml(char)}</span>`;
                        nestingLevel--;

                        // Extract and validate the LoRA name
                        if (id.endsWith("lora")) {
                            const loraName = extractLoraName(text, i);
                            if (validateName("lora", loraName) === false) {
                                uniqueIdMap.set(id, [
                                    errorColor,
                                    originalColor,
                                ]);
                                lastIndex = i + 1;
                                continue;
                            }
                        }

                        if (
                            globalResources.highlightType === true ||
                            id.endsWith("lora")
                        ) {
                            // Check for the strength
                            const strengthText = text.slice(
                                Math.max(0, i - 10),
                                i
                            );
                            const match =
                                strengthText.match(/(\d+(\.\d+)?)\s*$/);
                            if (match) {
                                const strength = parseFloat(match[1]);
                                const clampedStrength = Math.max(
                                    0,
                                    Math.min(2, strength)
                                );
                                const normalizedStrength = clampedStrength / 2;
                                const newColor = interpolateColor(
                                    colors[0],
                                    colors[colors.length - 1],
                                    easeInOutCubic(normalizedStrength)
                                );
                                uniqueIdMap.set(id, [newColor, originalColor]);
                            } else {
                                uniqueIdMap.set(id, [
                                    interpolateColor(
                                        colors[0],
                                        colors[colors.length - 1],
                                        0.5
                                    ),
                                    originalColor,
                                ]);
                            }
                        }
                        lastIndex = i + 1;
                    }
                }
                break;
        }
    }

    highlightedText += text.slice(lastIndex);

    if (nestingLevel > 0) {
        // Apply red highlight to the unclosed spans
        while (spanStack.length > 0) {
            const spanData = spanStack.pop();
            if (spanData) {
                const { id, start, originalSpan } = spanData;
                const errorSpanTag = `<span id="${id}" style="background-color: ${errorColor};">`;

                if (originalSpan) {
                    highlightedText = highlightedText.replace(
                        originalSpan,
                        errorSpanTag
                    );
                    highlightedText += `</span>`;
                }
            }
        }
    }

    // Apply the updated colors to the highlighted text
    uniqueIdMap.forEach((colors, id) => {
        const [newColor, originalColor] = [colors[0], colors[1]];
        highlightedText = highlightedText.replace(
            `id="${id}" style="background-color: ${originalColor};"`,
            `id="${id}" style="background-color: ${newColor};"`
        );
    });

    // Highlight duplicate tags
    const strippedText = highlightedText.replace(/<[^>]+>/g, "");
    const segments = strippedText
        .split(",")
        .filter((s) => s !== ",")
        .map((s) => processTag(s));

    const exactDuplicates = segments.filter(
        (item, index) => segments.indexOf(item) !== index
    );

    exactDuplicates.forEach((duplicate) => {
        if (duplicate) {
            const regex = new RegExp(`(^|,\\s*)${duplicate}(?=,|$)`, "g");
            highlightedText = highlightedText.replace(
                regex,
                (match, prefix) =>
                    `${prefix}<span style="background-color: ${errorColor};">${duplicate}</span>`
            );
        }
    });

    const processNode = (node) => {
        if (node.nodeType === Node.TEXT_NODE) {
            // Split and wrap text nodes
            return node.textContent
                .split(",")
                .map((tag) => {
                    if (!tag.trim()) return tag;
                    return `<span class="tag-span" data-tag="${tag.trim()}">${tag}</span>`;
                })
                .join(",");
        } else if (node.nodeType === Node.ELEMENT_NODE) {
            // For element nodes, preserve attributes but process inner content
            const clone = node.cloneNode(false); // Shallow clone to keep attributes
            const innerProcessed = Array.from(node.childNodes)
                .map((child) => processNode(child))
                .join("");
            clone.innerHTML = innerProcessed;
            return clone.outerHTML;
        }
        return "";
    };

    // Create a temporary container to parse HTML
    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = highlightedText;

    // Process all nodes recursively
    let result = Array.from(tempDiv.childNodes)
        .map((node) => processNode(node))
        .join("");

    overlayEl.innerHTML = result;
}

async function showTagTooltip(element, tag) {
    let tooltip = document.getElementById("tag-tooltip");
    const description =
        (await booruApi.getTagDescription(tag)) ?? "No description available.";

    if (!tooltip) {
        tooltip = document.createElement("div");
        tooltip.id = "tag-tooltip";
        document.body.appendChild(tooltip);
    }

    tooltip.style.cssText = `
        position: fixed;
        background: var(--comfy-menu-bg);
        color: var(--comfy-menu-text);
        padding: 12px;
        border-radius: 4px;
        font-size: 14px;
        z-index: 1000;
        pointer-events: none;
        max-width: 300px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.15);
    `;

    const rect = element.getBoundingClientRect();
    tooltip.style.left = `${rect.left}px`;
    tooltip.style.top = `${rect.bottom + 5}px`;

    // Create tooltip content with title and description
    const titleElement = document.createElement("div");
    titleElement.style.cssText = `
        font-weight: bold;
        margin-bottom: ${description ? "8px" : "0"};
        color: var(--comfy-menu-text);
    `;
    titleElement.textContent = booruApi.cleanTag(tag).replaceAll("_", " ");

    tooltip.innerHTML = "";
    tooltip.appendChild(titleElement);

    const descElement = document.createElement("div");
    descElement.style.cssText = `
        font-size: 13px;
        line-height: 1.4;
        color: var(--comfy-menu-text);
        opacity: 0.9;
    `;
    descElement.textContent = description;
    tooltip.appendChild(descElement);
    tooltip.style.display = "block";
}

function hideTagTooltip() {
    const tooltips = document.querySelectorAll("#tag-tooltip");
    tooltips.forEach((tooltip) => {
        tooltip.remove();
    });
}

function setOverlayPosition(inputEl, overlayEl) {
    // Skip if elements don't exist or aren't in the DOM
    if (!inputEl || !overlayEl || !document.contains(inputEl)) return;
    const textareaStyle = window.getComputedStyle(inputEl);

    // Use requestAnimationFrame for smooth visual updates
    requestAnimationFrame(() => {
        const newPosition = {
            left: textareaStyle.left,
            top: textareaStyle.top,
            width: textareaStyle.width,
            height: textareaStyle.height,
            display: textareaStyle.display,
            transform: textareaStyle.transform,
            transformOrigin: textareaStyle.transformOrigin,
        };

        // Only apply changes if needed
        for (const [prop, value] of Object.entries(newPosition)) {
            if (overlayEl.style[prop] !== value) {
                overlayEl.style[prop] = value;
            }
        }
    });
}

function setOverlayStyle(inputEl, overlayEl) {
    const textareaStyle = window.getComputedStyle(inputEl);
    overlayEl.style.backgroundColor = "var(--comfy-input-bg)";
    overlayEl.style.position = "absolute";
    overlayEl.style.fontFamily = textareaStyle.fontFamily;
    overlayEl.style.fontSize = textareaStyle.fontSize;
    overlayEl.style.fontWeight = textareaStyle.fontWeight;
    overlayEl.style.lineHeight = textareaStyle.lineHeight;
    overlayEl.style.letterSpacing = textareaStyle.letterSpacing;
    overlayEl.style.whiteSpace = textareaStyle.whiteSpace;
    overlayEl.style.color = "rgba(0,0,0,0)";
    overlayEl.style.padding = textareaStyle.padding;
    overlayEl.style.boxSizing = textareaStyle.boxSizing;
    overlayEl.style.zIndex = "1";
    overlayEl.style.pointerEvents = "auto";
    overlayEl.style.color = "transparent";
    overlayEl.style.overflowX = textareaStyle.overflowX;
    overlayEl.style.overflowY = textareaStyle.overflowY;
    overlayEl.style.whiteSpace = "pre-wrap";
    overlayEl.style.wordWrap = "break-word";
}

async function getValidFiles(type) {
    return await settingsHelper.fetchApi(`${API_PREFIX}/${type}`, {
        method: "GET",
    });
}

async function addTooltips(textarea) {
    const shouldShow = await settingsHelper.getSetting("Tag Tooltips");
    if (!shouldShow) return;

    let currentTooltipTag = null;
    let tooltipTimeout = null;
    let isTyping = false;
    let typingTimeout = null;

    // Add scroll sync
    textarea.addEventListener("scroll", () => {});

    // Add event listeners
    textarea.addEventListener("input", () => {
        isTyping = true;
        if (typingTimeout) {
            clearTimeout(typingTimeout);
        }
        typingTimeout = setTimeout(() => {
            isTyping = false;
        }, 1000); // Reset typing state after 1 second of no input
    });

    textarea.addEventListener("mousemove", (e) => {
        if (isTyping) {
            return;
        }

        // Clear existing timeout
        if (tooltipTimeout) {
            clearTimeout(tooltipTimeout);
        }

        tooltipTimeout = setTimeout(() => {
            // Temporarily hide overlay to get element below
            textarea.style.pointerEvents = "none";
            const elementBelow = document.elementFromPoint(
                e.clientX,
                e.clientY
            );
            textarea.style.pointerEvents = "auto";

            // Check if hovering over tag span in overlay
            if (elementBelow && elementBelow.closest(".tag-span")) {
                const tagSpan = elementBelow.closest(".tag-span");
                const tag = tagSpan.dataset.tag;

                // Only update if different tag
                if (currentTooltipTag !== tag) {
                    hideTagTooltip();
                    showTagTooltip(tagSpan, tag);
                    currentTooltipTag = tag;
                }
            } else if (currentTooltipTag) {
                hideTagTooltip();
                currentTooltipTag = null;
            }
        }, 50); // 50ms debounce
    });

    textarea.addEventListener("mouseout", () => {
        if (tooltipTimeout) {
            clearTimeout(tooltipTimeout);
        }
        hideTagTooltip();
        currentTooltipTag = null;
    });
}
