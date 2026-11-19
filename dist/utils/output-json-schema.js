import { SECTION_ORDER } from '../constants/changelog.js';
/**
 * JSON Schema describing the expected LLM output structure for Phase 4 editorial responses.
 */
export const editorialOutputSchema = {
    type: 'object',
    properties: {
        changes: {
            type: 'object',
            additionalProperties: {
                type: 'object',
                properties: {
                    title: { type: 'string' },
                    category: {
                        type: 'string',
                        enum: [...SECTION_ORDER],
                    },
                },
                additionalProperties: false,
            },
        },
    },
    required: ['changes'],
    additionalProperties: false,
};
export const outputSchema = editorialOutputSchema;
