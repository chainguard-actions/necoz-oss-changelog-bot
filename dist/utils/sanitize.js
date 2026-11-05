import { UNRELEASED_ANCHOR } from '../constants/changelog.js';
/**
 * Ensure minimal invariants on LLM output used by the CLI.
 * - Guarantees a valid `insert_after_anchor` heading (defaults to Unreleased anchor).
 * @param llm Parsed provider output or null when generation failed.
 * @returns Sanitized output or the original null.
 */
export function sanitizeLLMOutput(llm) {
    if (!llm)
        return llm;
    const sanitizedOutput = { ...llm };
    // WHY: Providers may omit or return a non-heading anchor; enforce a safe default.
    if (!sanitizedOutput.insert_after_anchor ||
        !/^##\s/.test(sanitizedOutput.insert_after_anchor)) {
        sanitizedOutput.insert_after_anchor = UNRELEASED_ANCHOR;
    }
    return sanitizedOutput;
}
