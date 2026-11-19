import { readFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { isError, isNotNil } from '../utils/is.js';
export const CUSTOM_INSTRUCTIONS_ENCODING = 'utf8';
export const CUSTOM_INSTRUCTIONS_MAX_CHARS = 16_000;
function normalizeInstructionText(text) {
    const trimmedText = text?.trim();
    return trimmedText ? trimmedText : undefined;
}
function readInstructionsFile(repoPath, instructionsFile) {
    const resolvedPath = isAbsolute(instructionsFile)
        ? instructionsFile
        : join(repoPath, instructionsFile);
    return readFileSync(resolvedPath, CUSTOM_INSTRUCTIONS_ENCODING);
}
/**
 * Resolve inline and file-based customization instructions with diagnostics.
 * Empty file content and read failures are ignored so optional customization
 * never blocks deterministic release generation.
 * @param input Inline instructions, optional file path, and repository path.
 * @returns Combined instructions plus diagnostics describing the resolution.
 */
export function resolveCustomInstructionsWithDiagnostics(input) {
    const inlineInstructions = normalizeInstructionText(input.instructions);
    let fileInstructions;
    let fileStatus = input.instructionsFile
        ? 'empty'
        : 'not_provided';
    let fileError;
    if (input.instructionsFile) {
        try {
            fileInstructions = normalizeInstructionText(readInstructionsFile(input.repoPath, input.instructionsFile));
            fileStatus = fileInstructions ? 'loaded' : 'empty';
        }
        catch (error) {
            fileStatus = 'read_failed';
            fileError = isError(error) ? error.message : String(error);
        }
    }
    const instructionParts = [
        inlineInstructions
            ? { source: 'inline', text: inlineInstructions }
            : null,
        fileInstructions
            ? { source: 'file', text: fileInstructions }
            : null,
    ].filter(isNotNil);
    const combinedInstructions = instructionParts
        .map((instructionPart) => instructionPart.text)
        .join('\n\n');
    const truncated = combinedInstructions.length > CUSTOM_INSTRUCTIONS_MAX_CHARS;
    const instructions = combinedInstructions
        ? combinedInstructions.slice(0, CUSTOM_INSTRUCTIONS_MAX_CHARS)
        : undefined;
    return {
        instructions,
        diagnostics: {
            requested: Boolean(input.instructions || input.instructionsFile),
            resolved: Boolean(instructions),
            sources: instructionParts.map((instructionPart) => instructionPart.source),
            chars: instructions?.length ?? 0,
            maxChars: CUSTOM_INSTRUCTIONS_MAX_CHARS,
            encoding: CUSTOM_INSTRUCTIONS_ENCODING,
            truncated,
            fileStatus,
            ...(input.instructionsFile ? { filePath: input.instructionsFile } : {}),
            ...(fileError ? { fileError } : {}),
        },
    };
}
/**
 * Resolve inline and file-based customization instructions into one prompt block.
 * @param input Inline instructions, optional file path, and repository path.
 * @returns Combined instructions, or undefined when none were usable.
 */
export function resolveCustomInstructions(input) {
    return resolveCustomInstructionsWithDiagnostics(input).instructions;
}
