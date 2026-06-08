import { API_PREFIX } from "../settings.js";

const removingImages = new WeakSet();

export function removeAllPreviewImages() {
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

export async function addPreviewImage(entry, path, settings) {
    const padding = settings["Preview Image Padding"];
    const preferredSide = settings["Preview Image Side"];
    const maxSize = settings["Preview Image Size"];

    const tempImg = new Image();
    tempImg.src = `${API_PREFIX}/images/${path.split("/").pop().split(".")[0]}`;

    await new Promise((resolve) => {
        tempImg.onload = resolve;
        tempImg.onerror = resolve;
    });

    const rect = entry.getBoundingClientRect();
    const extraRightPadding = 10;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

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

    const contextMenus = document.getElementsByClassName("litecontextmenu");
    const menuRects = Array.from(contextMenus).map((menu) => menu.getBoundingClientRect());

    const wouldOverlapWithMenu = (left, top, width, height) => {
        return menuRects.some((menuRect) => {
            return !(left >= menuRect.right || left + width <= menuRect.left || top >= menuRect.bottom || top + height <= menuRect.top);
        });
    };

    const findAlternativePosition = (preferredLeft, top, width, height, isLeftSide) => {
        const overlappingMenus = menuRects.filter((menuRect) => {
            return !(preferredLeft >= menuRect.right || preferredLeft + width <= menuRect.left || top >= menuRect.bottom || top + height <= menuRect.top);
        });
        if (overlappingMenus.length === 0) return preferredLeft;

        for (const menuRect of overlappingMenus) {
            let alternativeLeft;
            if (isLeftSide) {
                alternativeLeft = menuRect.left - width - padding;
                if (alternativeLeft >= 0 && !wouldOverlapWithMenu(alternativeLeft, top, width, height)) {
                    return alternativeLeft;
                }
            } else {
                alternativeLeft = menuRect.right + padding;
                if (alternativeLeft + width <= viewportWidth && !wouldOverlapWithMenu(alternativeLeft, top, width, height)) {
                    return alternativeLeft;
                }
            }
        }
        return null;
    };

    const hasSpaceOnLeft = rect.left >= actualWidth + padding;
    const hasSpaceOnRight = rect.right + actualWidth + padding + extraRightPadding <= viewportWidth;

    let leftPosition;
    let positioned = false;

    if (preferredSide === "left" && hasSpaceOnLeft) {
        leftPosition = rect.left - actualWidth - padding;
        if (!wouldOverlapWithMenu(leftPosition, rect.top, actualWidth, actualHeight)) {
            positioned = true;
        } else {
            const alternativeLeft = findAlternativePosition(leftPosition, rect.top, actualWidth, actualHeight, true);
            if (alternativeLeft !== null) {
                leftPosition = alternativeLeft;
                positioned = true;
            }
        }
    } else if (preferredSide === "right" && hasSpaceOnRight) {
        leftPosition = rect.right + padding + extraRightPadding;
        if (!wouldOverlapWithMenu(leftPosition, rect.top, actualWidth, actualHeight)) {
            positioned = true;
        } else {
            const alternativeLeft = findAlternativePosition(leftPosition, rect.top, actualWidth, actualHeight, false);
            if (alternativeLeft !== null) {
                leftPosition = alternativeLeft;
                positioned = true;
            }
        }
    }

    if (!positioned) {
        if (hasSpaceOnRight) {
            leftPosition = rect.right + padding + extraRightPadding;
            if (!wouldOverlapWithMenu(leftPosition, rect.top, actualWidth, actualHeight)) {
                positioned = true;
            } else {
                const alternativeLeft = findAlternativePosition(leftPosition, rect.top, actualWidth, actualHeight, false);
                if (alternativeLeft !== null) {
                    leftPosition = alternativeLeft;
                    positioned = true;
                }
            }
        }
        if (!positioned && hasSpaceOnLeft) {
            leftPosition = rect.left - actualWidth - padding;
            if (!wouldOverlapWithMenu(leftPosition, rect.top, actualWidth, actualHeight)) {
                positioned = true;
            } else {
                const alternativeLeft = findAlternativePosition(leftPosition, rect.top, actualWidth, actualHeight, true);
                if (alternativeLeft !== null) {
                    leftPosition = alternativeLeft;
                    positioned = true;
                }
            }
        }
    }

    if (!positioned) {
        if (preferredSide === "left" && hasSpaceOnLeft) {
            leftPosition = rect.left - actualWidth - padding;
        } else if (hasSpaceOnRight) {
            leftPosition = rect.right + padding + extraRightPadding;
        } else {
            leftPosition = rect.left - actualWidth - padding;
        }
    }

    let topPosition = rect.top;
    if (rect.top + actualHeight > viewportHeight - padding) {
        topPosition = Math.max(padding, viewportHeight - actualHeight - padding);
    }

    const normalizedPath = path.replace(/\\/g, "/");
    const imageName = normalizedPath.split("/").pop().split(".")[0];

    const preview = document.createElement("img");
    preview.className = "preview-image";
    preview.src = `${API_PREFIX}/images/${imageName}`;
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
