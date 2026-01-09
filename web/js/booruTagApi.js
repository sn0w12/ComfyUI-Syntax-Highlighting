export class BooruApi {
    constructor() {
        this.baseUrl = "https://danbooru.donmai.us";
        this.wikiUrl = `${this.baseUrl}/wiki_pages`;
        // Use proxy endpoint to avoid CSP violations
        this.proxyUrl = "/SyntaxHighlighting/wiki";
        this.parser = new DOMParser();

        this.cache = {};
        this.MAX_CACHE_SIZE = 1000;
        this.loadCache();
    }

    loadCache() {
        try {
            const stored = localStorage.getItem("booruTagCache");
            if (stored) {
                this.cache = JSON.parse(stored);
                // Clean up very old entries (older than 30 days)
                const now = Date.now();
                const veryOldThreshold = 30 * 86400000; // 30 days
                for (const key in this.cache) {
                    if (now - this.cache[key].timestamp > veryOldThreshold) {
                        delete this.cache[key];
                    }
                }
                // Trim if still too many
                if (Object.keys(this.cache).length > this.MAX_CACHE_SIZE) {
                    this.trimCache();
                }
            }
        } catch (e) {
            console.warn("Failed to load cache from localStorage", e);
        }
    }

    saveCache() {
        try {
            localStorage.setItem("booruTagCache", JSON.stringify(this.cache));
        } catch (e) {
            console.warn("Failed to save cache to localStorage", e);
        }
    }

    trimCache() {
        const entries = Object.entries(this.cache).sort(
            (a, b) => a[1].timestamp - b[1].timestamp
        );
        const toRemove = entries.slice(0, entries.length - this.MAX_CACHE_SIZE);
        toRemove.forEach(([key]) => delete this.cache[key]);
        this.saveCache();
    }

    cleanTag(tag) {
        return tag
            .replace(/:\d+\.\d+\)/g, "")
            .replace(/^\(+/, "")
            .replaceAll(" ", "_")
            .replaceAll("\\(", "(")
            .replaceAll("\\)", ")")
            .trim();
    }

    async #fetch(url, options = {}) {
        const { responseType = "json", useProxy = false } = options;
        try {
            const response = await fetch(url);
            if (!response.ok) {
                return {
                    success: false,
                    error: {
                        status: response.status,
                        message: `HTTP error! status: ${response.status}`,
                        url: url,
                    },
                };
            }

            let data;
            if (useProxy) {
                // When using proxy, the response is already JSON with {success, data} structure
                const jsonResponse = await response.json();
                if (!jsonResponse.success) {
                    return jsonResponse;
                }
                data = jsonResponse.data;
            } else if (responseType === "html") {
                data = await response.text();
            } else {
                data = await response.json();
            }

            return {
                success: true,
                data: data,
            };
        } catch (error) {
            console.error(`Failed to fetch ${url}:`, error);
            return {
                success: false,
                error: {
                    message: error.message,
                    url: url,
                    original: error,
                },
            };
        }
    }

    getElementById(html, id) {
        const doc = this.parser.parseFromString(html, "text/html");
        const element = doc.querySelector(`#${id}`);
        return element;
    }

    async getTagDescription(tag) {
        const cleanedTag = this.cleanTag(tag);

        // Check cache
        if (this.cache[cleanedTag]) {
            const entry = this.cache[cleanedTag];
            const now = Date.now();
            const staleThreshold = 86400000; // 24 hours

            if (now - entry.timestamp < staleThreshold) {
                // Fresh data
                return entry.description;
            } else {
                // Stale data: return it and revalidate in background
                // Revalidate in background
                (async () => {
                    try {
                        const url = `${this.proxyUrl}/${cleanedTag}`;
                        const response = await this.#fetch(url, {
                            responseType: "html",
                            useProxy: true,
                        });
                        if (response.success) {
                            const body = this.getElementById(
                                response.data,
                                "wiki-page-body"
                            );
                            const newDescription =
                                body?.querySelector("p")?.textContent || null;
                            // Update cache with fresh data
                            this.cache[cleanedTag] = {
                                description: newDescription,
                                timestamp: Date.now(),
                            };
                            this.saveCache();
                            // Trim cache if it exceeds max size
                            if (
                                Object.keys(this.cache).length >
                                this.MAX_CACHE_SIZE
                            ) {
                                this.trimCache();
                            }
                        }
                    } catch (e) {
                        console.warn("Background revalidation failed", e);
                    }
                })();
                return entry.description;
            }
        }

        // No cache: fetch fresh
        const url = `${this.proxyUrl}/${cleanedTag}`;
        const response = await this.#fetch(url, {
            responseType: "html",
            useProxy: true,
        });
        if (!response.success) {
            return null;
        }
        const body = this.getElementById(response.data, "wiki-page-body");
        const description = body?.querySelector("p")?.textContent || null;

        // Cache the result
        this.cache[cleanedTag] = { description, timestamp: Date.now() };
        this.saveCache();

        // Trim cache if it exceeds max size
        if (Object.keys(this.cache).length > this.MAX_CACHE_SIZE) {
            this.trimCache();
        }

        return description;
    }
}
