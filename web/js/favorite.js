import { settingsHelper } from "./settings.js";
import { app } from "../../../scripts/app.js";
import { getFavorites, toggleFavourite } from "./favorites/manager.js";
import { initializeContextMenuObserver } from "./favorites/contextMenu.js";
import { resolveComboFavorite } from "./favorites/publicApi.js";

app.registerExtension({
    name: "SyntaxHighlighting.ToggleFavorite",
    async setup() {
        const existingList = await getFavorites();
        const original_getNodeMenuOptions = app.canvas.getNodeMenuOptions;
        app.canvas.getNodeMenuOptions = function (node) {
            const options = original_getNodeMenuOptions.apply(this, arguments);
            const nullIndex = options.indexOf(null);

            const menuItems = [];

            node.widgets?.forEach((widget) => {
                if (widget.type === "combo") {
                    if (
                        widget.value &&
                        typeof widget.value === "object" &&
                        widget.value.has_submenu
                    ) {
                        return;
                    }
                    try {
                        const { key, label } = resolveComboFavorite(widget);
                        const isFavourite = existingList.includes(key);

                        menuItems.push({
                            content: isFavourite
                                ? `Unfavourite ${label} ☆`
                                : `Favourite ${label} ★`,
                            disabled: false,
                            callback: () => {
                                toggleFavourite(
                                    existingList,
                                    key,
                                    "SyntaxHighlighting.favorites",
                                );
                            },
                            favoriteKey: key,
                        });
                    } catch (error) {
                        console.error(
                            `Error processing value "${widget.value}": ${error}`,
                        );
                    }
                }
            });

            if (menuItems.length === 0) return options;

            menuItems.sort((a, b) => {
                const aIndex = existingList.indexOf(a.favoriteKey);
                const bIndex = existingList.indexOf(b.favoriteKey);
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
                    submenu: { options: menuItems },
                };
            }

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
