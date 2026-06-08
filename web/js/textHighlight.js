import { settingsHelper, API_PREFIX } from "./settings.js";
import { hexToRgb } from "./util.js";
import { BooruApi } from "./booruTagApi.js";
import { api } from "../../../scripts/api.js";
import { html } from "./highlighting/html.js";
import { SyntaxTokenizer } from "./highlighting/tokenizer.js";
import { SyntaxHighlighter } from "./highlighting/highlighter.js";

const booruApi = new BooruApi();
const enhancedTextareas = new WeakSet();
const originalTextareaBackgroundColors = new WeakMap();
const authoredTextareaBackgroundColors = new WeakMap();

const globalResources = {
    validLoras: null,
    validEmbeddings: null,
    colors: null,
    wildcardColor: null,
    wildcardHighlight: true,
    highlightType: "nesting",
    errorColor: "var(--error-text)",
};

async function initializeGlobalResources() {
    globalResources.validLoras = await getValidFiles("loras");
    globalResources.validEmbeddings = await getValidFiles("embeddings");
    await updateTextColors();
}

async function getValidFiles(type) {
    return await settingsHelper.fetchApi(`${API_PREFIX}/${type}`, {
        method: "GET",
    });
}

initializeGlobalResources();

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
        textarea.closest(".settings-container")
    ) {
        return;
    }
    enhancedTextareas.add(textarea);

    // Create overlay div
    const overlayEl = document.createElement("div");
    overlayEl.className = "input-overlay";
    textarea.parentNode.insertBefore(overlayEl, textarea);

    originalTextareaBackgroundColors.set(textarea, {
        value: textarea.style.getPropertyValue("background-color"),
        backgroundColorPriority:
            textarea.style.getPropertyPriority("background-color"),
    });
    refreshAuthoredBackgroundColor(textarea);

    textarea.style.backgroundColor = "transparent";
    textarea.style.position = "relative";
    textarea.style.zIndex = "1";

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
                        "Overlay element not found during paste operation",
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
        refreshAuthoredBackgroundColor(textarea);
        setOverlayPosition(textarea, overlayEl);
        setOverlayStyle(textarea, overlayEl);
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
    const highlightType = await settingsHelper.getSetting(
        "Textbox Highlight Type",
    );
    globalResources.highlightType = highlightType;
}

async function updateTextColors() {
    const customTextboxColors =
        await settingsHelper.getSetting("Textbox Colors");
    const wildcardColor = await settingsHelper.getSetting("Wildcard Color");
    const wildcardHighlight = await settingsHelper.getSetting(
        "Wildcard Highlighting",
    );
    await setTextHighlightType();
    globalResources.colors = customTextboxColors
        .split("\n")
        .map((color) => (color.charAt(0) === "#" ? hexToRgb(color) : color));
    globalResources.wildcardColor =
        wildcardColor.charAt(0) === "#"
            ? hexToRgb(wildcardColor)
            : wildcardColor;
    globalResources.wildcardHighlight = wildcardHighlight;
}

function setTextColors(inputEl, overlayEl) {
    // Use global resources instead of setting them on the element
    syncText(inputEl, overlayEl);
}

