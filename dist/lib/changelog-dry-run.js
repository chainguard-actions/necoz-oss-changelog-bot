import { formatDryRunDiagnostics, formatDryRunJsonReport, } from '../utils/dry-run-diagnostics.js';
function getPromptCustomizationReason(input) {
    if (!input.requested)
        return 'not requested';
    if (!input.resolved)
        return 'no usable instructions after normalization';
    if (input.noAi)
        return 'not applied because --no-ai skips provider generation';
    if (!input.hasProviderKey) {
        return 'not applied because provider API key is missing';
    }
    if (!input.aiUsed) {
        return 'not applied because provider generation did not complete';
    }
    return 'applied to provider full generation';
}
/**
 * Print dry-run diagnostics followed by the generated changelog.
 * @param params Generation state, diagnostics, output, and logger.
 * @returns Nothing.
 */
export function writeDryRunOutput(params) {
    const { cli, log, providerName, modelName, changelogAiUsed, fallbackReasons, customInstructionsResolution, customInstructions, hasProviderKey, whyDiagnostics, updated, outcome, metadata, } = params;
    log('==== DRY RUN (no PR) ====');
    const diagnosticsInput = {
        providerName,
        modelName,
        aiUsed: changelogAiUsed || whyDiagnostics.aiUsed,
        fallbackReasons,
        promptCustomization: {
            ...customInstructionsResolution.diagnostics,
            applied: Boolean(customInstructions && changelogAiUsed && !cli.noAi),
            reason: getPromptCustomizationReason({
                requested: customInstructionsResolution.diagnostics.requested,
                resolved: customInstructionsResolution.diagnostics.resolved,
                noAi: cli.noAi,
                hasProviderKey,
                aiUsed: changelogAiUsed,
            }),
        },
        why: whyDiagnostics,
        outcome,
        metadata,
    };
    log(cli.dryRunJsonReport
        ? formatDryRunJsonReport(diagnosticsInput)
        : formatDryRunDiagnostics(diagnosticsInput));
    if (outcome?.kind === 'no-changes') {
        if (!cli.dryRunJsonReport) {
            log('');
            log(`No changes found in release range (v${outcome.version})`);
        }
        return;
    }
    log('');
    log(updated);
}
