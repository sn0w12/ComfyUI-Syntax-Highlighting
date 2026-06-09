import { config } from "./textbox/state.js";
import { enhanceTextarea, syncText } from "./textbox/textareaManager.js";
import { setOverlayStyle } from "./textbox/styleUtils.js";
import { api } from "../../../scripts/api.js";
import { settingsHelper } from "./settings.js";

config.init();

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
    config.init();
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
