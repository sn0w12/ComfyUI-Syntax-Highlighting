import { settingsHelper, API_PREFIX } from "./settings.js";
import { hexToRgb, leadingEdgeDebounce } from "./util.js";
import { app } from "../../../scripts/app.js";
import { api } from "../../../scripts/api.js";

let contextMenuObserver = null;
let favoritesCache = null;

async function getFavorites() {
    if (favoritesCache === null) {
        favoritesCache = await settingsHelper.getSettingById(
            "SyntaxHighlighting.favorites"
        );
        if (!Array.isArray(favoritesCache)) {
            favoritesCache = [];
        }
    }
    return favoritesCache;
}

function updateFavoritesCache(newFavorites) {
    favoritesCache = newFavorites;
}

async function toggleFavourite(
    existingList,
    filename,
    setting = "SyntaxHighlighting.favorites"
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

        updateFavoritesCache(existingList);
        SettingsHelper.PresetOnChange.reloadSettings();
        // Store the updated list back in the settings
        await api.storeSetting(setting, existingList);
    } catch (error) {
        console.error("Error updating settings:", error);
    }
}

app.registerExtension({
    name: "SyntaxHighlighting.ToggleFavorite",
    async setup() {
        const existingList = await getFavorites();
        const original_getNodeMenuOptions = app.canvas.getNodeMenuOptions;
        app.canvas.getNodeMenuOptions = function (node) {
            const options = original_getNodeMenuOptions.apply(this, arguments);
            const nullIndex = options.indexOf(null);

            // Collect menu items first
            const menuItems = [];

            node.widgets?.forEach((widget) => {
                if (widget.type === "combo") {
                    const value = widget.value;
                    if (value.has_submenu) {
                        // If the widget has a submenu, we don't add it to the main menu
                        return;
                    }
                    const isFavourite = existingList.includes(value);

                    try {
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
                                    "SyntaxHighlighting.favorites"
                                );
                            },
                            originalValue: value,
                        });
                    } catch (error) {
                        console.error(
                            `Error processing value "${value}": ${error}`
                        );
                    }
                }
            });

            if (menuItems.length === 0) {
                return options;
            }

            // Sort menu items based on their position in existingList
            menuItems.sort((a, b) => {
                const aIndex = existingList.indexOf(a.originalValue);
                const bIndex = existingList.indexOf(b.originalValue);
                if (aIndex === -1 && bIndex === -1) return 0;
                if (aIndex === -1) return 1;
                if (bIndex === -1) return -1;
                return aIndex - bIndex;
            });

            let menuItem = menuItems[0];
            if (menuItems.length > 1) {
                menuItem = {
                    content: "Favourite",
                    disabled: false,
                    has_submenu: true,
                    submenu: {
                        options: menuItems,
                    },
                };
            }

            // Add sorted items to options
            if (nullIndex !== -1) {
                options.splice(nullIndex, 0, menuItem);
            } else {
                options.push(menuItem);
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

function parseNestedMenuItem(str, depth = 0) {
    if (!str.includes("::")) {
        return { name: str, children: [], isLeaf: true, depth };
    }

    const colonIndex = str.indexOf("::");
    const name = str.substring(0, colonIndex);
    const content = str.substring(colonIndex + 3, str.length - 1); // Remove :: and trailing }

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

    // Handle nested menu items
    if (value.includes("::")) {
        const parsed = parseNestedMenuItem(value);
        return parsed.name; // Return the parent category name
    }

    // Handle regular file paths
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

    return parsed.children.some((child) =>
        hasAnyFavoritedChildren(child, existingList)
    );
}

async function addStarsToFavourited(
    menuEntries,
    existingList,
    previewImages,
    settings
) {
    const hoverDelay = settings["Preview Image Hover Delay"];
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
        let value = entry.getAttribute("data-value");
        let filename = extractFilenameFromValue(value);
        let isStarred = false;

        // Check if this entry or any of its children should be starred
        if (value && value.includes("::")) {
            const parsed = parseNestedMenuItem(value);
            isStarred = hasAnyFavoritedChildren(parsed, existingList);
        } else {
            isStarred = existingList.includes(filename);
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

        if (isStarred) {
            // Create star element
            const star = document.createElement("span");
            star.innerHTML = "★";
            star.style.marginLeft = "auto";
            star.style.alignSelf = "center";

            // Only set display flex if the entry is not hidden
            const currentDisplay = window.getComputedStyle(entry).display;
            if (currentDisplay !== "none") {
                entry.style.display = "flex";
                entry.style.alignItems = "center";
            }

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
    const existingList = await getFavorites();

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
        "Preview Image Hover Delay",
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
        images = await fetch(`${API_PREFIX}/images_json`).then((response) =>
            response.json()
        );
    } catch (error) {
        console.error("Error fetching images.json:", error);
        images = { images: [] };
    }

    const handleMutations = leadingEdgeDebounce(function (mutations) {
        let isContextMenu = false;
        mutations.forEach((mutation) => {
            if (mutation.target.classList.contains("litecontextmenu")) {
                isContextMenu = true;
            }
        });

        if (!isContextMenu) {
            return;
        }

        const litecontextmenus =
            document.getElementsByClassName("litecontextmenu");
        if (litecontextmenus) {
            Array.from(litecontextmenus).forEach((litecontextmenu) => {
                const menuEntries =
                    litecontextmenu.querySelectorAll(".litemenu-entry");
                addStarsToFavourited(
                    menuEntries,
                    existingList,
                    images.images,
                    settings
                );
            });
        }
    }, 50);

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

    // Create temporary image to get dimensions
    const tempImg = new Image();
    tempImg.src = `${API_PREFIX}/images/${path.split("/").pop().split(".")[0]}`;

    // Wait for image to load to get actual dimensions
    await new Promise((resolve) => {
        tempImg.onload = resolve;
        tempImg.onerror = resolve;
    });

    const rect = entry.getBoundingClientRect();
    const extraRightPadding = 10;

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // Calculate actual display dimensions while maintaining aspect ratio
    const originalWidth = tempImg.naturalWidth || maxSize;
    const originalHeight = tempImg.naturalHeight || maxSize;
    const aspectRatio = originalWidth / originalHeight;

    let actualWidth, actualHeight;
    if (originalWidth > originalHeight) {
        actualWidth = Math.min(maxSize, originalWidth);
        actualHeight = actualWidth / aspectRatio;
    } else {
        actualHeight = Math.min(maxSize, originalHeight);
        actualWidth = actualHeight * aspectRatio;
    }

    // Get all context menus to avoid overlapping
    const contextMenus = document.getElementsByClassName("litecontextmenu");
    const menuRects = Array.from(contextMenus).map((menu) =>
        menu.getBoundingClientRect()
    );

    // Function to check if a position would overlap with any context menu
    const wouldOverlapWithMenu = (left, top, width, height) => {
        return menuRects.some((menuRect) => {
            return !(
                left >= menuRect.right ||
                left + width <= menuRect.left ||
                top >= menuRect.bottom ||
                top + height <= menuRect.top
            );
        });
    };

    // Function to find alternative position beside overlapping menus
    const findAlternativePosition = (
        preferredLeft,
        top,
        width,
        height,
        isLeftSide
    ) => {
        const overlappingMenus = menuRects.filter((menuRect) => {
            return !(
                preferredLeft >= menuRect.right ||
                preferredLeft + width <= menuRect.left ||
                top >= menuRect.bottom ||
                top + height <= menuRect.top
            );
        });

        if (overlappingMenus.length === 0) {
            return preferredLeft;
        }

        // Try to position beside the overlapping menus
        for (const menuRect of overlappingMenus) {
            let alternativeLeft;

            if (isLeftSide) {
                // Try to the left of the overlapping menu
                alternativeLeft = menuRect.left - width - padding;
                if (
                    alternativeLeft >= 0 &&
                    !wouldOverlapWithMenu(alternativeLeft, top, width, height)
                ) {
                    return alternativeLeft;
                }
            } else {
                // Try to the right of the overlapping menu
                alternativeLeft = menuRect.right + padding;
                if (
                    alternativeLeft + width <= viewportWidth &&
                    !wouldOverlapWithMenu(alternativeLeft, top, width, height)
                ) {
                    return alternativeLeft;
                }
            }
        }

        return null; // No alternative position found
    };

    // Check if sides have enough space
    const hasSpaceOnLeft = rect.left >= actualWidth + padding;
    const hasSpaceOnRight =
        rect.right + actualWidth + padding + extraRightPadding <= viewportWidth;

    let leftPosition;
    let positioned = false;

    // Try preferred side first
    if (preferredSide === "left" && hasSpaceOnLeft) {
        leftPosition = rect.left - actualWidth - padding;
        if (
            !wouldOverlapWithMenu(
                leftPosition,
                rect.top,
                actualWidth,
                actualHeight
            )
        ) {
            positioned = true;
        } else {
            // Try to find alternative position on the left side
            const alternativeLeft = findAlternativePosition(
                leftPosition,
                rect.top,
                actualWidth,
                actualHeight,
                true
            );
            if (alternativeLeft !== null) {
                leftPosition = alternativeLeft;
                positioned = true;
            }
        }
    } else if (preferredSide === "right" && hasSpaceOnRight) {
        leftPosition = rect.right + padding + extraRightPadding;
        if (
            !wouldOverlapWithMenu(
                leftPosition,
                rect.top,
                actualWidth,
                actualHeight
            )
        ) {
            positioned = true;
        } else {
            // Try to find alternative position on the right side
            const alternativeLeft = findAlternativePosition(
                leftPosition,
                rect.top,
                actualWidth,
                actualHeight,
                false
            );
            if (alternativeLeft !== null) {
                leftPosition = alternativeLeft;
                positioned = true;
            }
        }
    }

    // Try fallback sides if preferred side didn't work
    if (!positioned) {
        if (hasSpaceOnRight) {
            leftPosition = rect.right + padding + extraRightPadding;
            if (
                !wouldOverlapWithMenu(
                    leftPosition,
                    rect.top,
                    actualWidth,
                    actualHeight
                )
            ) {
                positioned = true;
            } else {
                const alternativeLeft = findAlternativePosition(
                    leftPosition,
                    rect.top,
                    actualWidth,
                    actualHeight,
                    false
                );
                if (alternativeLeft !== null) {
                    leftPosition = alternativeLeft;
                    positioned = true;
                }
            }
        }

        if (!positioned && hasSpaceOnLeft) {
            leftPosition = rect.left - actualWidth - padding;
            if (
                !wouldOverlapWithMenu(
                    leftPosition,
                    rect.top,
                    actualWidth,
                    actualHeight
                )
            ) {
                positioned = true;
            } else {
                const alternativeLeft = findAlternativePosition(
                    leftPosition,
                    rect.top,
                    actualWidth,
                    actualHeight,
                    true
                );
                if (alternativeLeft !== null) {
                    leftPosition = alternativeLeft;
                    positioned = true;
                }
            }
        }
    }

    // Final fallback - use preferred side regardless of overlap
    if (!positioned) {
        if (preferredSide === "left" && hasSpaceOnLeft) {
            leftPosition = rect.left - actualWidth - padding;
        } else if (hasSpaceOnRight) {
            leftPosition = rect.right + padding + extraRightPadding;
        } else {
            leftPosition = rect.left - actualWidth - padding;
        }
    }

    // Calculate top position
    let topPosition = rect.top;
    if (rect.top + actualHeight > viewportHeight - padding) {
        topPosition = Math.max(
            padding,
            viewportHeight - actualHeight - padding
        );
    }

    // Create and position the actual preview image
    const preview = document.createElement("img");
    preview.className = "preview-image";
    preview.src = `${API_PREFIX}/images/${path.split("/").pop().split(".")[0]}`;
    preview.style.maxWidth = `${maxSize}px`;
    preview.style.maxHeight = `${maxSize}px`;
    preview.style.position = "fixed";
    preview.style.left = `${leftPosition}px`;
    preview.style.top = `${topPosition}px`;

    document.body.appendChild(preview);

    setTimeout(() => {
        preview.classList.add("fade-in");
    }, 10);
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
