import { hexToRgb } from "../util.js";
import { settingsHelper, API_PREFIX } from "../settings.js";

export class TextHighlightConfig {
    validLoras = null;
    validEmbeddings = null;
    colors = null;
    wildcardColor = null;
    wildcardHighlight = true;
    commentColor = null;
    commentHighlight = true;
    highlightType = "nesting";
    errorColor = "var(--error-text)";

    async init() {
        const [loras, embeddings] = await Promise.all([
            this.#fetchValidList("loras"),
            this.#fetchValidList("embeddings"),
        ]);
        this.validLoras = loras;
        this.validEmbeddings = embeddings;
        await this.#updateTextColors();
    }

    async #fetchValidList(type) {
        return await settingsHelper.fetchApi(`${API_PREFIX}/${type}`, { method: "GET" });
    }

    async #updateTextColors() {
        const [customTextboxColors, rawWildcardColor, wildcardHighlight, rawCommentColor, commentHighlight] = await Promise.all([
            settingsHelper.getSetting("Textbox Colors"),
            settingsHelper.getSetting("Wildcard Color"),
            settingsHelper.getSetting("Wildcard Highlighting"),
            settingsHelper.getSetting("Comment Color"),
            settingsHelper.getSetting("Comment Highlighting"),
        ]);
        this.highlightType = await settingsHelper.getSetting("Textbox Highlight Type");
        this.colors = customTextboxColors
            .split("\n")
            .map((color) => (color.charAt(0) === "#" ? hexToRgb(color) : color));
        this.wildcardColor =
            rawWildcardColor.charAt(0) === "#" ? hexToRgb(rawWildcardColor) : rawWildcardColor;
        this.wildcardHighlight = wildcardHighlight;
        this.commentColor =
            rawCommentColor.charAt(0) === "#" ? hexToRgb(rawCommentColor) : rawCommentColor;
        this.commentHighlight = commentHighlight;
    }
}

export const config = new TextHighlightConfig();
