import { TokenType } from "./tokenizer.js";
import { html } from "./html.js";
import { escapeHtml, interpolateColor, easeInOutCubic } from "../util.js";
import { config } from "../textbox/state.js";

export class SyntaxHighlighter {
    constructor() {
        this.resetState();
    }

    resetState() {
        this.nestingLevel = 0;
        this.spanStack = [];
        this.wildcardStack = [];
        this.uniqueIdCounter = 0;
        this.uniqueIdMap = new Map();
    }

    generateUniqueId(type = "") {
        return `span-${this.uniqueIdCounter++}${type}`;
    }

    processTokens(tokens) {
        this.resetState();
        let result = "";

        for (let i = 0; i < tokens.length; i++) {
            const token = tokens[i];
            result += this.processToken(token, tokens, i);
        }

        result += this.handleUnclosedSpans();
        result = this.applyColorUpdates(result);
        result = this.highlightDuplicates(result, config.errorColor);

        return result;
    }

    processToken(token, tokens, index) {
        const { colors, errorColor } = config;

        switch (token.type) {
            case TokenType.TEXT:
                return escapeHtml(token.value);

            case TokenType.ESCAPE:
                return escapeHtml(token.value);

            case TokenType.INVALID_ESCAPE:
                console.error(
                    `Replace "${token.value}" at position ${token.start} with "\\"`,
                );
                return `${html("span", token.value[0], {
                    style: { backgroundColor: errorColor },
                })}${escapeHtml(token.value[1])}`;

            case TokenType.COMMENT_LINE:
                return this.processCommentLine(token);

            case TokenType.EMBEDDING:
                return this.processEmbedding(token);

            case TokenType.LORA_OPEN:
            case TokenType.PAREN_OPEN:
                return this.processOpenTag(token);

            case TokenType.LORA_CLOSE:
            case TokenType.PAREN_CLOSE:
                return this.processCloseTag(token, tokens, index);

            case TokenType.WILDCARD_OPEN:
                return this.processWildcardOpen(token);

            case TokenType.WILDCARD_CLOSE:
                return this.processWildcardClose(token);

            default:
                return escapeHtml(token.value);
        }
    }

    processCommentLine(token) {
        if (!config.commentHighlight) return escapeHtml(token.value);
        return html("span", token.value, { style: { backgroundColor: config.commentColor } });
    }

    processEmbedding(token) {
        const { colors, errorColor, validEmbeddings } = config;
        const embeddingName = token.value.split(":")[1];
        const isValid = this.validateName(
            "embedding",
            embeddingName,
            validEmbeddings,
        );
        const color = isValid ? colors[0] : errorColor;
        const uniqueId = this.generateUniqueId("-embedding");

        return html("span", token.value, {
            id: uniqueId,
            style: { backgroundColor: color },
        });
    }

    processWildcardOpen(token) {
        if (!config.wildcardHighlight) return escapeHtml(token.value);
        const { wildcardColor } = config;
        const uniqueId = this.generateUniqueId("-wildcard");
        this.wildcardStack.push({ id: uniqueId });
        this.uniqueIdMap.set(uniqueId, wildcardColor);
        return html("span", token.value, {
            id: uniqueId,
            attributes: { "data-color-id": uniqueId },
            closeTag: false,
        });
    }

    processWildcardClose(token) {
        if (
            !config.wildcardHighlight ||
            this.wildcardStack.length === 0
        ) {
            return escapeHtml(token.value);
        }
        this.wildcardStack.pop();
        return html("span", token.value, { openTag: false });
    }

    processOpenTag(token) {
        const { colors } = config;
        let color = colors[this.nestingLevel % colors.length];
        const charType = token.type === TokenType.LORA_OPEN ? "-lora" : "";
        const uniqueId = this.generateUniqueId(charType);

        // Store the span info for later processing
        this.spanStack.push({
            id: uniqueId,
            originalColor: color,
            originalChar: token.value,
            type: token.type,
        });

        this.nestingLevel++;
        this.uniqueIdMap.set(uniqueId, color);

        return html("span", token.value, {
            id: uniqueId,
            attributes: { "data-color-id": uniqueId },
            closeTag: false,
        });
    }

    processCloseTag(token, tokens, index) {
        if (this.nestingLevel === 0) {
            return escapeHtml(token.value);
        }

        const openSpan = this.spanStack[this.spanStack.length - 1];
        const isMatching = this.isMatchingPair(openSpan.type, token.type);

        if (!isMatching) {
            return escapeHtml(token.value);
        }

        this.spanStack.pop();
        this.nestingLevel--;

        if (openSpan.type === TokenType.LORA_OPEN) {
            this.processLoraValidation(openSpan, tokens, index);
        } else {
            if (config.highlightType === "strength") {
                const strength = this.extractStrengthFromTokens(tokens, index);
                const newColor = this.calculateStrengthColor(strength);
                this.uniqueIdMap.set(openSpan.id, newColor);
            }
        }

        return html("span", token.value, { openTag: false });
    }

