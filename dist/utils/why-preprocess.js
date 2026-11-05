import { WHY_MAX_BODY_WITHOUT_TARGET_SECTION, WHY_MIN_MODEL_TRUST_SCORE, WHY_RAW_BODY_SCAN_LIMIT, } from '../constants/why.js';
import { isDependencyUpdateTitle } from './dependency-update.js';
import { buildWhyCandidateSnippets, extractWhyTargetSections, normalizeWhyBody, } from './why-candidates.js';
const STRONG_CANONICAL_SECTION_NAMES = new Set([
    'why',
    'reason',
    'because',
    'motivation',
    'context',
    'background',
    'problem',
    'rationale',
]);
const RATIONALE_MARKER_RE = /\b(why|because|so that|in order to|reason|rationale|motivation|to avoid|to prevent|context|problem)\b|,\s*so\b/i;
const PROBLEM_MARKER_RE = /\b(fix|prevent|avoid|missing|broken|incorrect|regression|failure|bug|issue|risk|support|compatib|performance)\b/i;
const ISSUE_REF_RE = /(?:fix(?:e[sd])?|close[sd]?|resolve[sd]?)\s+#\d+|https:\/\/github\.com\/[^/\s]+\/[^/\s]+\/issues\/\d+/i;
const NON_SIGNAL_RE = /\b(changelog|readme|typo|format|lint|refactor only)\b/i;
const BOT_AUTHOR_RE = /(?:\[bot\]|bot$|renovate|dependabot)/i;
function trustBucketForScore(score) {
    if (score >= 9)
        return 'high';
    if (score >= WHY_MIN_MODEL_TRUST_SCORE)
        return 'medium';
    if (score > 0)
        return 'low';
    return 'none';
}
function scoreCandidateMaterial(sections, candidates, body) {
    const candidateText = candidates.join('\n');
    let score = 0;
    if (sections.some((section) => STRONG_CANONICAL_SECTION_NAMES.has(section.name))) {
        score += 4;
    }
    else if (sections.length > 0) {
        score += 2;
    }
    if (sections.some((section) => section.source === 'label-block' &&
        STRONG_CANONICAL_SECTION_NAMES.has(section.name))) {
        score += 2;
    }
    const hasInlineWhyLabel = sections.some((section) => section.name === 'why' && section.source === 'inline-label');
    // WHY: Inline labels are removed from candidate text, so retain their
    // explicit rationale signal for trust scoring.
    const hasRationaleMarker = RATIONALE_MARKER_RE.test(candidateText) || hasInlineWhyLabel;
    const hasProblemMarker = PROBLEM_MARKER_RE.test(candidateText);
    if (hasRationaleMarker)
        score += 3;
    if (hasProblemMarker)
        score += 2;
    // WHY: Description prose must explicitly signal rationale. An inline Why
    // label is equally explicit even though container extraction removes its
    // Description parent.
    if (hasRationaleMarker &&
        (hasInlineWhyLabel ||
            sections.some((section) => section.name === 'description'))) {
        score += 2;
    }
    if (ISSUE_REF_RE.test(body))
        score += 1;
    if (candidateText.length >= 60)
        score += 1;
    if (candidateText.length > 500)
        score += 1;
    if (containsNonAscii(candidateText) && candidateText.length >= 40) {
        score += 6;
    }
    if (NON_SIGNAL_RE.test(candidateText) &&
        !hasRationaleMarker &&
        !hasProblemMarker) {
        score -= 2;
    }
    return Math.max(score, 0);
}
function hasStrongStructuralSignal(sections) {
    return sections.some((section) => STRONG_CANONICAL_SECTION_NAMES.has(section.name));
}
function containsNonAscii(value) {
    return Array.from(value).some((character) => character.charCodeAt(0) > 127);
}
/**
 * Convert a PR body into bounded WHY candidate snippets with local trust.
 * @param target Changelog PR target.
 * @param details Pull request details fetched from GitHub.
 * @param options Preprocessing limits.
 * @returns Provider-ready item or a skip reason.
 */
export function preprocessWhyPrBody(target, details, options) {
    const title = target.changeId
        ? target.itemText
        : details.title || target.itemText;
    if (isDependencyUpdateTitle(title) ||
        (details.author && BOT_AUTHOR_RE.test(details.author))) {
        return {
            skippedReason: `Skipped PR #${target.prNumber}: automatic maintenance PR`,
            lowTrust: false,
        };
    }
    const body = normalizeWhyBody(details.body).slice(0, WHY_RAW_BODY_SCAN_LIMIT);
    if (!body) {
        return {
            skippedReason: `Skipped PR #${target.prNumber}: empty PR description`,
            lowTrust: true,
        };
    }
    const extracted = extractWhyTargetSections(body);
    if (!extracted.hasTargetSection &&
        body.length > WHY_MAX_BODY_WITHOUT_TARGET_SECTION) {
        return {
            skippedReason: `Skipped PR #${target.prNumber}: PR description too large without target section`,
            lowTrust: true,
        };
    }
    const candidates = buildWhyCandidateSnippets(extracted.sections, body, options.maxCharsPerPr, !extracted.hasTargetSection);
    if (candidates.length === 0) {
        return {
            skippedReason: `Skipped PR #${target.prNumber}: no usable WHY candidate`,
            lowTrust: true,
        };
    }
    const trustScore = scoreCandidateMaterial(extracted.sections, candidates, body);
    const trustBucket = trustBucketForScore(trustScore);
    const requiresHighConfidence = containsNonAscii(candidates.join('\n')) &&
        !hasStrongStructuralSignal(extracted.sections);
    if (trustScore < WHY_MIN_MODEL_TRUST_SCORE) {
        return {
            skippedReason: `Skipped PR #${target.prNumber}: low local trust score (${trustScore})`,
            lowTrust: true,
        };
    }
    return {
        item: {
            prNumber: target.prNumber,
            changeId: target.changeId,
            itemText: target.itemText,
            sectionTitle: target.sectionTitle,
            title,
            candidates,
            trustScore,
            trustBucket,
            requiresHighConfidence,
        },
        lowTrust: false,
    };
}
