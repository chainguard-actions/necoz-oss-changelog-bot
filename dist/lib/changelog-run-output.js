/**
 * Finalize generated output and re-finalize only when WHY enrichment changes it.
 * WHY: WHY notes alter section markdown after normal post-processing. Running
 * finalization again preserves compare links and PR references without doing
 * duplicate work when enrichment is disabled or produces no change.
 * @param params Generated output, release context, and workflow adapters.
 * @returns Final LLM payload, full changelog content, and WHY diagnostics.
 */
export async function finalizeChangelogRunOutput(params) {
    if (params.outcome?.kind === 'no-changes') {
        return {
            llm: params.llm,
            updatedChangelog: params.existingChangelog,
            whyDiagnostics: {
                enabled: false,
                engine: params.cli.whyEngine,
                selectionDiagnostics: [],
                aiUsed: false,
                targetsFound: 0,
                prBodiesFetched: 0,
                skippedBeforeFetch: 0,
                skippedLowTrust: 0,
                notesRendered: 0,
                fallbackReasons: [],
            },
            outcome: params.outcome,
        };
    }
    const finalize = (llm) => params.deps.finalizeChangelogUpdate({
        owner: params.owner,
        repo: params.repo,
        version: params.version,
        prevRef: params.prevRef,
        releaseRef: params.releaseRef,
        existing: params.existingChangelog,
        llm,
        titleToPr: params.titleToPr,
    });
    let finalized = finalize(params.llm);
    const whyOutput = await params.deps.runWhyExtraction({
        cli: params.cli,
        llm: finalized.llm,
        draft: params.draft,
        changes: params.draft?.changes,
        assignments: params.draft?.assignments,
        changelogAiUsed: params.changelogAiUsed,
        provider: params.provider,
        hasProviderKey: params.hasProviderKey,
        whyExtractor: params.whyExtractor,
        hasWhyExtractorKey: params.hasWhyExtractorKey,
        owner: params.owner,
        repo: params.repo,
        token: params.token,
        githubApiBase: params.githubApiBase,
        fetchPRDetails: params.deps.fetchPRDetails,
    });
    if (whyOutput.llm !== finalized.llm) {
        finalized = finalize(whyOutput.llm);
    }
    return {
        llm: finalized.llm,
        updatedChangelog: finalized.updated,
        whyDiagnostics: whyOutput.diagnostics,
        outcome: params.outcome,
        metadataDiagnostics: whyOutput.metadataDiagnostics,
    };
}
