import { BooruApi } from "../booruTagApi.js";
import { settingsHelper } from "../settings.js";

const booruApi = new BooruApi();
let currentTooltipRequest = null;

export async function showTagTooltip(element, tag) {
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

    tooltip.innerHTML = "<div>Loading...</div>";
    tooltip.style.display = "none";

    let tooltipShown = false;
    const loadingTimeout = setTimeout(() => {
        if (currentTooltipRequest === requestId) {
            tooltip.style.display = "block";
            tooltipShown = true;
        }
    }, 100);

    const description = (await booruApi.getTagDescription(tag)) ?? "No description available.";

    if (currentTooltipRequest !== requestId) {
        clearTimeout(loadingTimeout);
        return;
    }

    clearTimeout(loadingTimeout);

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

export function hideTagTooltip() {
    currentTooltipRequest = null;
    const tooltips = document.querySelectorAll("#tag-tooltip");
    tooltips.forEach((tooltip) => {
        tooltip.remove();
    });
}

export async function addTooltips(textarea) {
    const shouldShow = await settingsHelper.getSetting("Tag Tooltips");
    if (!shouldShow) return;

    let currentTooltipTag = null;
    let tooltipTimeout = null;
    let isTyping = false;
    let typingTimeout = null;

    textarea.addEventListener("scroll", () => {});

    textarea.addEventListener("input", () => {
        isTyping = true;
        if (typingTimeout) {
            clearTimeout(typingTimeout);
        }
        typingTimeout = setTimeout(() => {
            isTyping = false;
        }, 1000);
    });

    textarea.addEventListener("mousemove", (e) => {
        if (isTyping) return;

        if (tooltipTimeout) {
            clearTimeout(tooltipTimeout);
        }

        tooltipTimeout = setTimeout(() => {
            textarea.style.pointerEvents = "none";
            const elementBelow = document.elementFromPoint(e.clientX, e.clientY);
            textarea.style.pointerEvents = "auto";

            if (elementBelow && elementBelow.closest(".tag-span")) {
                const tagSpan = elementBelow.closest(".tag-span");
                const tag = tagSpan.dataset.tag;
                if (currentTooltipTag !== tag) {
                    hideTagTooltip();
                    showTagTooltip(tagSpan, tag);
                    currentTooltipTag = tag;
                }
            } else if (currentTooltipTag) {
                hideTagTooltip();
                currentTooltipTag = null;
            }
        }, 50);
    });

    textarea.addEventListener("mouseout", () => {
        if (tooltipTimeout) {
            clearTimeout(tooltipTimeout);
        }
        hideTagTooltip();
        currentTooltipTag = null;
    });
}
