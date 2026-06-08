import { getFavorites } from "./manager.js";
import { settingsHelper, API_PREFIX } from "../settings.js";
import { hexToRgb } from "../util.js";
import { addPreviewImage, removeAllPreviewImages } from "./previewImage.js";

let contextMenuObserver = null;

function brightenColor(color, brightenAmount = 15) {
    if (color.startsWith("#")) {
        const r = parseInt(color.slice(1, 3), 16);
        const g = parseInt(color.slice(3, 5), 16);
        const b = parseInt(color.slice(5, 7), 16);
        return `rgb(${Math.min(255, r + brightenAmount)}, ${Math.min(255, g + brightenAmount)}, ${Math.min(255, b + brightenAmount)})`;
    }
    const rgbValues = color.match(/\d+/g);
    if (!rgbValues) return color;
    const brighterRgb = rgbValues.slice(0, 3).map((val) => Math.min(255, parseInt(val) + brightenAmount));
    return `rgb(${brighterRgb[0]}, ${brighterRgb[1]}, ${brighterRgb[2]})`;
}

function parseNestedMenuItem(str, depth = 0) {
    if (!str.includes("::")) {
        return { name: str, children: [], isLeaf: true, depth };
    }
    const colonIndex = str.indexOf("::");
    const name = str.substring(0, colonIndex);
    const content = str.substring(colonIndex + 3, str.length - 1);
    const children = [];
    let current = "";
    let braceCount = 0;
    let i = 0;
    while (i < content.length) {
        const char = content[i];
        if (char === "{") {
            braceCount++;
            current += char;
        } else if (char === "}") {
            braceCount--;
            current += char;
        } else if (char === "|" && braceCount === 0) {
            if (current.trim()) {
                children.push(parseNestedMenuItem(current.trim(), depth + 1));
            }
            current = "";
        } else {
            current += char;
        }
        i++;
    }
    if (current.trim()) {
        children.push(parseNestedMenuItem(current.trim(), depth + 1));
    }
    return { name, children, isLeaf: false, depth };
}

function extractFilenameFromValue(value) {
    if (!value) return value;
    if (value.includes("::")) {
        const parsed = parseNestedMenuItem(value);
        return parsed.name;
    }
    if (value.includes("\\")) {
        const pathArray = value.split("\\");
        return pathArray[pathArray.length - 1];
    }
    return value;
}

function hasAnyFavoritedChildren(parsed, existingList) {
    if (parsed.isLeaf) {
        return existingList.includes(parsed.name);
    }
    return parsed.children.some((child) => hasAnyFavoritedChildren(child, existingList));
}

function slugify(text) {
    return text.toLowerCase().replace(/\W+/g, "_").replace(/^_+|_+$/g, "");
}

