import { fallbackCategoryAssignments } from '../providers/classification.js';
import { providerFactory } from './provider.js';
import { isString } from './is.js';
function providerFromConfig(providerName, config) {
    const providerConfigs = {
        openai: config,
        anthropic: config,
        gemini: config,
        xai: config,
    };
    return providerFactory(providerName, providerConfigs);
}
/**
 * Classify canonical changes using the selected LLM provider.
 * Falls back to the canonical deterministic classifier when no API key is
 * present or the provider fails.
 * WHY: Provider-specific request details live in provider adapters; this helper
 * centralizes provider selection for callers that only have a provider name.
 * @param changes Stable IDs and normalized titles to classify.
 * @param provider Provider adapter or provider name.
 * @param config Runtime config required when passing a provider name.
 * @returns Reconciled ID-to-category assignments and diagnostics.
 */
export async function classifyChanges(changes, provider, config) {
    if (!changes.length)
        return { assignments: {}, diagnostics: [] };
    if (!isString(provider)) {
        return provider.classifyChanges(changes);
    }
    if (!config) {
        return {
            assignments: fallbackCategoryAssignments(changes),
            diagnostics: [],
        };
    }
    const providerAdapter = providerFromConfig(provider, config);
    return providerAdapter.classifyChanges(changes);
}
