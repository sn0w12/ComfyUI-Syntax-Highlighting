import { escapeHtml } from "../util.js";

const DEFAULT_OPTIONS = {
    id: null,
    className: null,
    style: null,
    attributes: null,
    escape: true,
    openTag: true,
    closeTag: true,
};

function serializeStyle(style) {
    if (!style) return "";
    if (typeof style === "string") return style;

    return Object.entries(style)
        .filter(([, value]) => value != null)
        .map(([key, value]) => {
            const cssKey = key.replace(
                /[A-Z]/g,
                (match) => `-${match.toLowerCase()}`,
            );
            return `${cssKey}: ${value}`;
        })
        .join("; ");
}

function serializeAttributes(attributes) {
    if (!attributes) return "";

    return Object.entries(attributes)
        .filter(([, value]) => value != null)
        .map(([key, value]) => `${key}="${escapeHtml(String(value))}"`)
        .join(" ");
}

/**
 * Generates an HTML string with the specified element, text, and options.
 * @param {string} elem HTML element to wrap the text in (e.g., "span", "div")
 * @param {string} text Text content to be wrapped
 * @param {Object} options Options for customizing the HTML element
 * @returns {string} The generated HTML string
 */
export function html(elem, text, options = {}) {
    options = { ...DEFAULT_OPTIONS, ...options };

    const id = options.id ? `id="${escapeHtml(String(options.id))}"` : "";
    const className = options.className
        ? `class="${escapeHtml(String(options.className))}"`
        : "";
    const styleValue = serializeStyle(options.style);
    const style = styleValue ? `style="${styleValue}"` : "";
    const attributes = serializeAttributes(options.attributes);
    const tagAttributes = [id, className, style, attributes]
        .filter(Boolean)
        .join(" ");

    const openTag = options.openTag
        ? `<${elem}${tagAttributes ? ` ${tagAttributes}` : ""}>`
        : "";
    const closeTag = options.closeTag ? `</${elem}>` : "";
    const content = options.escape ? escapeHtml(text) : text;
    return `${openTag}${content}${closeTag}`;
}
