import { isArray } from './is.js';
import { CONVENTIONAL_BREAKING_PREFIX_RE, GIT_REVERT_SUBJECT_RE, } from '../constants/conventional.js';
/**
 * Build a flexible conventional prefix regex that accepts optional scope and
 * optional breaking marker `!` before the colon.
 * WHY: This is a reusable helper used by multiple modules; keeping it in utils
 * avoids coupling regex construction to constants definitions.
 * @param types Single commit type or list of types (e.g., 'feat' or ['feat','fix']).
 * @returns Case-insensitive RegExp matching the conventional prefix portion.
 */
export function flexPrefixRe(types) {
    const body = isArray(types) ? types.join('|') : types;
    // Matches: "type!:", "type(scope):", "type(scope)!:" (no space between type and scope)
    // Pattern: ^(type)(!:|(\(scope\))?:|(\(scope\))!:) with non-capturing alternation for scope and breaking marker
    return new RegExp(`^(${body})(?:!:|(?:\\([^)]*\\))?!?:)`, 'i');
}
/**
 * Pattern matching an unindented Conventional Commit breaking change footer.
 * WHY: Conventional Commits 1.0.0 requires uppercase tokens ('BREAKING CHANGE'
 * or 'BREAKING-CHANGE') followed by ': ' and a non-empty description.
 */
const BREAKING_FOOTER_TOKEN_PATTERN = /^(?:BREAKING CHANGE|BREAKING-CHANGE):\s+(\S.*)$/;
/**
 * Pattern matching a valid Git trailer or Conventional Commit footer token at column 0.
 * WHY: Git trailers and Conventional Commit footers consist of a word token using hyphens
 * or the special uppercase 'BREAKING CHANGE' token, followed by ': ' or ' #'.
 */
const TRAILER_TOKEN_PATTERN = /^(?:BREAKING CHANGE|BREAKING-CHANGE|[A-Za-z0-9-]+)(?::\s|\s#)/;
/**
 * Strip fenced code blocks from markdown/prose text to prevent matching code examples.
 * WHY: Documentation commits often contain code blocks demonstrating breaking change syntax.
 */
function stripFencedCodeBlocks(text) {
    const lines = text.split('\n');
    const sanitizedLines = [];
    let inFence = false;
    let fenceMarker = '';
    for (const line of lines) {
        const trimmed = line.trimStart();
        const fenceMatch = trimmed.match(/^(`{3,}|~{3,})/);
        if (fenceMatch) {
            const marker = fenceMatch[1][0];
            if (!inFence) {
                inFence = true;
                fenceMarker = marker;
                continue;
            }
            if (marker === fenceMarker) {
                inFence = false;
                fenceMarker = '';
                continue;
            }
        }
        if (!inFence) {
            sanitizedLines.push(line);
        }
    }
    return sanitizedLines.join('\n');
}
/**
 * Check whether a commit body contains an authentic Conventional Commit breaking change footer.
 * WHY: Restricts detection to the footer section by requiring footer paragraphs to begin
 * with a valid trailer token at column 0, while ignoring fenced code blocks, indented
 * code examples, and prose lines. Preserves multiline and multi-paragraph footer values,
 * including migration instructions.
 * @param body Full commit body text (excluding subject).
 * @returns True when an explicit breaking change footer is declared.
 */
export function hasConventionalBreakingFooter(body) {
    if (!body || !body.trim())
        return false;
    const sanitizedBody = stripFencedCodeBlocks(body.replace(/\r\n/g, '\n'));
    if (!sanitizedBody.trim())
        return false;
    // Split into paragraphs separated by one or more blank lines
    const paragraphs = sanitizedBody
        .split(/\n\s*\n/)
        .map((paragraph) => paragraph.trimEnd())
        .filter((paragraph) => paragraph.trim().length > 0);
    if (paragraphs.length === 0)
        return false;
    for (let pIndex = 0; pIndex < paragraphs.length; pIndex += 1) {
        const paragraph = paragraphs[pIndex];
        const lines = paragraph.split('\n');
        // A valid footer section paragraph MUST start with a valid trailer token at column 0
        if (!TRAILER_TOKEN_PATTERN.test(lines[0])) {
            continue;
        }
        // Check if this paragraph contains a breaking change footer token
        for (const line of lines) {
            if (line.startsWith(' ') || line.startsWith('\t')) {
                continue;
            }
            if (BREAKING_FOOTER_TOKEN_PATTERN.test(line)) {
                return true;
            }
        }
    }
    return false;
}
/**
 * Check whether a commit subject or body contains an explicit breaking change declaration.
 * @param subject Commit subject line.
 * @param body Optional commit body text.
 * @returns True when a breaking prefix ('type!:') or breaking footer is present.
 */
export function hasConventionalBreakingDeclaration(subject, body) {
    return (CONVENTIONAL_BREAKING_PREFIX_RE.test(subject) ||
        hasConventionalBreakingFooter(body));
}
/**
 * Check whether a title or subject line represents a git revert.
 * WHY: Covers both Conventional Commit `revert:` / `revert(scope):` and standard
 * `git revert` subjects (`Revert "<subject>"`), preventing false keyword classification.
 * @param rawTitle Commit subject or PR title.
 * @returns True when the title indicates a revert commit.
 */
export function isRevertTitle(rawTitle) {
    const trimmed = rawTitle.trim();
    return (GIT_REVERT_SUBJECT_RE.test(trimmed) ||
        flexPrefixRe('revert').test(trimmed) ||
        /^revert\s+(?:commit\b|pr\b|#\d+)/i.test(trimmed));
}
