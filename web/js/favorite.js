import { SettingsHelper } from "./settings/ComfyHelper.js";
import { hexToRgb, leadingEdgeDebounce } from "./util.js";
import { app } from "../../../scripts/app.js";
import { api } from "../../../scripts/api.js";

const menuCache = new Map();
const settingsHelper = new SettingsHelper("SyntaxHighlighter");
let contextMenuObserver = null;

async function toggleFavourite(
    existingList,
    filename,
    setting = "SyntaxHighlighter.favorites"
) {
    try {
        // Check if the filename is already in the list
        const index = existingList.indexOf(filename);
        if (index === -1) {
            // Add the new filename to the list
            existingList.push(filename);
        } else {
            // Remove the filename from the list
            existingList.splice(index, 1);
        }

        menuCache.clear();
        // Store the updated list back in the settings
        await api.storeSetting(setting, existingList);
    } catch (error) {
        console.error("Error updating settings:", error);
    }
}

app.registerExtension({
    name: "SyntaxHighlighter.ToggleFavorite",
    async setup() {
        let existingList = await settingsHelper.getSettingById(
            "SyntaxHighlighter.favorites"
        );
        if (!Array.isArray(existingList)) {
            existingList = [];
        }

        const original_getNodeMenuOptions = app.canvas.getNodeMenuOptions;
        app.canvas.getNodeMenuOptions = function (node) {
            const options = original_getNodeMenuOptions.apply(this, arguments);
            const nullIndex = options.indexOf(null);

            // Collect menu items first
            const menuItems = [];

            node.widgets.forEach((widget) => {
                if (widget.type === "combo") {
                    const value = widget.value;
                    const isFavourite = existingList.includes(value);

                    const pathArray = value.split("\\");
                    const filename = pathArray[pathArray.length - 1];
                    const displayValue = filename.split(".")[0];

                    menuItems.push({
                        content: isFavourite
                            ? `Unfavourite ${displayValue} ☆`
                            : `Favourite ${displayValue} ★`,
                        disabled: false,
                        callback: () => {
                            toggleFavourite(
                                existingList,
                                filename,
                                "SyntaxHighlighter.favorites"
                            );
                        },
                        originalValue: value,
                    });
                }
            });

            // Sort menu items based on their position in existingList
            menuItems.sort((a, b) => {
                const aIndex = existingList.indexOf(a.originalValue);
                const bIndex = existingList.indexOf(b.originalValue);
                if (aIndex === -1 && bIndex === -1) return 0;
                if (aIndex === -1) return 1;
                if (bIndex === -1) return -1;
                return aIndex - bIndex;
            });

            // Add sorted items to options
            if (nullIndex !== -1) {
                options.splice(nullIndex, 0, ...menuItems);
            } else {
                options.push(...menuItems);
            }

            return options;
        };

        initializeContextMenuObserver();
        settingsHelper.addReloadSettingsListener(initializeContextMenuObserver);
    },
});

function brightenColor(color, brightenAmount = 15) {
    // Handle hex color
    if (color.startsWith("#")) {
        const r = parseInt(color.slice(1, 3), 16);
        const g = parseInt(color.slice(3, 5), 16);
        const b = parseInt(color.slice(5, 7), 16);
        return `rgb(${Math.min(255, r + brightenAmount)}, ${Math.min(
            255,
            g + brightenAmount
        )}, ${Math.min(255, b + brightenAmount)})`;
    }

    // Handle rgb/rgba color
    const rgbValues = color.match(/\d+/g);
    if (!rgbValues) return color;

    const brighterRgb = rgbValues
        .slice(0, 3)
        .map((val) => Math.min(255, parseInt(val) + brightenAmount));

    return `rgb(${brighterRgb[0]}, ${brighterRgb[1]}, ${brighterRgb[2]})`;
}