async function addStarsToFavourited(menuEntries, existingList, previewImages, settings) {
    const hoverDelay = settings["Preview Image Hover Delay"];
    const root = document.documentElement;
    const comfyMenuBgColor = hexToRgb(getComputedStyle(root).getPropertyValue("--comfy-menu-bg").trim());

    const checkAndUpdateBackgroundColor = (entry, currentBgColor) => {
        if (currentBgColor == comfyMenuBgColor) {
            entry.classList.add("litemenu-entry-custom");
        }
    };

    const observerConfig = { attributes: true, attributeFilter: ["style"] };
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.type === "attributes" && mutation.attributeName === "style") {
                const entry = mutation.target;
                const currentBgColor = window.getComputedStyle(entry).backgroundColor;
                checkAndUpdateBackgroundColor(entry, currentBgColor);
            }
        });
    });

    const menuContainer = menuEntries[0]?.parentElement;
    if (!menuContainer) return;

    const noneEntry = menuEntries[0]?.getAttribute("data-value").toLowerCase() === "none" ? menuEntries[0] : null;
    const entriesToSort = noneEntry ? Array.from(menuEntries).slice(1) : Array.from(menuEntries);

    const starredEntries = [];
    const unstarredEntries = [];

    let hoverTimer;
    menuContainer.addEventListener("mouseout", () => {
        clearTimeout(hoverTimer);
        removeAllPreviewImages();
    });

    entriesToSort.forEach((entry) => {
        let value = entry.getAttribute("data-value");
        let filename = extractFilenameFromValue(value);
        let isStarred = false;

        if (value && value.includes("::")) {
            const parsed = parseNestedMenuItem(value);
            isStarred = hasAnyFavoritedChildren(parsed, existingList);
        } else {
            isStarred = existingList.includes(filename);
        }

        entry.addEventListener("mouseover", () => {
            removeAllPreviewImages();
            hoverTimer = setTimeout(() => {
                const imageFileName = slugify(filename.split(".")[0]);
                const imageData = previewImages.find((img) => slugify(img.filename) === imageFileName);
                if (imageData) {
                    addPreviewImage(entry, imageData.path, settings);
                }
            }, hoverDelay);
        });

        entry.addEventListener("click", () => {
            clearTimeout(hoverTimer);
            removeAllPreviewImages();
        });

        entry.addEventListener("mouseout", () => {
            clearTimeout(hoverTimer);
            removeAllPreviewImages();
        });

        if (isStarred) {
            const star = document.createElement("span");
            star.innerHTML = "★";
            star.style.marginLeft = "auto";
            star.style.alignSelf = "center";

            const currentDisplay = window.getComputedStyle(entry).display;
            if (currentDisplay !== "none") {
                entry.style.display = "flex";
                entry.style.alignItems = "center";
            }

            if (!entry.querySelector("span")) {
                entry.appendChild(star);
            }

            const currentBgColor = window.getComputedStyle(entry).backgroundColor;
            observer.observe(entry, observerConfig);
            checkAndUpdateBackgroundColor(entry, currentBgColor);

            starredEntries.push(entry);
        } else {
            unstarredEntries.push(entry);
        }
    });

    if (settings["Favorite On Top"]) {
        menuEntries.forEach((entry) => entry.remove());
        if (noneEntry) {
            menuContainer.appendChild(noneEntry);
        }
        starredEntries.forEach((entry) => menuContainer.appendChild(entry));
        unstarredEntries.forEach((entry) => menuContainer.appendChild(entry));
    }
}

export async function initializeContextMenuObserver() {
    const existingList = await getFavorites();
    if (contextMenuObserver) {
        contextMenuObserver.disconnect();
    }
    contextMenuObserver = await observeContextMenu(existingList);
}

async function observeContextMenu(existingList) {
    const settings = await settingsHelper.getMultipleSettings(
        "Combo Highlight Color", "Preview Image Padding", "Preview Image Side",
        "Preview Image Size", "Preview Image Hover Delay", "Favorite On Top"
    );
    const favoriteColor = settings["Combo Highlight Color"];
    const brighterFavoriteColor = brightenColor(favoriteColor);

    const style = document.createElement("style");
    style.textContent = `
        .preview-image {
            position: absolute;
            z-index: 2000;
            border: 1px solid #ccc;
            border-radius: 4px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.2);
            pointer-events: none;
            opacity: 0;
            transition: opacity 0.2s ease-in-out;
        }
        .preview-image.fade-in {
            opacity: 1;
        }
        .preview-image.fade-out {
            opacity: 0;
        }
        .litegraph.litecontextmenu.dark .litemenu-entry.litemenu-entry-custom {
            background-color: ${favoriteColor} !important;
            display: flex;
            align-items: center;
        }
        .litemenu-entry:hover:not(.disabled):not(.separator).litemenu-entry-custom:hover {
            background-color: ${brighterFavoriteColor} !important;
        }
    `;
    document.head.appendChild(style);

    let images;
    try {
        images = await fetch(`${API_PREFIX}/images_json`).then((response) => response.json());
    } catch (error) {
        console.error("Error fetching images.json:", error);
        images = { images: [] };
    }

    const processedMenus = new Set();
    let animationFrameId = null;

    const pollForMenus = () => {
        const currentMenus = document.querySelectorAll(".litecontextmenu");
        currentMenus.forEach((menu) => {
            if (!processedMenus.has(menu)) {
                processedMenus.add(menu);
                const menuEntries = menu.querySelectorAll(".litemenu-entry");
                addStarsToFavourited(menuEntries, existingList, images.images, settings);
            }
        });
        animationFrameId = requestAnimationFrame(pollForMenus);
    };

    animationFrameId = requestAnimationFrame(pollForMenus);
    return {
        disconnect: () => {
            if (animationFrameId) {
                cancelAnimationFrame(animationFrameId);
                animationFrameId = null;
            }
            processedMenus.clear();
        },
    };
}
