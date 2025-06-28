export function hexToRgb(hex) {
    // Remove the hash at the start if it's there
    hex = hex.replace(/^#/, "");

    // Parse the r, g, b values
    let bigint = parseInt(hex, 16);
    let r = (bigint >> 16) & 255;
    let g = (bigint >> 8) & 255;
    let b = bigint & 255;

    return `rgb(${r}, ${g}, ${b})`;
}

export function leadingEdgeDebounce(func, wait) {
    let timeout;
    let lastCallTime = 0;

    return function (...args) {
        const now = Date.now();

        // If the last call was longer ago than the wait period, reset the timeout
        if (now - lastCallTime > wait) {
            lastCallTime = now;
            func.apply(this, args); // Call the function immediately
        }

        clearTimeout(timeout); // Clear any previous timeout

        // Set a new timeout that will reset `lastCallTime` after the wait period
        timeout = setTimeout(() => {
            lastCallTime = 0;
        }, wait);
    };
}

export function escapeHtml(char) {
    switch (char) {
        case "<":
            return "&lt;";
        case ">":
            return "&gt;";
        default:
            return char;
    }
}

export function interpolateColor(color1, color2, factor) {
    const rgb1 = color1.match(/\d+/g).map(Number);
    const rgb2 = color2.match(/\d+/g).map(Number);

    const r = Math.round(rgb1[0] + factor * (rgb2[0] - rgb1[0]));
    const g = Math.round(rgb1[1] + factor * (rgb2[1] - rgb1[1]));
    const b = Math.round(rgb1[2] + factor * (rgb2[2] - rgb1[2]));

    return `rgb(${r}, ${g}, ${b})`;
}

export function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
