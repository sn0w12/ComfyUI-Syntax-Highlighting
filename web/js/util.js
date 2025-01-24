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
