// WHY: We normalize titles for fuzzy matching, so we strip any leading
// conventional commit prefix (with optional scope) to compare plain subjects.
import { isBulletLine } from './is.js';
import { INLINE_PR_PRESENT_RE } from '../constants/conventional.js';
import { buildTitleLookup, findTitleMatch } from './title-lookup.js';
/**
 * Check whether a line already includes an inline PR reference (e.g., "(#123)").
 * @param line Markdown line to inspect.
 */
function hasInlinePrReference(line) {
    // Common patterns: "(#123)" or "[#123]" (including markdown links like in [#123](...))
    return INLINE_PR_PRESENT_RE.test(line);
}
/**
 * Split a markdown bullet line into prefix ("- ") and text segments.
 * @param line Markdown line to split.
 * @returns Bullet fragments or `undefined` when the line is not a bullet.
 */
function splitBulletLine(line) {
    const bulletMatch = line.match(/^(\s*[-*]\s+)(.*)$/);
    if (!bulletMatch)
        return undefined;
    const [, prefix, text] = bulletMatch;
    return { prefix, text };
}
/**
 * Attach a PR number reference to bullet lines in a markdown section when a matching
 * title exists in the provided map. Keeps existing references intact.
 * @param md Markdown text that may include bullet list items.
 * @param titleToPr Map of original PR titles to PR numbers.
 * @returns Markdown with missing PR references appended to matching bullets.
 */
export function attachPrNumbers(md, titleToPr, repo) {
    const titleLookup = buildTitleLookup(Object.entries(titleToPr).map(([title, prNumber]) => ({
        titles: [title],
        value: prNumber,
    })), {
        onNormalizedCollision: ({ title, normalizedTitle, existingValue, incomingValue, }) => {
            // WHY: Collisions happen when titles differ only by punctuation/case.
            // Prefer the higher PR number (usually newer) and log for visibility.
            if (incomingValue !== existingValue) {
                console.warn(`Title collision: "${title}" -> "${normalizedTitle}" (PR #${incomingValue} vs #${existingValue})`);
            }
            return Math.max(existingValue, incomingValue);
        },
    });
    const lines = md.split('\n');
    const updated = lines.map((line) => {
        if (!isBulletLine(line) || !/^[-*]\s+/.test(line))
            return line;
        if (hasInlinePrReference(line))
            return line;
        const bulletParts = splitBulletLine(line);
        if (!bulletParts)
            return line;
        const matchedPrNumber = findTitleMatch(bulletParts.text, titleLookup);
        if (!matchedPrNumber)
            return line;
        if (repo) {
            const url = `https://github.com/${repo.owner}/${repo.repo}/pull/${matchedPrNumber}`;
            return `${bulletParts.prefix}${bulletParts.text} in [#${matchedPrNumber}](${url})`;
        }
        return `${bulletParts.prefix}${bulletParts.text} (#${matchedPrNumber})`;
    });
    return updated.join('\n');
}
