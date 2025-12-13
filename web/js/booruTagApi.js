export class BooruApi {
    constructor() {
        this.baseUrl = "https://danbooru.donmai.us";
        this.wikiUrl = `${this.baseUrl}/wiki_pages`;
        // Use proxy endpoint to avoid CSP violations
        this.proxyUrl = "/SyntaxHighlighting/wiki";
        this.parser = new DOMParser();

        this.fetchCache = {};
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
        if (this.fetchCache[url]) {
            return this.fetchCache[url];
        }

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

            this.fetchCache[url] = {
                success: true,
                data: data,
            };
            return this.fetchCache[url];
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
        // Use proxy endpoint to avoid CSP violations
        const url = `${this.proxyUrl}/${cleanedTag}`;
        const response = await this.#fetch(url, { responseType: "html", useProxy: true });
        if (!response.success) {
            return null;
        }
        const body = this.getElementById(response.data, "wiki-page-body");
        return body?.querySelector("p")?.textContent || null;
    }
}
