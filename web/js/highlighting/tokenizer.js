export const TokenType = {
    TEXT: "text",
    LORA_OPEN: "lora_open",
    LORA_CLOSE: "lora_close",
    PAREN_OPEN: "paren_open",
    PAREN_CLOSE: "paren_close",
    EMBEDDING: "embedding",
    ESCAPE: "escape",
    INVALID_ESCAPE: "invalid_escape",
};

export class SyntaxTokenizer {
    constructor() {
        this.patterns = [
            { type: TokenType.ESCAPE, regex: /\\[()]/g },
            { type: TokenType.INVALID_ESCAPE, regex: /\/[()]/g },
            { type: TokenType.EMBEDDING, regex: /embedding:[^,\s]+/gi },
            { type: TokenType.LORA_OPEN, regex: /<(?=lora:)/gi },
            { type: TokenType.LORA_CLOSE, regex: />/g },
            { type: TokenType.PAREN_OPEN, regex: /\(/g },
            { type: TokenType.PAREN_CLOSE, regex: /\)/g },
        ];
    }

    tokenize(text) {
        const tokens = [];
        const matches = [];

        for (const pattern of this.patterns) {
            pattern.regex.lastIndex = 0; // Reset regex
            let match;
            while ((match = pattern.regex.exec(text)) !== null) {
                matches.push({
                    type: pattern.type,
                    value: match[0],
                    start: match.index,
                    end: match.index + match[0].length,
                });
            }
        }

        // Sort by start position, then by type priority (escapes first)
        matches.sort((a, b) => {
            if (a.start !== b.start) return a.start - b.start;
            const priority = {
                escape: 0,
                invalid_escape: 1,
                paren_open: 2,
                paren_close: 2,
            };
            return (priority[a.type] || 3) - (priority[b.type] || 3);
        });

        // Filter out overlapping matches, keeping higher priority ones
        const filteredMatches = [];
        for (const match of matches) {
            const overlaps = filteredMatches.some(
                (existing) =>
                    match.start < existing.end && match.end > existing.start
            );
            if (!overlaps) {
                filteredMatches.push(match);
            }
        }

        let lastIndex = 0;
        for (const match of filteredMatches) {
            if (match.start > lastIndex) {
                tokens.push({
                    type: TokenType.TEXT,
                    value: text.slice(lastIndex, match.start),
                    start: lastIndex,
                    end: match.start,
                });
            }

            tokens.push(match);
            lastIndex = match.end;
        }

        if (lastIndex < text.length) {
            tokens.push({
                type: TokenType.TEXT,
                value: text.slice(lastIndex),
                start: lastIndex,
                end: text.length,
            });
        }

        return tokens;
    }
}
