import { html } from "../highlighting/html.js";
import { SyntaxTokenizer } from "../highlighting/tokenizer.js";
import { SyntaxHighlighter } from "../highlighting/highlighter.js";
import { globalResources } from "./state.js";
import {
    originalTextareaBackgroundColors,
    refreshAuthoredBackgroundColor,
    setOverlayPosition,
    setOverlayStyle,
} from "./styleUtils.js";
import { addTooltips } from "./tooltipManager.js";
import { api } from "../../../../scripts/api.js";

const enhancedTextareas = new WeakSet();

export function syncText(inputEl, overlayEl, tries = 1) {
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
            if (textContent.includes(",")) {
                const tags = textContent.split(",");
                let result = node.outerHTML;
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
                                style: { height: "fit-content" },
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
                        style: { height: "fit-content" },
                        attributes: { "data-tag": trimmedText },
                        escape: false,
                    });
                }
                return clone.outerHTML;
            }
        }
        return "";
    };

    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = highlightedText;
    let result = Array.from(tempDiv.childNodes)
        .map((node) => processNode(node))
        .join("");
    overlayEl.innerHTML = result;
}

function setTextColors(inputEl, overlayEl) {
    syncText(inputEl, overlayEl);
}

export function enhanceTextarea(textarea) {
    if (
        enhancedTextareas.has(textarea) ||
        textarea.closest(".settings-container") ||
        textarea.closest(".form-input")
    ) {
        return;
    }
    enhancedTextareas.add(textarea);

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

    setOverlayPosition(textarea, overlayEl);
    setOverlayStyle(textarea, overlayEl);
    setTextColors(textarea, overlayEl);
    addTooltips(textarea);

    textarea.addEventListener("scroll", () => {
        overlayEl.scrollTop = textarea.scrollTop;
        overlayEl.scrollLeft = textarea.scrollLeft;
    });

    textarea.addEventListener("input", () => {
        syncText(textarea, overlayEl);
        setOverlayStyle(textarea, overlayEl);
    });

    textarea.addEventListener("paste", () => {
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

    const parentObserver = new MutationObserver(() => {
        if (!document.contains(textarea)) {
            overlayEl.remove();
        }
    });

    parentObserver.observe(textarea.parentNode, {
        childList: true,
    });
}
