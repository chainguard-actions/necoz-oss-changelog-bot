import { buildCommitReleaseChanges, buildIdentifiedReleaseItems, buildReleaseItemsFromPullRequests, deduplicateReleaseChangesByPullRequest, expandReleaseChangesWithSubChanges, } from './release-items.js';
import { parseReleaseNotes } from './release-notes.js';
import { buildChangesForClassification } from './classify-pre.js';
import { applyDeterministicClassification, classifyChangesDeterministically, } from './deterministic-classification.js';
import { buildPrUrl, resolvePrFromTitles } from './llm-output-common.js';
/**
 * Build a complete, valid ReleaseDraft before any optional AI calls.
 * WHY: Establishes the Phase 4 deterministic-first invariant. The resulting
 * draft is fully valid and usable even if all AI stages are disabled or fail.
 * @param params Source commits, PR references, and release metadata.
 * @returns Fully classified ReleaseDraft ready for rendering or enrichment.
 */
export function buildReleaseDraft(params) {
    const { version, date, releaseBody, commitList, pullRequestsBySha = {}, titleToPr = {}, owner, repo, } = params;
    let changes = [];
    const excludedChanges = [];
    let sourceChanges = [];
    let fullChangelog = params.fullChangelog;
    let sections = undefined;
    if (releaseBody?.trim()) {
        const parsedRelease = parseReleaseNotes(releaseBody, { owner, repo });
        const identified = buildIdentifiedReleaseItems(parsedRelease.items);
        sourceChanges = [...identified];
        changes = deduplicateReleaseChangesByPullRequest(identified, excludedChanges);
        sections = parsedRelease.sections;
        if (parsedRelease.fullChangelog) {
            fullChangelog = parsedRelease.fullChangelog;
        }
    }
    if (changes.length === 0) {
        sourceChanges = buildCommitReleaseChanges(commitList);
        changes = buildReleaseItemsFromPullRequests(commitList, pullRequestsBySha, excludedChanges);
    }
    if (changes.length === 0 && commitList.length > 0) {
        changes = [...sourceChanges];
    }
    // Backfill PR numbers from title mapping when missing
    for (const change of changes) {
        if (!change.pr) {
            const prNum = resolvePrFromTitles(titleToPr, [
                change.title,
                change.rawTitle,
            ]);
            if (prNum) {
                change.pr = prNum;
                change.url = buildPrUrl(owner, repo, prNum);
            }
        }
    }
    changes = deduplicateReleaseChangesByPullRequest(changes, excludedChanges);
    // WHY: Sub-changes must be expanded after resolving PR numbers via titleToPr
    // and deduping at the PR level, so that any separate release-note items mapped
    // to the same PR are deduplicated first rather than lingering alongside sub-changes.
    changes = expandReleaseChangesWithSubChanges(changes, commitList, pullRequestsBySha, excludedChanges);
    // Deterministic classification across all changes
    const changesForClassification = buildChangesForClassification(changes);
    let assignments = classifyChangesDeterministically(changesForClassification);
    assignments = applyDeterministicClassification(changes, assignments, changesForClassification);
    return {
        version,
        date,
        changes,
        assignments,
        excludedChanges,
        fullChangelog,
        sections,
        sourceChanges,
    };
}
