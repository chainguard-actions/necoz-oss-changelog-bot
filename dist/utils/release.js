// WHY: Preserve the established import surface while keeping parsing,
// commit mapping, and rendering in independently maintainable modules.
export { buildReleaseItemsFromPullRequests } from './release-items.js';
export { buildCommitReleaseChanges, buildIdentifiedReleaseItems, buildReleaseChangeId, deduplicateReleaseChangesByPullRequest, expandReleaseChangesWithSubChanges, identifyReleaseItems, } from './release-items.js';
export { parseReleaseNotes } from './release-notes.js';
export { buildSectionFromRelease } from './release-section.js';
export { validateReleaseResult } from './release-validation.js';