async function syncText(inputEl, overlayEl, tries = 1) {
    const text = inputEl.value;
    overlayEl.textContent = text;

    const colors = globalResources.colors;
    const errorColor = globalResources.errorColor;
    const shouldHighlightGradient = globalResources.highlightType;
    const loraColor = colors ? colors[0] : undefined;
    const wildcardColor = globalResources.wildcardColor;

    if (
        !colors ||
        !errorColor ||
        !loraColor ||
        !wildcardColor ||
        shouldHighlightGradient === undefined
    ) {
        if (tries < 5) {
            setTimeout(() => syncText(inputEl, overlayEl, tries++), tries * 5);
        }
        return;
    }

    const tokenizer = new SyntaxTokenizer();
    const highlighter = new SyntaxHighlighter(globalResources);

    const tokens = tokenizer.tokenize(text);
    let highlightedText = highlighter.processTokens(tokens);

    const processNode = (node) => {
        if (node.nodeType === Node.TEXT_NODE) {
            return node.textContent
                .split(",")
                .map((tag) => {
                    if (!tag.trim()) return tag;
                    return html("span", tag, {
                        className: "tag-span",
                        style: { height: "fit-content" },
                        attributes: { "data-tag": tag.trim() },
                    });
                })
                .join(",");
        } else if (node.nodeType === Node.ELEMENT_NODE) {
            const textContent = node.textContent;

            // If the element contains commas, we need to process it for tag spans
            if (textContent.includes(",")) {
                const tags = textContent.split(",");
                let result = node.outerHTML;

                // Replace each tag in the HTML with a tagged version
                tags.forEach((tag, index) => {
                    if (tag.trim()) {
                        const tagRegex = new RegExp(
                            `(${tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`,
                            "g",
                        );
                        result = result.replace(
                            tagRegex,
                            html("span", "$1", {
                                className: "tag-span",
                                attributes: { "data-tag": tag.trim() },
                                escape: false,
                            }),
                        );
                    }
                });
                return result;
            } else {
                const clone = node.cloneNode(true);
                const trimmedText = textContent.trim();
                if (trimmedText) {
                    return html("span", clone.outerHTML, {
                        className: "tag-span",
                        attributes: { "data-tag": trimmedText },
                        escape: false,
                    });
                }
                return clone.outerHTML;
            }
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

// Track the current tooltip request to allow cancellation
let currentTooltipRequest = null;

async function showTagTooltip(element, tag) {
    // Create a cancellation token for this request
    const requestId = Symbol("tooltip-request");
    currentTooltipRequest = requestId;

    let tooltip = document.getElementById("tag-tooltip");
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

    // Initially set content to loading
    tooltip.innerHTML = "<div>Loading...</div>";
    tooltip.style.display = "none";

    let tooltipShown = false;
    const loadingTimeout = setTimeout(() => {
        if (currentTooltipRequest === requestId) {
            tooltip.style.display = "block";
            tooltipShown = true;
        }
    }, 100);

    const description =
        (await booruApi.getTagDescription(tag)) ?? "No description available.";

    // Check if this request was cancelled while we were fetching
    if (currentTooltipRequest !== requestId) {
        clearTimeout(loadingTimeout);
        return;
    }

    // Clear the loading timeout
    clearTimeout(loadingTimeout);

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

    if (!tooltipShown) {
        tooltip.style.display = "block";
    }
}

function hideTagTooltip() {
    // Cancel any pending tooltip request
    currentTooltipRequest = null;

    const tooltips = document.querySelectorAll("#tag-tooltip");
    tooltips.forEach((tooltip) => {
        tooltip.remove();
    });
}

function calculateSelectorSpecificity(selector) {
    const normalizedSelector = selector.replace(/:not\(([^)]*)\)/g, "$1");
    const idCount = (normalizedSelector.match(/#[\w-]+/g) || []).length;
    const classCount =
        (normalizedSelector.match(/\.[\w\\:-]+/g) || []).length +
        (normalizedSelector.match(/\[[^\]]+\]/g) || []).length +
        (normalizedSelector.match(/:(?!:)[\w-]+(?:\([^)]*\))?/g) || []).length;
    const elementCount =
        (normalizedSelector.match(/(^|[\s>+~])([a-z]+[\w-]*)/gi) || []).length +
        (normalizedSelector.match(/::[\w-]+/g) || []).length;

    return [idCount, classCount, elementCount];
}

function compareSpecificity(left, right) {
    for (let index = 0; index < left.length; index += 1) {
        if (left[index] !== right[index]) {
            return left[index] - right[index];
        }
    }

    return 0;
}

function getAuthoredBackgroundColorValue(element, computedStyle) {
    const originalBackgroundColor =
        originalTextareaBackgroundColors.get(element);
    if (originalBackgroundColor?.value) {
        return originalBackgroundColor.value;
    }

    let winningMatch = null;
    let ruleOrder = 0;

    const considerRule = (rule) => {
        const backgroundColor = rule.style
            .getPropertyValue("background-color")
            .trim();
        if (!backgroundColor) {
            ruleOrder += 1;
            return;
        }

        rule.selectorText.split(",").forEach((selectorPart) => {
            const selector = selectorPart.trim();
            if (!selector || !element.matches(selector)) {
                return;
            }

            const candidate = {
                value: backgroundColor,
                important:
                    rule.style.getPropertyPriority("background-color") ===
                    "important",
                specificity: calculateSelectorSpecificity(selector),
                order: ruleOrder,
            };

            if (!winningMatch) {
                winningMatch = candidate;
                return;
            }

            if (winningMatch.important !== candidate.important) {
                if (candidate.important) {
                    winningMatch = candidate;
                }
                return;
            }

            const specificityComparison = compareSpecificity(
                candidate.specificity,
                winningMatch.specificity,
            );
            if (
                specificityComparison > 0 ||
                (specificityComparison === 0 &&
                    candidate.order >= winningMatch.order)
            ) {
                winningMatch = candidate;
            }
        });

        ruleOrder += 1;
    };

    const visitRules = (rules) => {
        Array.from(rules).forEach((rule) => {
            if (rule instanceof CSSStyleRule) {
                considerRule(rule);
                return;
            }

            if (rule instanceof CSSMediaRule) {
                if (window.matchMedia(rule.conditionText).matches) {
                    visitRules(rule.cssRules);
                }
                return;
            }

            if (rule.cssRules) {
                visitRules(rule.cssRules);
            }
        });
    };

    Array.from(document.styleSheets).forEach((styleSheet) => {
        try {
            if (styleSheet.cssRules) {
                visitRules(styleSheet.cssRules);
            }
        } catch (error) {
            // Ignore cross-origin stylesheets we cannot inspect.
        }
    });

    return (
        winningMatch?.value ||
        computedStyle.getPropertyValue("background-color").trim()
    );
}

function refreshAuthoredBackgroundColor(element) {
    const computedStyle = window.getComputedStyle(element);
    authoredTextareaBackgroundColors.set(
        element,
        getAuthoredBackgroundColorValue(element, computedStyle),
    );
}

const overlayStyleProperties = [
    "border-radius",
    "box-sizing",
    "font",
    "font-family",
    "font-size",
    "font-style",
    "font-variant",
    "font-weight",
    "letter-spacing",
    "line-height",
    "padding",
    "text-align",
    "text-indent",
    "text-rendering",
    "text-transform",
    "white-space",
    "word-spacing",
    "overflow-x",
    "overflow-y",
];

function copyPresentationStyles(sourceEl, targetEl) {
    const computedStyle = window.getComputedStyle(sourceEl);

    overlayStyleProperties.forEach((property) => {
        targetEl.style.setProperty(
            property,
            computedStyle.getPropertyValue(property),
            computedStyle.getPropertyPriority(property),
        );
    });
    targetEl.style.setProperty(
        "background-color",
        authoredTextareaBackgroundColors.get(sourceEl) ||
            getAuthoredBackgroundColorValue(sourceEl, computedStyle),
    );
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
    copyPresentationStyles(inputEl, overlayEl);
    overlayEl.style.position = "absolute";
    overlayEl.style.zIndex = "1";
    overlayEl.style.pointerEvents = "auto";
    overlayEl.style.color = "transparent";
    overlayEl.style.whiteSpace = "pre-wrap";
    overlayEl.style.wordWrap = "break-word";
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
                e.clientY,
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
