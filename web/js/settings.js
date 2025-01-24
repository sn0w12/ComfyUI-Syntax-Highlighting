import { SettingsHelper } from "./settings/ComfyHelper.js";

export const API_PREFIX = "/SyntaxHighlighter";
export const settingsHelper = new SettingsHelper("SyntaxHighlighter");
const settingsDefinitions = [
    {
        name: "Textbox Colors",
        category: ["SyntaxHighlighter", "Textbox", "TextboxColors"],
        defaultValue: "#559c22\n#229c57\n#229c8b\n#226f9c\n#22479c",
        tooltip: "A list of either rgb or hex colors, one color per line.",
        type: SettingsHelper.ST.MULTILINE,
        onChange: () => SettingsHelper.PresetOnChange.reloadSettings(),
    },
    {
        name: "Textbox Highlight Type",
        category: ["SyntaxHighlighter", "Textbox", "TextboxHighlightType"],
        defaultValue: "strength",
        tooltip:
            "If strength, only the first and last colors will be used. If nesting, all colors will be used.",
        type: SettingsHelper.ST.COMBO(
            { text: "Strength", value: "strength" },
            { text: "Nesting", value: "nesting" }
        ),
        onChange: () => SettingsHelper.PresetOnChange.reloadSettings(),
    },
    {
        name: "Favorite On Top",
        category: ["SyntaxHighlighter", "Combo", "FavoriteOnTop"],
        defaultValue: true,
        tooltip: "Put favorite items over all other items.",
        type: SettingsHelper.ST.BOOLEAN,
        onChange: () => SettingsHelper.PresetOnChange.reloadSettings(),
    },
    {
        name: "Combo Highlight Color",
        category: ["SyntaxHighlighter", "Combo", "ComboHighlightColor"],
        defaultValue: "#008000",
        type: SettingsHelper.ST.COLORPICKER,
        onChange: () => SettingsHelper.PresetOnChange.reloadSettings(),
    },
    {
        name: "Preview Image Delay",
        category: ["SyntaxHighlighter", "Preview Image", "PreviewImageDelay"],
        defaultValue: 200,
        type: SettingsHelper.ST.SLIDER(0, 1000, 1),
        onChange: () => SettingsHelper.PresetOnChange.reloadSettings(),
    },
    {
        name: "Preview Image Padding",
        category: ["SyntaxHighlighter", "Preview Image", "PreviewImagePadding"],
        defaultValue: 20,
        type: SettingsHelper.ST.SLIDER(0, 100, 1),
        onChange: () => SettingsHelper.PresetOnChange.reloadSettings(),
    },
    {
        name: "Preview Image Side",
        category: ["SyntaxHighlighter", "Preview Image", "PreviewImageSide"],
        defaultValue: "left",
        type: SettingsHelper.ST.COMBO(
            { text: "Left", value: "left" },
            { text: "Right", value: "right" }
        ),
        onChange: () => SettingsHelper.PresetOnChange.reloadSettings(),
    },
    {
        name: "Preview Image Size",
        category: ["SyntaxHighlighter", "Preview Image", "PreviewImageSize"],
        defaultValue: 300,
        type: SettingsHelper.ST.SLIDER(100, 1000, 10),
        onChange: () => SettingsHelper.PresetOnChange.reloadSettings(),
    },
];
settingsHelper.addSettings(settingsDefinitions);
