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

    extractDescriptionFromDText(body) {
        if (!body) return null;
        const text = body.replaceAll("\r\n", "\n").trim();
        if (!text) return null;
        const paragraphs = text.split("\n\n").map((p) => p.trim());
        const first = paragraphs.find((p) => p) ?? "";
        if (!first) return null;
        // Unwrap DText wiki links: [[target|label]] -> label, [[target]] -> target
        const unwrapped = first
            .replace(/\[\[([^|\]]+)\|([^\]]+)\]\]/g, "$2")
            .replace(/\[\[([^\]]+)\]\]/g, "$1");
        const lines = unwrapped
            .split("\n")
            .map((line) => line.replace(/^(h[1-6]\.\s*|[*#\s]+)/, "").trim())
            .filter((line) => line);
        return lines.join(" ").trim() || null;
    }

    extractDescriptionFromHtml(html) {
        const body = this.getElementById(html, "wiki-page-body");
        return body?.querySelector("p")?.textContent || null;
    }

    async fetchDescriptionDirect(cleanedTag) {
        // Direct browser request: the browser TLS fingerprint passes
        // Cloudflare protection that blocks server-side Python clients.
        const url = `${this.baseUrl}/wiki_pages.json?search[title]=${encodeURIComponent(cleanedTag)}`;
        const response = await this.#fetch(url);
        if (!response.success || !Array.isArray(response.data) || response.data.length === 0) {
            return null;
        }
        const page =
            response.data.find((p) => p?.title?.toLowerCase() === cleanedTag.toLowerCase()) ??
            response.data[0];
        return this.extractDescriptionFromDText(page?.body);
    }

    async fetchDescriptionViaProxy(cleanedTag) {
        const url = `${this.proxyUrl}/${encodeURIComponent(cleanedTag)}`;
        const response = await this.#fetch(url, {
            responseType: "html",
            useProxy: true,
        });
        if (!response.success) {
            return null;
        }
        const data = response.data;
        if (typeof data === "string") {
            // Legacy proxy response returning raw HTML.
            return this.extractDescriptionFromHtml(data);
        }
        if (data && typeof data === "object") {
            return data.description ?? this.extractDescriptionFromDText(data.body);
        }
        return null;
    }

    async resolveDescription(cleanedTag) {
        // Prefer the direct request, fall back to the server proxy
        // (e.g. when CSP blocks cross-origin requests from the browser).
        const direct = await this.fetchDescriptionDirect(cleanedTag);
        if (direct !== null) return direct;
        return this.fetchDescriptionViaProxy(cleanedTag);
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
                        const newDescription = await this.resolveDescription(cleanedTag);
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
                    } catch (e) {
                        console.warn("Background revalidation failed", e);
                    }
                })();
                return entry.description;
            }
        }

        // No cache: fetch fresh
        const description = await this.resolveDescription(cleanedTag);

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
