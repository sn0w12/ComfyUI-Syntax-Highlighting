export const originalTextareaBackgroundColors = new WeakMap();
export const authoredTextareaBackgroundColors = new WeakMap();

export function calculateSelectorSpecificity(selector) {
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

export function getAuthoredBackgroundColorValue(element, computedStyle) {
    const originalBackgroundColor = originalTextareaBackgroundColors.get(element);
    if (originalBackgroundColor?.value) {
        return originalBackgroundColor.value;
    }

    let winningMatch = null;
    let ruleOrder = 0;

    const considerRule = (rule) => {
        const backgroundColor = rule.style.getPropertyValue("background-color").trim();
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
                important: rule.style.getPropertyPriority("background-color") === "important",
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

            const specificityComparison = compareSpecificity(candidate.specificity, winningMatch.specificity);
            if (specificityComparison > 0 || (specificityComparison === 0 && candidate.order >= winningMatch.order)) {
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
        }
    });

    return winningMatch?.value || computedStyle.getPropertyValue("background-color").trim();
}

export function refreshAuthoredBackgroundColor(element) {
    const computedStyle = window.getComputedStyle(element);
    authoredTextareaBackgroundColors.set(element, getAuthoredBackgroundColorValue(element, computedStyle));
}

const overlayStyleProperties = [
    "border-radius", "box-sizing", "font", "font-family", "font-size", "font-style",
    "font-variant", "font-weight", "letter-spacing", "line-height", "padding",
    "text-align", "text-indent", "text-rendering", "text-transform", "white-space",
    "word-spacing", "overflow-x", "overflow-y",
];

export function copyPresentationStyles(sourceEl, targetEl) {
    const computedStyle = window.getComputedStyle(sourceEl);
    overlayStyleProperties.forEach((property) => {
        targetEl.style.setProperty(property, computedStyle.getPropertyValue(property), computedStyle.getPropertyPriority(property));
    });
    targetEl.style.setProperty("background-color", authoredTextareaBackgroundColors.get(sourceEl) || getAuthoredBackgroundColorValue(sourceEl, computedStyle));
}

export function setOverlayPosition(inputEl, overlayEl) {
    if (!inputEl || !overlayEl || !document.contains(inputEl)) return;
    const textareaStyle = window.getComputedStyle(inputEl);
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
        for (const [prop, value] of Object.entries(newPosition)) {
            if (overlayEl.style[prop] !== value) {
                overlayEl.style[prop] = value;
            }
        }
    });
}

export function setOverlayStyle(inputEl, overlayEl) {
    copyPresentationStyles(inputEl, overlayEl);
    overlayEl.style.position = "absolute";
    overlayEl.style.zIndex = "1";
    overlayEl.style.pointerEvents = "auto";
    overlayEl.style.color = "transparent";
    overlayEl.style.whiteSpace = "pre-wrap";
    overlayEl.style.wordWrap = "break-word";
}
