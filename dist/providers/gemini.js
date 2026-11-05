import { outputSchema } from '../utils/output-json-schema.js';
import { extractJsonObject } from '../utils/json-extract.js';
import { postJson } from '../utils/http.js';
import { GEMINI_API_BASE } from '../constants/gemini.js';
import { LLM_CLASSIFY_MAX_TOKENS, LLM_GENERATE_MAX_TOKENS, LLM_WHY_MAX_TOKENS, LLM_TEMPERATURE_DEFAULT, } from '../constants/prompt.js';
import { PROVIDER_GEMINI } from '../constants/provider.js';
import { RELEASE_NOTES_SYSTEM_PROMPT } from '../constants/system-prompts.js';
import { buildClassificationPrompt, buildClassificationAssignmentsJsonSchema, classifyChangesWithFallback, } from './classification.js';
import { buildWhyExtractionPrompt, parseWhyExtractionOutput, WHY_EXTRACTION_SYSTEM_PROMPT, whyExtractionJsonSchema, } from './why.js';
import { ProviderBase } from './base.js';
import { normalizeWhyExtractionUsage } from '../utils/why-extraction-usage.js';
const SYSTEM_GEMINI_CLASSIFY = 'Classify each release change into one provided category. Return a JSON object mapping every change ID to its category. Do not rewrite IDs.';
/**
 * Build the Gemini generateContent endpoint URL for a model.
 * @param modelName Gemini model identifier.
 * @returns Full REST endpoint URL.
 */
function buildGeminiGenerateUrl(modelName) {
    return `${GEMINI_API_BASE}/models/${encodeURIComponent(modelName)}:generateContent`;
}
/**
 * Extract concatenated text from the first Gemini candidate.
 * @param response Gemini generateContent response.
 * @returns Candidate text or an empty string.
 */
function extractGeminiText(response) {
    return (response.candidates?.[0]?.content?.parts
        ?.map((part) => part.text ?? '')
        .join('') ?? '');
}
/** Gemini provider adapter backed by the Google AI generateContent REST API. */
export class GeminiProvider extends ProviderBase {
    name = PROVIDER_GEMINI;
    lastWhyExtractionUsage;
    lastServedModel;
    lastWhyExtractionDiagnostics;
    constructor(config) {
        super(config);
    }
    async generate(input) {
        const payload = {
            systemInstruction: {
                parts: [{ text: RELEASE_NOTES_SYSTEM_PROMPT }],
            },
            contents: [
                {
                    role: 'user',
                    parts: [
                        {
                            text: JSON.stringify({
                                ...input,
                                requiredJsonSchema: outputSchema,
                            }),
                        },
                    ],
                },
            ],
            generationConfig: {
                maxOutputTokens: LLM_GENERATE_MAX_TOKENS,
                temperature: LLM_TEMPERATURE_DEFAULT,
                responseMimeType: 'application/json',
                responseJsonSchema: outputSchema,
            },
        };
        const response = await postJson(buildGeminiGenerateUrl(this.modelName), payload, { 'x-goog-api-key': this.apiKey ?? '' }, 'Gemini error');
        return extractJsonObject(extractGeminiText(response));
    }
    async classifyChanges(changes, options = {}) {
        return classifyChangesWithFallback({
            changes,
            hasApiKey: Boolean(this.apiKey),
            options,
            invalidResponseMessage: 'Gemini classify output did not match schema',
            request: async () => {
                const prompt = buildClassificationPrompt(changes);
                const payload = {
                    systemInstruction: {
                        parts: [{ text: SYSTEM_GEMINI_CLASSIFY }],
                    },
                    contents: [
                        {
                            role: 'user',
                            parts: [{ text: JSON.stringify(prompt) }],
                        },
                    ],
                    generationConfig: {
                        maxOutputTokens: LLM_CLASSIFY_MAX_TOKENS,
                        temperature: 0,
                        responseMimeType: 'application/json',
                        responseJsonSchema: buildClassificationAssignmentsJsonSchema(changes),
                    },
                };
                const response = await postJson(buildGeminiGenerateUrl(this.modelName), payload, { 'x-goog-api-key': this.apiKey ?? '' }, 'Gemini classify error');
                return extractGeminiText(response);
            },
        });
    }
    async extractWhyNotes(input) {
        this.lastWhyExtractionUsage = undefined;
        this.lastServedModel = undefined;
        this.lastWhyExtractionDiagnostics = undefined;
        if (!input.items.length)
            return { items: [] };
        const payload = {
            systemInstruction: {
                parts: [{ text: WHY_EXTRACTION_SYSTEM_PROMPT }],
            },
            contents: [
                {
                    role: 'user',
                    parts: [
                        {
                            text: JSON.stringify(buildWhyExtractionPrompt(input)),
                        },
                    ],
                },
            ],
            generationConfig: {
                maxOutputTokens: LLM_WHY_MAX_TOKENS,
                temperature: 0,
                responseMimeType: 'application/json',
                responseJsonSchema: whyExtractionJsonSchema,
            },
        };
        const response = await postJson(buildGeminiGenerateUrl(this.modelName), payload, { 'x-goog-api-key': this.apiKey ?? '' }, 'Gemini WHY extraction error');
        this.lastWhyExtractionUsage = normalizeWhyExtractionUsage({
            inputTokens: response.usageMetadata?.promptTokenCount,
            outputTokens: response.usageMetadata?.candidatesTokenCount,
        });
        this.lastServedModel = response.modelVersion;
        return parseWhyExtractionOutput(extractGeminiText(response));
    }
}
