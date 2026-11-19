/**
 * Escape RegExp metacharacters in a string so it can be used as a literal pattern.
 * @param input Input string to escape.
 * @returns Escaped string safe for literal `new RegExp` use.
 */
export function escapeRegExp(input) {
    return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
/**
 * Escape double-quotes for safe embedding in JSON/strings.
 * @param input Input string to escape.
 * @returns String with `"` replaced by `\"`.
 */
export function escapeQuotes(input) {
    return input.replace(/"/g, '\\"');
}
