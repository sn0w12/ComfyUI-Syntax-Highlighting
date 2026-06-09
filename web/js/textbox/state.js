import { hexToRgb } from "../util.js";
import { settingsHelper, API_PREFIX } from "../settings.js";

export class TextHighlightConfig {
    validLoras = null;
    validEmbeddings = null;
    colors = null;
    wildcardColor = null;
    wildcardHighlight = true;
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
        const [customTextboxColors, rawWildcardColor, wildcardHighlight] = await Promise.all([
            settingsHelper.getSetting("Textbox Colors"),
            settingsHelper.getSetting("Wildcard Color"),
            settingsHelper.getSetting("Wildcard Highlighting"),
        ]);
        this.highlightType = await settingsHelper.getSetting("Textbox Highlight Type");
        this.colors = customTextboxColors
            .split("\n")
            .map((color) => (color.charAt(0) === "#" ? hexToRgb(color) : color));
        this.wildcardColor =
            rawWildcardColor.charAt(0) === "#" ? hexToRgb(rawWildcardColor) : rawWildcardColor;
        this.wildcardHighlight = wildcardHighlight;
    }
}

export const config = new TextHighlightConfig();
