import { outputSchema } from '../utils/output-json-schema.js';
import { extractJsonObject } from '../utils/json-extract.js';
import { postJson } from '../utils/http.js';
import { XAI_CHAT_API } from '../constants/xai.js';
import { LLM_CLASSIFY_MAX_TOKENS, LLM_GENERATE_MAX_TOKENS, LLM_WHY_MAX_TOKENS, LLM_TEMPERATURE_DEFAULT, } from '../constants/prompt.js';
import { isArray, isRecord, isString } from '../utils/is.js';
import { PROVIDER_XAI } from '../constants/provider.js';
import { EDITORIAL_SYSTEM_PROMPT } from '../constants/system-prompts.js';
import { buildClassificationPrompt, classifyChangesWithFallback, } from './classification.js';
import { buildWhyExtractionPrompt, parseWhyExtractionOutput, WHY_EXTRACTION_SYSTEM_PROMPT, } from './why.js';
import { ProviderBase } from './base.js';
import { normalizeWhyExtractionUsage } from '../utils/why-extraction-usage.js';
const SYSTEM_XAI_CLASSIFY = 'Classify each release change into one provided category. Return a JSON object mapping every change ID to its category. Do not rewrite IDs.';
/**
 * Extract the assistant message content string from an xAI Chat Completions response.
 * @param json Raw API response.
 * @returns Serialized JSON string from the assistant message or a fallback `'{}'` string.
 */
function extractXAiChatContent(json) {
    if (isRecord(json) &&
        isArray(json.choices) &&
        isRecord(json.choices[0]) &&
        isRecord(json.choices[0].message) &&
        isString(json.choices[0].message.content)) {
        return json.choices[0].message.content;
    }
    return '{}';
}
/**
 * xAI (Grok) provider adapter implementing editorial adjustments, classification, and WHY extraction.
 * WHY: xAI exposes an OpenAI-compatible /v1/chat/completions endpoint with JSON object mode.
 * Encapsulating xAI in its own adapter isolates xAI endpoint configuration and model choices.
 */
export class XAIProvider extends ProviderBase {
    name = PROVIDER_XAI;
    lastWhyExtractionUsage;
    lastServedModel;
    constructor(config) {
        super(config);
    }
    /**
     * Request sparse editorial title improvements and category corrections from Grok.
     * @param input Structured release draft changes with stable IDs.
     * @returns Proposed editorial adjustments keyed by stable change ID.
     */
    async generate(input) {
        const payload = {
            model: this.modelName,
            max_tokens: LLM_GENERATE_MAX_TOKENS,
            temperature: LLM_TEMPERATURE_DEFAULT,
            messages: [
                { role: 'system', content: EDITORIAL_SYSTEM_PROMPT },
                {
                    role: 'user',
                    content: JSON.stringify({
                        ...input,
                        requiredJsonSchema: outputSchema,
                    }),
                },
            ],
            response_format: { type: 'json_object' },
        };
        const response = await postJson(XAI_CHAT_API, payload, { Authorization: `Bearer ${this.apiKey ?? ''}` }, 'xAI error');
        return extractJsonObject(extractXAiChatContent(response));
    }
    /**
     * Classify release changes into changelog buckets using xAI.
     * @param changes Canonical changes to classify.
     * @param options Error handling options.
     * @returns Reconciled ID-to-category assignments.
     */
    async classifyChanges(changes, options = {}) {
        return classifyChangesWithFallback({
            changes,
            hasApiKey: Boolean(this.apiKey),
            options,
            invalidResponseMessage: 'xAI classify output did not match schema',
            request: async () => {
                const prompt = buildClassificationPrompt(changes);
                const payload = {
                    model: this.modelName,
                    max_tokens: LLM_CLASSIFY_MAX_TOKENS,
                    temperature: 0,
                    messages: [
                        { role: 'system', content: SYSTEM_XAI_CLASSIFY },
                        { role: 'user', content: JSON.stringify(prompt) },
                    ],
                    response_format: { type: 'json_object' },
                };
                const response = await postJson(XAI_CHAT_API, payload, { Authorization: `Bearer ${this.apiKey}` }, 'xAI classify error');
                return extractXAiChatContent(response);
            },
        });
    }
    /**
     * Extract evidence-backed WHY notes from PR candidates using xAI.
     * @param input Candidate PR evidence and settings.
     * @returns Extracted WHY notes with confidence ratings.
     */
    async extractWhyNotes(input) {
        this.lastWhyExtractionUsage = undefined;
        this.lastServedModel = undefined;
        if (!input.items.length)
            return { items: [] };
        const userPrompt = JSON.stringify(buildWhyExtractionPrompt(input));
        const payload = {
            model: this.modelName,
            max_tokens: LLM_WHY_MAX_TOKENS,
            temperature: 0,
            messages: [
                { role: 'system', content: WHY_EXTRACTION_SYSTEM_PROMPT },
                { role: 'user', content: userPrompt },
            ],
            response_format: { type: 'json_object' },
        };
        const response = await postJson(XAI_CHAT_API, payload, { Authorization: `Bearer ${this.apiKey ?? ''}` }, 'xAI WHY extraction error');
        this.lastWhyExtractionUsage = normalizeWhyExtractionUsage({
            inputTokens: response.usage?.input_tokens ?? response.usage?.prompt_tokens,
            outputTokens: response.usage?.output_tokens ?? response.usage?.completion_tokens,
        });
        this.lastServedModel = response.model;
        return parseWhyExtractionOutput(extractXAiChatContent(response));
    }
}