async function addStarsToFavourited(
    menuEntries,
    existingList,
    previewImages,
    settings
) {
    const hoverDelay = settings["Preview Image Delay"];
    const root = document.documentElement;
    const comfyMenuBgColor = hexToRgb(
        getComputedStyle(root).getPropertyValue("--comfy-menu-bg").trim()
    );

    // Function to check and update the background color
    const checkAndUpdateBackgroundColor = (entry, currentBgColor) => {
        if (currentBgColor == comfyMenuBgColor) {
            entry.classList.add("litemenu-entry-custom");
        }
    };

    const observerConfig = { attributes: true, attributeFilter: ["style"] };
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (
                mutation.type === "attributes" &&
                mutation.attributeName === "style"
            ) {
                const entry = mutation.target;
                const currentBgColor =
                    window.getComputedStyle(entry).backgroundColor;
                checkAndUpdateBackgroundColor(entry, currentBgColor);
            }
        });
    });

    // Get parent container once
    const menuContainer = menuEntries[0]?.parentElement;
    if (!menuContainer) return;

    const noneEntry =
        menuEntries[0]?.getAttribute("data-value").toLowerCase() === "none"
            ? menuEntries[0]
            : null;
    const entriesToSort = noneEntry
        ? Array.from(menuEntries).slice(1)
        : Array.from(menuEntries);

    // Sort entries into starred and unstarred
    const starredEntries = [];
    const unstarredEntries = [];

    let hoverTimer;
    menuContainer.addEventListener("mouseout", () => {
        clearTimeout(hoverTimer);
        removeAllPreviewImages();
    });

    entriesToSort.forEach((entry) => {
        const value = entry.getAttribute("data-value");
        let filename = value;
        if (value !== null && value.includes("\\")) {
            const pathArray = value.split("\\");
            filename = pathArray[pathArray.length - 1];
        }

        entry.addEventListener("mouseover", () => {
            removeAllPreviewImages();

            hoverTimer = setTimeout(() => {
                const imageFileName = filename
                    .split(".")[0]
                    .replaceAll(/\(.*?\)/g, "")
                    .trim()
                    .replaceAll(" ", "_")
                    .toLowerCase();

                const imageData = previewImages.find(
                    (img) =>
                        img.filename
                            .toLowerCase()
                            .trim()
                            .replaceAll(" ", "_") === imageFileName
                );

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

        if (existingList.includes(filename)) {
            // Create star element
            const star = document.createElement("span");
            star.innerHTML = "★";
            star.style.marginLeft = "auto";
            star.style.alignSelf = "center";

            entry.style.display = "flex";
            entry.style.alignItems = "center";

            if (!entry.querySelector("span")) {
                entry.appendChild(star);
            }

            const currentBgColor =
                window.getComputedStyle(entry).backgroundColor;
            observer.observe(entry, observerConfig);
            checkAndUpdateBackgroundColor(entry, currentBgColor);

            starredEntries.push(entry);
        } else {
            unstarredEntries.push(entry);
        }
    });

    if (settings["Favorite On Top"]) {
        // Remove all entries
        menuEntries.forEach((entry) => entry.remove());

        // Add entries in order: none (if exists), starred, unstarred
        if (noneEntry) {
            menuContainer.appendChild(noneEntry);
        }
        starredEntries.forEach((entry) => menuContainer.appendChild(entry));
        unstarredEntries.forEach((entry) => menuContainer.appendChild(entry));
    }
}

async function initializeContextMenuObserver() {
    let existingList = await settingsHelper.getSettingById(
        "SyntaxHighlighter.favorites"
    );
    if (!Array.isArray(existingList)) {
        existingList = [];
    }

    if (contextMenuObserver) {
        contextMenuObserver.disconnect();
    }

    contextMenuObserver = await observeContextMenu(existingList);
}

async function observeContextMenu(existingList) {
    const settings = await settingsHelper.getMultipleSettings(
        "Combo Highlight Color",
        "Preview Image Padding",
        "Preview Image Side",
        "Preview Image Size",
        "Preview Image Delay",
        "Favorite On Top"
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
        images = await fetch(
            "/extensions/ComfyUI-Syntax-Highlight/images/images.json"
        ).then((response) => response.json());
    } catch (error) {
        console.error("Error fetching images.json:", error);
        images = { images: [] };
    }

    const handleMutations = leadingEdgeDebounce(function (mutations) {
        let isPreviewImage = false;
        mutations.forEach((mutation) => {
            mutation.addedNodes.forEach((node) => {
                if (
                    node.classList &&
                    node.classList.contains("preview-image")
                ) {
                    isPreviewImage = true;
                    return;
                }
            });
            mutation.removedNodes.forEach((node) => {
                if (
                    node.classList &&
                    node.classList.contains("preview-image")
                ) {
                    isPreviewImage = true;
                    return;
                }
            });
        });

        if (isPreviewImage) {
            return;
        }

        const litecontextmenu =
            document.getElementsByClassName("litecontextmenu")[0];
        if (litecontextmenu) {
            const menuEntries =
                litecontextmenu.querySelectorAll(".litemenu-entry");
            addStarsToFavourited(
                menuEntries,
                existingList,
                images.images,
                settings
            );
        }
    }, 100);

    const observer = new MutationObserver(handleMutations);

    observer.observe(document, {
        attributes: false,
        childList: true,
        characterData: false,
        subtree: true,
    });

    return observer;
}

async function addPreviewImage(entry, path, settings) {
    const padding = settings["Preview Image Padding"];
    const preferredSide = settings["Preview Image Side"];
    const maxSize = settings["Preview Image Size"];

    const preview = document.createElement("img");
    preview.className = "preview-image";
    preview.src = path;
    preview.style.maxWidth = `${maxSize}px`;
    preview.style.maxHeight = `${maxSize}px`;
    preview.style.position = "fixed";

    const rect = entry.getBoundingClientRect();
    const extraRightPadding = 10;

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // Check if preferred side has enough space
    const hasSpaceOnLeft = rect.left >= maxSize + padding;
    const hasSpaceOnRight = rect.right + maxSize + padding <= viewportWidth;

    if (preferredSide === "left" && hasSpaceOnLeft) {
        preview.style.right = `${viewportWidth - rect.left + padding}px`;
    } else if (preferredSide === "right" && hasSpaceOnRight) {
        preview.style.left = `${rect.right + padding + extraRightPadding}px`;
    } else if (hasSpaceOnLeft) {
        // Fallback to left if there's space
        preview.style.right = `${viewportWidth - rect.left + padding}px`;
    } else if (hasSpaceOnRight) {
        // Fallback to right if there's space
        preview.style.left = `${rect.right + padding + extraRightPadding}px`;
    } else {
        // If no space on either side, default to left
        preview.style.right = `${viewportWidth - rect.left + padding}px`;
    }

    const estimatedHeight = Math.min(maxSize, preview.naturalHeight || maxSize);
    let topPosition = rect.top;

    if (rect.top + estimatedHeight > viewportHeight - padding) {
        topPosition = viewportHeight - estimatedHeight - padding;
    }

    preview.style.top = `${topPosition}px`;
    document.body.appendChild(preview);

    setTimeout(() => {
        preview.classList.add("fade-in");
    }, 100);
}

const removingImages = new WeakSet();
function removeAllPreviewImages() {
    const previewImages = document.querySelectorAll(".preview-image");

    previewImages.forEach((img) => {
        if (removingImages.has(img)) return;

        removingImages.add(img);
        img.classList.add("fade-out");
        img.classList.remove("fade-in");

        setTimeout(() => {
            img.remove();
            removingImages.delete(img);
        }, 250);
    });
}
