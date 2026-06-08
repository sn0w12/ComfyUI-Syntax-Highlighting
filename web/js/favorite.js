import { settingsHelper } from "./settings.js";
import { SettingsHelper } from "./settings/ComfyHelper.js";
import { app } from "../../../scripts/app.js";
import { api } from "../../../scripts/api.js";
import { getFavorites, toggleFavourite } from "./favoriteManager.js";
import { initializeContextMenuObserver } from "./contextMenuEnhancer.js";

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
                    const value = widget.value;
                    if (value.has_submenu) return;
                    const isFavourite = existingList.includes(value);

                    try {
                        const pathArray = value.split("\\");
                        const filename = pathArray[pathArray.length - 1];
                        const displayValue = filename.split(".")[0];

                        menuItems.push({
                            content: isFavourite ? `Unfavourite ${displayValue} ☆` : `Favourite ${displayValue} ★`,
                            disabled: false,
                            callback: () => {
                                toggleFavourite(existingList, filename, "SyntaxHighlighting.favorites");
                            },
                            originalValue: value,
                        });
                    } catch (error) {
                        console.error(`Error processing value "${value}": ${error}`);
                    }
                }
            });

            if (menuItems.length === 0) return options;

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
