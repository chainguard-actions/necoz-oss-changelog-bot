import { LLM_GENERATE_MAX_TOKENS } from '../constants/prompt.js';
/**
 * Share immutable runtime configuration across concrete provider adapters.
 * WHY: Provider APIs use different request formats, but their configuration
 * and baseline capability contract must stay consistent as providers evolve.
 */
export class ProviderBase {
    modelName;
    supports;
    apiKey;
    /**
     * Initialize the common provider runtime settings.
     * @param config API credentials and the selected model.
     * @param options Provider capability differences for the selected model.
     */
    constructor(config, { reasoning = false } = {}) {
        this.apiKey = config.apiKey;
        this.modelName = config.model;
        this.supports = {
            jsonMode: true,
            streaming: false,
            reasoning,
            maxOutputTokens: LLM_GENERATE_MAX_TOKENS,
        };
    }
}
