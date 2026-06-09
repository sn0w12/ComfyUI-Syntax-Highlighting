/**
 * Global resources
 *
 * @type {Object}
 * @property {Array | null} validLoras - List of valid Lora files
 * @property {Array | null} validEmbeddings - List of valid embedding files
 * @property {Object | null} colors - Mapping of color names to their values
 * @property {string | null} wildcardColor - Color used for wildcards
 * @property {boolean} wildcardHighlight - Whether to highlight wildcards
 * @property {string} highlightType - Type of highlighting to use (e.g., "nesting", "color")
 * @property {string} errorColor - Color used for error highlighting
 */
export const globalResources = {
    validLoras: null,
    validEmbeddings: null,
    colors: null,
    wildcardColor: null,
    wildcardHighlight: true,
    highlightType: "nesting",
    errorColor: "var(--error-text)",
};
