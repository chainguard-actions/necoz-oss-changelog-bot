import { SECTION_ORDER } from '../constants/changelog.js';
import { CONVENTIONAL_PREFIX_RE } from '../constants/conventional.js';
import { classifyTitleDeterministically } from './deterministic-classification.js';
/**
 * Format a bullet entry with an optional PR reference suffix.
 * WHY: We only include the first PR to keep the output compact and scannable.
 * @param title Bullet title text.
 * @param prNumbers Optional list of PR numbers linked to the commit.
 * @returns Markdown bullet line.
 */
function formatBulletWithPrRef(title, prNumbers) {
    if (!prNumbers || prNumbers.length === 0)
        return `- ${title}`;
    // Only the first PR number is used when multiple PRs exist.
    const [firstPr] = prNumbers;
    return firstPr ? `- ${title} (#${firstPr})` : `- ${title}`;
}
// WHY: Centralize patterns/keywords to avoid scattered magic literals and
// make the classification/stripping logic easier to maintain.
const TYPE_SCOPE_REGEX = CONVENTIONAL_PREFIX_RE;
/**
 * Initialize an empty bucket map keyed by changelog sections.
 * @returns Map of section name to empty string array.
 */
function buildEmptyBuckets() {
    return SECTION_ORDER.reduce((acc, section) => {
        acc[section] = [];
        return acc;
    }, {});
}
/**
 * Parse a `git log --pretty="%h %s"` line into SHA and subject.
 * @param line Single log line.
 * @returns Parsed SHA and subject string.
 */
function parseLogLine(line) {
    const [sha, ...messageParts] = line.split(' ');
    return { sha, subject: messageParts.join(' ').trim() };
}
/**
 * Remove conventional commit prefix from a subject line.
 * @param subject Commit subject line.
 * @returns Subject without `type(scope):` prefix.
 */
function normalizeSubject(subject) {
    return subject.replace(TYPE_SCOPE_REGEX, '').trim();
}
/**
 * Build a deterministic changelog section when LLM output is unavailable.
 * Uses the same canonical classification precedence as release-note output.
 */
export function fallbackSection(params) {
    const { version, date, logs, prMapBySha } = params;
    const lines = (logs || '').split('\n').filter(Boolean);
    const buckets = buildEmptyBuckets();
    for (const logLine of lines) {
        const { sha, subject } = parseLogLine(logLine);
        const normalizedTitle = normalizeSubject(subject);
        const bucket = classifyTitleDeterministically(subject).category;
        // WHY: Subject text like `(#225)` may be an issue. Only confirmed PR metadata is attached.
        const prNumbers = prMapBySha?.[sha];
        buckets[bucket].push(formatBulletWithPrRef(normalizedTitle, prNumbers));
    }
    const output = [`## [v${version}] - ${date}`];
    for (const sectionName of SECTION_ORDER) {
        const sectionItems = buckets[sectionName];
        if (sectionItems?.length) {
            output.push(`### ${sectionName}`, ...sectionItems, '');
        }
    }
    return output.join('\n');
}
