import { LlmError } from './errors.js';
import { buildSectionFromRelease } from '../utils/release-section.js';
import { applyWhyNotesToSection, attachWhyNotesToChanges, extractWhyTargets, extractWhyTargetsFromChanges, } from '../utils/why-targets.js';
import { removeFallbackNote } from '../utils/llm-output-common.js';
import { collectWhyExtractionItems, truncateWhyPayloadItems, } from './why-extraction-items.js';
import { acceptWhyNotes, appendWhyPreview, githubWebHost, } from './why-extraction-notes.js';
import { isError } from '../utils/is.js';
function createEmptyDiagnostics(enabled, engine) {
    return {
        enabled,
        engine,
        selectionDiagnostics: [],
        aiUsed: false,
        targetsFound: 0,
        prBodiesFetched: 0,
        skippedBeforeFetch: 0,
        skippedLowTrust: 0,
        notesRendered: 0,
        fallbackReasons: [],
    };
}
/**
 * Extract and render WHY notes after the changelog section is generated.
 * @param params WHY extraction dependencies and generated output.
 * @returns Updated output and diagnostics.
 */
export async function runWhyExtraction(params) {
    const { cli, llm } = params;
    const diagnostics = createEmptyDiagnostics(cli.why, cli.whyEngine);
    const whyExtractor = params.whyExtractor ?? params.provider;
    const hasWhyExtractorKey = params.hasWhyExtractorKey ?? params.hasProviderKey;
    if (!cli.why)
        return { llm, diagnostics };
    if (cli.noAi) {
        diagnostics.fallbackReasons.push('WHY extraction skipped: --no-ai is set');
        return { llm, diagnostics };
    }
    if (!hasWhyExtractorKey) {
        diagnostics.fallbackReasons.push(`WHY extraction skipped: missing API key for ${whyExtractor.name}`);
        return { llm, diagnostics };
    }
    if (cli.whyMaxPrs === 0) {
        diagnostics.fallbackReasons.push('WHY extraction skipped: whyMaxPrs is 0');
        return { llm, diagnostics };
    }
    const repository = {
        owner: params.owner,
        repo: params.repo,
        host: githubWebHost(params.githubApiBase),
    };
    const activeChanges = params.draft?.changes ?? params.changes;
    const activeAssignments = params.draft?.assignments ?? params.assignments;
    const extractedTargets = activeChanges && activeAssignments
        ? extractWhyTargetsFromChanges(activeChanges, activeAssignments)
        : extractWhyTargets(llm.new_section_markdown, repository);
    diagnostics.targetsFound = extractedTargets.targets.length;
    diagnostics.skippedBeforeFetch = extractedTargets.skippedBeforeFetch;
    const targets = extractedTargets.targets.slice(0, cli.whyMaxPrs);
    if (!targets.length) {
        diagnostics.fallbackReasons.push('WHY extraction skipped: no eligible changelog PRs');
        return { llm, diagnostics };
    }
    const collection = await collectWhyExtractionItems({
        owner: params.owner,
        repo: params.repo,
        token: params.token,
        githubApiBase: params.githubApiBase,
        maxCharsPerPr: cli.whyMaxCharsPerPr,
        fetchPRDetails: params.fetchPRDetails,
    }, targets);
    diagnostics.prBodiesFetched = collection.prBodiesFetched;
    diagnostics.skippedLowTrust += collection.skippedLowTrust;
    diagnostics.fallbackReasons.push(...collection.fallbackReasons);
    const boundedItems = truncateWhyPayloadItems(collection.items);
    if (!boundedItems.length) {
        diagnostics.fallbackReasons.push('WHY extraction skipped: no trusted PR description candidates');
        return {
            llm,
            diagnostics,
            metadataDiagnostics: collection.metadataDiagnostics,
        };
    }
    let providerOutput;
    try {
        providerOutput = await whyExtractor.extractWhyNotes({
            language: cli.language,
            whyLabel: cli.whyLabel,
            items: boundedItems,
        });
        diagnostics.selectionDiagnostics =
            providerOutput.selectionDiagnostics ?? [];
        diagnostics.aiUsed = true;
    }
    catch (error) {
        const message = isError(error) ? error.message : String(error);
        if (cli.failOnLlmError) {
            throw new LlmError(`WHY extraction failed: ${message}`);
        }
        diagnostics.fallbackReasons.push(`WHY extraction skipped: ${message}`);
        return {
            llm,
            diagnostics,
            metadataDiagnostics: collection.metadataDiagnostics,
        };
    }
    // WHY: Jev may enrich a deterministic changelog, but that does not make the
    // changelog-generation fallback note false. Only the generation stage can
    // remove its own fallback annotation.
    let llmAfterWhyEnrichment = llm;
    if (params.changelogAiUsed) {
        const prBodyAfterAiUse = removeFallbackNote(llm.pr_body);
        if (prBodyAfterAiUse !== llm.pr_body) {
            llmAfterWhyEnrichment = { ...llm, pr_body: prBodyAfterAiUse };
        }
    }
    const accepted = acceptWhyNotes(providerOutput, boundedItems, cli.whyConfidence);
    diagnostics.skippedLowTrust += accepted.skippedLowTrust;
    const acceptedNotes = accepted.notes;
    if (!acceptedNotes.length) {
        diagnostics.fallbackReasons.push('WHY extraction skipped: provider returned no trusted notes');
        return {
            llm: llmAfterWhyEnrichment,
            diagnostics,
            metadataDiagnostics: collection.metadataDiagnostics,
        };
    }
    const notesByPr = new Map(acceptedNotes.map((note) => [note.prNumber, note]));
    const targetChanges = params.draft?.changes ?? params.changes;
    const targetAssignments = params.draft?.assignments ?? params.assignments;
    if (targetChanges && targetAssignments) {
        attachWhyNotesToChanges(targetChanges, acceptedNotes, targetAssignments);
    }
    diagnostics.notesRendered = acceptedNotes.length;
    const newSectionMarkdown = params.draft
        ? buildSectionFromRelease({
            ...params.draft,
            whyLabel: cli.whyLabel,
        })
        : applyWhyNotesToSection(llmAfterWhyEnrichment.new_section_markdown, notesByPr, cli.whyLabel, repository);
    return {
        llm: {
            ...llmAfterWhyEnrichment,
            new_section_markdown: newSectionMarkdown,
            pr_body: appendWhyPreview(llmAfterWhyEnrichment.pr_body, acceptedNotes, cli.whyLabel),
        },
        diagnostics,
        metadataDiagnostics: collection.metadataDiagnostics,
    };
}
