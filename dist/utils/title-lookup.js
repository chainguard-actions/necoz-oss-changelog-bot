import { normalizeTitle, stripConventionalPrefix, } from './title-normalize.js';
import { isUndefined } from './is.js';
function buildDirectKeys(title) {
    const strippedTitle = stripConventionalPrefix(title);
    return [
        ...new Set([
            title,
            title.toLowerCase(),
            strippedTitle,
            strippedTitle.toLowerCase(),
        ]),
    ];
}
/**
 * Build direct and normalized title lookup tables for later fuzzy matching.
 * @param entries Title/value pairs to index.
 * @param options Optional collision policy for normalized keys.
 * @returns Lookup tables that support exact and fuzzy title resolution.
 */
export function buildTitleLookup(entries, options = {}) {
    const direct = new Map();
    const normalized = new Map();
    for (const entry of entries) {
        for (const title of entry.titles) {
            if (!title)
                continue;
            for (const key of buildDirectKeys(title)) {
                direct.set(key, entry.value);
            }
            const normalizedTitle = normalizeTitle(title);
            if (!normalizedTitle)
                continue;
            const existingValue = normalized.get(normalizedTitle);
            if (!isUndefined(existingValue) && options.onNormalizedCollision) {
                const resolvedValue = options.onNormalizedCollision({
                    title,
                    normalizedTitle,
                    existingValue,
                    incomingValue: entry.value,
                });
                if (!isUndefined(resolvedValue)) {
                    normalized.set(normalizedTitle, resolvedValue);
                }
                continue;
            }
            if (isUndefined(existingValue)) {
                normalized.set(normalizedTitle, entry.value);
            }
        }
    }
    return { direct, normalized };
}
/**
 * Resolve a title against direct and normalized lookup tables.
 * @param title Raw title to find.
 * @param lookup Lookup tables built by `buildTitleLookup`.
 * @param options Matching options.
 * @returns Matched value when one is found.
 */
export function findTitleMatch(title, lookup, options = {}) {
    if (!title)
        return undefined;
    const normalizedTitle = normalizeTitle(title);
    if (normalizedTitle) {
        // WHY: Collision resolution is recorded in the normalized table, so exact
        // normalized hits must win over direct-key matches to keep lookups stable
        // across punctuation, casing, and conventional-prefix variants.
        const exactMatch = lookup.normalized.get(normalizedTitle);
        if (!isUndefined(exactMatch))
            return exactMatch;
    }
    for (const key of buildDirectKeys(title)) {
        const directMatch = lookup.direct.get(key);
        if (!isUndefined(directMatch))
            return directMatch;
    }
    if (!normalizedTitle)
        return undefined;
    const minRelativePrefixLength = options.minRelativePrefixLength ?? 0;
    for (const [lookupTitle, value] of lookup.normalized) {
        const minLength = Math.min(lookupTitle.length, normalizedTitle.length);
        const maxLength = Math.max(lookupTitle.length, normalizedTitle.length);
        if (maxLength === 0)
            continue;
        if (minLength / maxLength < minRelativePrefixLength)
            continue;
        if (normalizedTitle.startsWith(lookupTitle) ||
            lookupTitle.startsWith(normalizedTitle)) {
            return value;
        }
    }
    return undefined;
}
