import { applyDeterministicClassification } from './deterministic-classification.js';
import { isBucketName, isString } from './is.js';
/**
 * Reconcile sparse editorial edits against an authoritative ReleaseDraft.
 * WHY: The draft is already complete and valid. Unknown IDs are rejected,
 * missing IDs retain source values, and deterministic classification precedence
 * overrides any non-compliant category suggestion.
 * @param draft Authoritative pre-AI release draft.
 * @param editorial Sparse edits returned by the LLM provider.
 * @returns Validated release result and diagnostics.
 */
export function reconcileEditorialOutput(draft, editorial) {
    const diagnostics = [];
    if (!editorial) {
        return {
            result: {
                ...draft,
                changes: draft.changes.map((change) => ({ ...change })),
                assignments: { ...draft.assignments },
                excludedChanges: [...draft.excludedChanges],
            },
            diagnostics,
        };
    }
    // Deep copy changes and assignments to keep pure behavior
    const updatedChanges = draft.changes.map((change) => ({
        ...change,
    }));
    const updatedAssignments = {
        ...draft.assignments,
    };
    const changesById = new Map(updatedChanges.map((change) => [change.id, change]));
    const unknownIds = [];
    for (const [id, edit] of Object.entries(editorial.changes ?? {})) {
        const change = changesById.get(id);
        if (!change) {
            unknownIds.push(id);
            continue;
        }
        // Apply title polishing if non-empty string is provided (normalize single-line)
        if (isString(edit.title) && edit.title.trim().length > 0) {
            change.title = edit.title.replace(/[\r\n]+/g, ' ').trim();
        }
        // Apply category suggestion if valid category name without type assertion
        if (isBucketName(edit.category)) {
            updatedAssignments[change.id] = edit.category;
        }
    }
    if (unknownIds.length > 0) {
        diagnostics.push(`Editorial output contained ${unknownIds.length} unknown ID(s): ${unknownIds.join(', ')}; rejected`);
    }
    // Authoritative hard rule enforcement: deterministic rules (Breaking Changes, Conventional commit types)
    // always take precedence over AI suggestions.
    const finalizedAssignments = applyDeterministicClassification(updatedChanges, updatedAssignments);
    const result = {
        ...draft,
        changes: updatedChanges,
        assignments: finalizedAssignments,
        excludedChanges: [...draft.excludedChanges],
    };
    return {
        result,
        diagnostics,
    };
}