    highlightDuplicates(highlightedText, errorColor) {
        const strippedText = highlightedText.replace(/<[^>]+>/g, "");
        const segments = strippedText
            .split(",")
            .filter((s) => s !== ",")
            .map((s) => this.processTag(s));

        const exactDuplicates = segments.filter(
            (item, index) => segments.indexOf(item) !== index,
        );

        exactDuplicates.forEach((duplicate) => {
            if (duplicate) {
                const regex = new RegExp(`(^|,\\s*)${duplicate}(?=,|$)`, "g");
                highlightedText = highlightedText.replace(
                    regex,
                    (match, prefix) =>
                        `${prefix}${html("span", duplicate, {
                            style: { backgroundColor: errorColor },
                        })}`,
                );
            }
        });

        return highlightedText;
    }

    processTag(tag) {
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
                    trimmedTag.indexOf(":") + 1,
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

    isMatchingPair(openType, closeType) {
        return (
            (openType === TokenType.LORA_OPEN &&
                closeType === TokenType.LORA_CLOSE) ||
            (openType === TokenType.PAREN_OPEN &&
                closeType === TokenType.PAREN_CLOSE)
        );
    }

    processLoraValidation(openSpan, tokens, index) {
        const loraName = this.extractLoraNameFromTokens(tokens, index);

        if (!this.validateName("lora", loraName, config.validLoras)) {
            this.uniqueIdMap.set(openSpan.id, config.errorColor);
            return;
        }

        // Handle strength calculation if needed
        if (config.highlightType === "strength") {
            const strength = this.extractStrengthFromTokens(tokens, index);
            const newColor = this.calculateStrengthColor(strength);
            this.uniqueIdMap.set(openSpan.id, newColor);
        } else if (config.highlightType === "nesting") {
            this.uniqueIdMap.set(openSpan.id, openSpan.originalColor);
        }
    }

    validateName(type, name, validList) {
        if (!validList || !Array.isArray(validList)) {
            return true; // If we don't have validation data, assume valid
        }
        return validList.some(
            (item) =>
                item.toLowerCase().includes(name.toLowerCase()) ||
                name.toLowerCase().includes(item.toLowerCase()),
        );
    }

    extractLoraNameFromTokens(tokens, closeIndex) {
        for (let i = closeIndex - 1; i >= 0; i--) {
            const token = tokens[i];
            if (token.type === TokenType.TEXT) {
                const loraMatch = token.value.match(/lora:([^,\s:.]+)/i);
                if (loraMatch) {
                    return loraMatch[1];
                }
            }
        }
        return "";
    }

    extractStrengthFromTokens(tokens, closeIndex) {
        for (let i = closeIndex - 1; i >= 0; i--) {
            const token = tokens[i];
            if (token.type === TokenType.TEXT) {
                const strengthMatch = token.value.match(/(\d+(?:\.\d+)?)\s*$/);
                if (strengthMatch) {
                    return parseFloat(strengthMatch[1]);
                }
            }
        }
        return 1.0;
    }

    calculateStrengthColor(strength) {
        const { colors } = config;
        const clampedStrength = Math.max(0, Math.min(2, strength));
        const normalizedStrength = clampedStrength / 2;
        return interpolateColor(
            colors[0],
            colors[colors.length - 1],
            easeInOutCubic(normalizedStrength),
        );
    }

    handleUnclosedSpans() {
        let result = "";
        while (this.spanStack.length > 0) {
            const unclosedSpan = this.spanStack.pop();
            this.uniqueIdMap.set(unclosedSpan.id, config.errorColor);
            result += "</span>";
        }
        while (this.wildcardStack.length > 0) {
            const unclosedWildcard = this.wildcardStack.pop();
            this.uniqueIdMap.set(
                unclosedWildcard.id,
                config.errorColor,
            );
            result += "</span>";
        }
        return result;
    }

    applyColorUpdates(html) {
        const tempDiv = document.createElement("div");
        tempDiv.innerHTML = html;

        tempDiv.querySelectorAll("[data-color-id]").forEach((element) => {
            const colorId = element.getAttribute("data-color-id");
            if (!colorId) {
                return;
            }

            const newColor = this.uniqueIdMap.get(colorId);
            if (newColor) {
                element.style.backgroundColor = newColor;
            }
            element.removeAttribute("data-color-id");
        });

        return tempDiv.innerHTML;
    }
}
