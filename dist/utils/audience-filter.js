import { DEFAULT_AUDIENCE } from '../constants/audience.js';
import { SECTION_BREAKING_CHANGES, SECTION_ADDED, SECTION_FIXED, SECTION_CHANGED, } from '../constants/changelog.js';
import { validateReleaseResult } from './release-validation.js';
const USER_VISIBLE_CATEGORIES = new Set([
    SECTION_BREAKING_CHANGES,
    SECTION_ADDED,
    SECTION_FIXED,
    SECTION_CHANGED,
]);
/**
 * Filter a release draft according to the selected audience.
 *
 * Changes excluded by the audience policy remain tracked in
 * excludedChanges so release completeness validation still passes.
 */
export function filterReleaseDraftByAudience(draft, audience = DEFAULT_AUDIENCE) {
    // Validate the complete draft before filtering so invalid or unknown
    // assignments cannot be silently hidden by the audience policy.
    validateReleaseResult(draft);
    if (audience === 'all') {
        return draft;
    }
    const includedChanges = draft.changes.filter((change) => USER_VISIBLE_CATEGORIES.has(draft.assignments[change.id]));
    const filteredChanges = draft.changes.filter((change) => !USER_VISIBLE_CATEGORIES.has(draft.assignments[change.id]));
    const assignments = {};
    for (const change of includedChanges) {
        assignments[change.id] = draft.assignments[change.id];
    }
    const filteredExclusions = filteredChanges.map((change) => ({
        change,
        reason: 'filtered',
        detail: 'audience:user',
    }));
    return {
        ...draft,
        changes: includedChanges,
        assignments,
        excludedChanges: [...draft.excludedChanges, ...filteredExclusions],
    };
}
