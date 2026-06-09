import { settingsHelper, API_PREFIX } from "./settings.js";
import { hexToRgb } from "./util.js";
import { api } from "../../../scripts/api.js";
import { globalResources } from "./textbox/state.js";
import { enhanceTextarea, syncText } from "./textbox/textareaManager.js";
import { setOverlayStyle } from "./textbox/styleUtils.js";

async function initializeGlobalResources() {
    const [loras, embeddings] = await Promise.all([
        getValidFiles("loras"),
        getValidFiles("embeddings"),
    ]);
    globalResources.validLoras = loras;
    globalResources.validEmbeddings = embeddings;
    await updateTextColors();
}

async function getValidFiles(type) {
    return await settingsHelper.fetchApi(`${API_PREFIX}/${type}`, {
        method: "GET",
    });
}

async function setTextHighlightType() {
    globalResources.highlightType = await settingsHelper.getSetting(
        "Textbox Highlight Type",
    );
}

async function updateTextColors() {
    const [customTextboxColors, wildcardColor, wildcardHighlight] =
        await Promise.all([
            settingsHelper.getSetting("Textbox Colors"),
            settingsHelper.getSetting("Wildcard Color"),
            settingsHelper.getSetting("Wildcard Highlighting"),
        ]);
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

const textareaObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
            if (node.nodeType === 1) {
                if (node.tagName === "TEXTAREA") {
                    enhanceTextarea(node);
                }
                node.querySelectorAll("textarea").forEach((textarea) => {
                    enhanceTextarea(textarea);
                });
            }
        });
    });
});

textareaObserver.observe(document.body, {
    childList: true,
    subtree: true,
});

document.querySelectorAll("textarea").forEach((textarea) => {
    enhanceTextarea(textarea);
});
