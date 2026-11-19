import { normalizeSectionCategories } from './section-normalize.js';
import { DEFAULT_PR_LABELS, PR_TITLE_PREFIX, UNRELEASED_ANCHOR, } from '../constants/changelog.js';
import { isNumber, isString } from './is.js';
export function buildPrUrl(owner, repo, prNumber) {
    return `https://github.com/${owner}/${repo}/pull/${prNumber}`;
}
export function buildAutoPrBody(prevRef, releaseRef, isFallback) {
    const prefix = isFallback
        ? 'Auto-generated CHANGELOG (fallback)'
        : 'Auto-generated CHANGELOG';
    return `${prefix}. Range: \`${prevRef}..${releaseRef}\``;
}
export function appendFallbackNote(prBody, fallbackReasons) {
    const reasonNote = fallbackReasons.length
        ? `\n\nNote: Generated without LLM. Reason: ${fallbackReasons.join('; ')}.`
        : `\n\nNote: Generated without LLM.`;
    return `${prBody}${reasonNote}`;
}
/**
 * Remove the generated no-LLM note after a later model call succeeds.
 * @param prBody Pull request body that may end with a fallback note.
 * @returns Pull request body without the stale generated note.
 */
export function removeFallbackNote(prBody) {
    return prBody
        .replace(/\n{2}Note: Generated without LLM\.(?: Reason: [\s\S]*\.)?\s*$/, '')
        .trim();
}
export function resolvePrFromTitles(titleToPr, titles) {
    const candidateKeys = titles
        .filter(isString)
        .filter((title) => title.length > 0)
        .map((title) => title.toLowerCase());
    return candidateKeys
        .map((key) => titleToPr[key])
        .find((value) => isNumber(value));
}
export function applyLlmDefaults(llm, params) {
    const output = { ...llm };
    if (output.new_section_markdown) {
        output.new_section_markdown = normalizeSectionCategories(output.new_section_markdown);
    }
    if (!output.pr_title)
        output.pr_title = `${PR_TITLE_PREFIX}${params.version}`;
    if (!output.pr_body) {
        output.pr_body = buildAutoPrBody(params.prevRef, params.releaseRef, false);
    }
    if (!output.insert_after_anchor) {
        output.insert_after_anchor = UNRELEASED_ANCHOR;
    }
    if (!output.labels)
        output.labels = [...DEFAULT_PR_LABELS];
    return output;
}
