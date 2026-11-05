/**
 * Safely parse JSON, returning `undefined` on failure.
 * @param input Raw string to parse.
 * @returns Parsed value or `undefined`.
 */
export function safeJsonParse(input) {
    try {
        return JSON.parse(input);
    }
    catch {
        return undefined;
    }
}
