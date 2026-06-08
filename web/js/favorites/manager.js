import { settingsHelper } from "../settings.js";
import { SettingsHelper } from "../settings/ComfyHelper.js";
import { api } from "../../../../scripts/api.js";

let favoritesCache = null;

export async function getFavorites() {
    if (favoritesCache === null) {
        favoritesCache = await settingsHelper.getSettingById("SyntaxHighlighting.favorites");
        if (!Array.isArray(favoritesCache)) {
            favoritesCache = [];
        }
    }
    return favoritesCache;
}

export function updateFavoritesCache(newFavorites) {
    favoritesCache = newFavorites;
}

export async function toggleFavourite(existingList, filename, setting = "SyntaxHighlighting.favorites") {
    try {
        const index = existingList.indexOf(filename);
        if (index === -1) {
            existingList.push(filename);
        } else {
            existingList.splice(index, 1);
        }
        updateFavoritesCache(existingList);
        SettingsHelper.PresetOnChange.reloadSettings();
        await api.storeSetting(setting, existingList);
    } catch (error) {
        console.error("Error updating settings:", error);
    }
}
