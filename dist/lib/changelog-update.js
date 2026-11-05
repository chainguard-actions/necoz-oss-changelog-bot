import { computeChangelog, ensureCompareLinks } from './changelog.js';
import { postprocessSection } from '../utils/section-postprocess.js';
import { sanitizeLLMOutput } from '../utils/sanitize.js';
import { FULL_CHANGELOG_RE } from '../constants/release.js';
function ensureCompareLineInSection(sectionMarkdown, version, compareLine) {
    const compareReference = `[v${version}]:`;
    if (sectionMarkdown.includes(compareReference))
        return sectionMarkdown;
    return `${sectionMarkdown}\n${compareLine}`;
}
function ensureFullChangelogLine(sectionMarkdown, owner, repo, prevRef, releaseRef) {
    if (FULL_CHANGELOG_RE.test(sectionMarkdown))
        return sectionMarkdown;
    const fullChangelogUrl = `https://github.com/${owner}/${repo}/compare/${encodeURIComponent(prevRef)}...${encodeURIComponent(releaseRef)}`;
    return `${sectionMarkdown}\n**Full Changelog**: ${fullChangelogUrl}\n`;
}
/**
 * Sanitize the generated release section and compute the next changelog content.
 * WHY: Keeping post-processing and compare-link logic in one pure function
 * makes the CLI orchestration easier to read and easier to test.
 * @param params Existing changelog state and generated section metadata.
 * @returns Sanitized LLM output and the fully updated changelog text.
 */
export function finalizeChangelogUpdate(params) {
    const { owner, repo, version, prevRef, releaseRef, existing, titleToPr } = params;
    const finalizedLlm = sanitizeLLMOutput(params.llm);
    finalizedLlm.new_section_markdown = postprocessSection(finalizedLlm.new_section_markdown, titleToPr, { owner, repo });
    const { compareLine, unreleasedLine } = ensureCompareLinks({
        owner,
        repo,
        prevTag: prevRef,
        releaseRef,
        version,
        existing,
    });
    finalizedLlm.new_section_markdown = ensureCompareLineInSection(finalizedLlm.new_section_markdown, version, finalizedLlm.compare_link_line ?? compareLine);
    finalizedLlm.new_section_markdown = ensureFullChangelogLine(finalizedLlm.new_section_markdown, owner, repo, prevRef, releaseRef);
    const updated = computeChangelog(existing, {
        version,
        newSection: finalizedLlm.new_section_markdown,
        insertAfterAnchor: finalizedLlm.insert_after_anchor,
        compareLine: undefined,
        unreleasedLine: finalizedLlm.unreleased_compare_update ?? unreleasedLine,
    });
    return {
        llm: finalizedLlm,
        updated,
    };
}
