import { outputSchema } from '../utils/output-json-schema.js';
import { extractJsonObject } from '../utils/json-extract.js';
import { postJson } from '../utils/http.js';
import { ANTHROPIC_API, ANTHROPIC_VERSION } from '../constants/anthropic.js';
import { LLM_CLASSIFY_MAX_TOKENS, LLM_GENERATE_MAX_TOKENS, LLM_WHY_MAX_TOKENS, LLM_TEMPERATURE_DEFAULT, } from '../constants/prompt.js';
import { PROVIDER_ANTHROPIC } from '../constants/provider.js';
import { RELEASE_NOTES_SYSTEM_PROMPT } from '../constants/system-prompts.js';
import { buildClassificationPrompt, buildClassificationAssignmentsJsonSchema, classifyChangesWithFallback, } from './classification.js';
import { isArray, isRecord, isString } from '../utils/is.js';
import { buildWhyExtractionPrompt, WHY_EXTRACTION_SYSTEM_PROMPT, whyExtractionJsonSchema, } from './why.js';
import { WhyExtractionOutputSchema } from '../schema/why.js';
import { ProviderBase } from './base.js';
import { normalizeWhyExtractionUsage } from '../utils/why-extraction-usage.js';
const SYSTEM_ANTHROPIC_CLASSIFY = 'Classify each release change into one provided category. Return a JSON object mapping every change ID to its category. Do not rewrite IDs.';
/**
 * Extract the assistant text content from an Anthropic Messages API response.
 * @param json Raw JSON response.
 * @returns First message text or an empty string.
 */
function extractAnthropicClassificationResponse(json) {
    // Prefer structured tool_use output when present.
    if (isRecord(json) && isArray(json.content)) {
        const first = json.content[0];
        // tool_use content: { type: 'tool_use', name, input: {...} }
        if (isRecord(first) && first.type === 'tool_use' && isRecord(first.input)) {
            // Note: If first.input contains circular references, JSON.stringify will throw.
            // If this is a concern, handle or document it explicitly.
            return JSON.stringify(first.input);
        }
        // Fallback to plain text when model did not use tools/structured outputs.
        if (isRecord(first) && isString(first.text)) {
            return first.text;
        }
    }
    return '';
}
export class AnthropicProvider extends ProviderBase {
    name = PROVIDER_ANTHROPIC;
    lastWhyExtractionUsage;
    lastServedModel;
    constructor(config) {
        super(config);
    }
    async generate(input) {
        const payload = {
            model: this.modelName,
            max_tokens: LLM_GENERATE_MAX_TOKENS,
            temperature: LLM_TEMPERATURE_DEFAULT,
            system: RELEASE_NOTES_SYSTEM_PROMPT,
            messages: [
                {
                    role: 'user',
                    content: JSON.stringify({
                        ...input,
                        requiredJsonSchema: outputSchema,
                    }),
                },
            ],
        };
        const json = await postJson(ANTHROPIC_API, payload, {
            'x-api-key': this.apiKey ?? '',
            'anthropic-version': ANTHROPIC_VERSION,
        }, 'Anthropic error');
        const outputText = json.content?.[0]?.text ?? '';
        return extractJsonObject(outputText);
    }
    async classifyChanges(changes, options = {}) {
        return classifyChangesWithFallback({
            changes,
            hasApiKey: Boolean(this.apiKey),
            options,
            invalidResponseMessage: 'Anthropic classify output did not match schema',
            request: async () => {
                const prompt = buildClassificationPrompt(changes);
                const payload = {
                    model: this.modelName,
                    max_tokens: LLM_CLASSIFY_MAX_TOKENS,
                    temperature: 0,
                    system: SYSTEM_ANTHROPIC_CLASSIFY,
                    messages: [{ role: 'user', content: JSON.stringify(prompt) }],
                    tools: [
                        {
                            name: 'return_assignments',
                            description: 'Return a JSON object mapping every change ID to one category.',
                            input_schema: buildClassificationAssignmentsJsonSchema(changes),
                        },
                    ],
                    tool_choice: { type: 'tool', name: 'return_assignments' },
                };
                const json = await postJson(ANTHROPIC_API, payload, {
                    'x-api-key': this.apiKey ?? '',
                    'anthropic-version': ANTHROPIC_VERSION,
                }, 'Anthropic classify error');
                return extractAnthropicClassificationResponse(json) || '{}';
            },
        });
    }
    async extractWhyNotes(input) {
        this.lastWhyExtractionUsage = undefined;
        this.lastServedModel = undefined;
        if (!input.items.length)
            return { items: [] };
        const payload = {
            model: this.modelName,
            max_tokens: LLM_WHY_MAX_TOKENS,
            temperature: 0,
            system: WHY_EXTRACTION_SYSTEM_PROMPT,
            messages: [
                {
                    role: 'user',
                    content: JSON.stringify(buildWhyExtractionPrompt(input)),
                },
            ],
            tools: [
                {
                    name: 'return_why_notes',
                    description: 'Return accepted WHY notes as JSON.',
                    input_schema: whyExtractionJsonSchema,
                },
            ],
            tool_choice: { type: 'tool', name: 'return_why_notes' },
        };
        const json = await postJson(ANTHROPIC_API, payload, {
            'x-api-key': this.apiKey ?? '',
            'anthropic-version': ANTHROPIC_VERSION,
        }, 'Anthropic WHY extraction error');
        this.lastWhyExtractionUsage = normalizeWhyExtractionUsage({
            inputTokens: json.usage?.input_tokens,
            outputTokens: json.usage?.output_tokens,
        });
        this.lastServedModel = json.model;
        const text = extractAnthropicClassificationResponse(json) || '{"items":[]}';
        const parsed = WhyExtractionOutputSchema.safeParse(JSON.parse(text));
        if (!parsed.success) {
            throw new Error('Anthropic WHY extraction output did not match schema');
        }
        return parsed.data;
    }
}
