import { WHY_SECTION_ALIASES, } from '../constants/why-section-aliases.js';
import { escapeRegExp } from './escape.js';
import { isUndefined } from './is.js';
const TARGET_SECTION_LABEL_PATTERN = Array.from(WHY_SECTION_ALIASES.keys())
    .sort((left, right) => right.length - left.length)
    .map(escapeRegExp)
    .join('|');
const TARGET_SECTION_LABEL_ONLY_RE = new RegExp(`^\\s*(?:[-*]\\s+)?(?:\\*\\*|__)?(?<name>${TARGET_SECTION_LABEL_PATTERN})\\s*[?？]?(?:(?:\\*\\*|__)\\s*[:：]?|[:：]\\s*(?:\\*\\*|__)?)?\\s*$`, 'iu');
const TARGET_INLINE_LABEL_RE = new RegExp(`^\\s*(?:[-*]\\s+)?(?:\\*\\*|__)?(?<name>${TARGET_SECTION_LABEL_PATTERN})(?:\\*\\*|__)?\\s*[:：]\\s*(?<text>[^\\n]+)$`, 'iu');
const TEMPLATE_LABEL_RE = /^\s*(?:[-*]\s+)?(?:\*\*|__)?[\p{L}\p{N}][\p{L}\p{N}\s?/._-]{0,48}(?:(?:\*\*|__)?\s*[:：]|[:：]\s*(?:\*\*|__)?)\s*$/u;
const TEMPLATE_FIELD_LABELS = new Set([
    'approach',
    'implementation',
    'notes',
    'solution',
    'test plan',
    'testing',
    'tests',
]);
const CONTAINER_CANONICAL_SECTION_NAMES = new Set([
    'summary',
    'description',
]);
const PLACEHOLDER_LINE_RE = /^(?:n\/a|na|none|no response|not applicable|todo|tbd|please describe\b.*|please explain\b.*|describe the\b.*|add context\b.*|enter details\b.*|_+|-+|\.+)$/i;
/**
 * Normalize a PR body before extracting rationale candidates.
 * @param body Raw pull request description.
 * @returns Body with comments, media, and template-only markup removed.
 */
export function normalizeWhyBody(body) {
    return body
        .replace(/\r\n?/g, '\n')
        .replace(/<!--[\s\S]*?-->/g, '\n')
        .replace(/<summary\b[^>]*>([\s\S]*?)<\/summary>/gim, '$1:\n')
        .replace(/<\/?(?:details|summary)\b[^>]*>/gim, '\n')
        .replace(/!\[[^\]]*]\([^)]*\)/g, '\n')
        .replace(/\[!\[[^\]]*]\([^)]*\)]\([^)]*\)/g, '\n')
        .replace(/^\s*[-*]\s+\[[ xX]]\s+.*$/gm, '\n')
        .replace(/^\s*<img\b[^>]*>\s*$/gim, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}
function normalizeHeadingName(value) {
    return value
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[*_`~]/g, '')
        .replace(/[:：].*$/, '')
        .replace(/\p{P}+/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
}
function canonicalTargetSectionName(value) {
    return WHY_SECTION_ALIASES.get(normalizeHeadingName(value));
}
function isTemplateFieldLabel(line) {
    if (!TEMPLATE_LABEL_RE.test(line))
        return false;
    return TEMPLATE_FIELD_LABELS.has(normalizeHeadingName(line));
}
function isTargetLabelBlock(line) {
    const labelMatch = line.match(TARGET_SECTION_LABEL_ONLY_RE);
    return !isUndefined(canonicalTargetSectionName(labelMatch?.groups?.name ?? ''));
}
function isInlineTargetLabel(line) {
    const match = line.match(TARGET_INLINE_LABEL_RE);
    return !isUndefined(canonicalTargetSectionName(match?.groups?.name ?? ''));
}
function extractInlineTargetLabel(line) {
    const match = line.match(TARGET_INLINE_LABEL_RE);
    const name = canonicalTargetSectionName(match?.groups?.name ?? '');
    const text = (match?.groups?.text ?? '').trim();
    if (!name || !hasUsableCandidateText(text))
        return undefined;
    return { name, text, source: 'inline-label' };
}
function extractInlineTargetLabels(body) {
    const sections = [];
    for (const line of body.split('\n')) {
        const section = extractInlineTargetLabel(line);
        if (section)
            sections.push(section);
    }
    return sections;
}
function extractTargetLabelBlocks(body) {
    const lines = body.split('\n');
    const sections = [];
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
        const line = lines[lineIndex] ?? '';
        const labelMatch = line.match(TARGET_SECTION_LABEL_ONLY_RE);
        const name = canonicalTargetSectionName(labelMatch?.groups?.name ?? '');
        if (!name)
            continue;
        const textLines = [];
        for (let contentIndex = lineIndex + 1; contentIndex < lines.length; contentIndex += 1) {
            const contentLine = lines[contentIndex] ?? '';
            if (/^\s*#{1,6}\s+/.test(contentLine))
                break;
            if (TARGET_SECTION_LABEL_ONLY_RE.test(contentLine))
                break;
            if (isTemplateFieldLabel(contentLine))
                break;
            if (isInlineTargetLabel(contentLine))
                break;
            textLines.push(contentLine);
        }
        const text = textLines.join('\n').trim();
        if (hasUsableCandidateText(text)) {
            sections.push({ name, text, source: 'label-block' });
        }
    }
    return sections;
}
/**
 * Extract rationale-bearing headings and label blocks from a normalized body.
 * @param body Normalized pull request description.
 * @returns Extracted candidate sections and whether a target field existed.
 */
export function extractWhyTargetSections(body) {
    const headingMatches = Array.from(body.matchAll(/^(?<marker>#{1,6})\s+(?<title>.+?)\s*#*\s*$/gm));
    const sections = [];
    let hasTargetSection = false;
    for (const [matchIndex, match] of headingMatches.entries()) {
        const rawTitle = match.groups?.title ?? '';
        const name = canonicalTargetSectionName(rawTitle);
        if (!name)
            continue;
        hasTargetSection = true;
        const startIndex = (match.index ?? 0) + match[0].length;
        const endIndex = isUndefined(headingMatches[matchIndex + 1]?.index)
            ? body.length
            : headingMatches[matchIndex + 1].index;
        const text = body.slice(startIndex, endIndex).trim();
        if (!text)
            continue;
        const nestedLabelSections = extractTargetLabelBlocks(text).filter((section) => hasUsableCandidateText(section.text));
        const nestedInlineSections = extractInlineTargetLabels(text);
        if ((nestedLabelSections.length > 0 || nestedInlineSections.length > 0) &&
            CONTAINER_CANONICAL_SECTION_NAMES.has(name)) {
            sections.push(...nestedLabelSections, ...nestedInlineSections);
            continue;
        }
        sections.push({ name, text, source: 'heading' }, ...nestedLabelSections, ...nestedInlineSections);
    }
    if (sections.length > 0)
        return { sections, hasTargetSection: true };
    hasTargetSection =
        hasTargetSection ||
            body
                .split('\n')
                .some((line) => isTargetLabelBlock(line) || isInlineTargetLabel(line));
    sections.push(...extractTargetLabelBlocks(body));
    // WHY: Container fields such as Summary: can contain a later inline Why
    // label; scan the complete body so container prose cannot hide it.
    sections.push(...extractInlineTargetLabels(body));
    return {
        sections,
        hasTargetSection: hasTargetSection || sections.length > 0,
    };
}
function cleanCandidateLine(line) {
    return line
        .replace(/^\s*>\s?/, '')
        .replace(/^[-*]\s+/, '')
        .replace(/^\[[ xX]]\s+/, '')
        .replace(/^`{1,3}|`{1,3}$/g, '')
        .replace(/^[_*~]+|[_*~]+$/g, '')
        .trim();
}
function isPlaceholderLine(line) {
    const normalizedLine = line
        .replace(/^[_*~]+|[_*~]+$/g, '')
        .replace(/[.!?。！？]+$/g, '')
        .trim();
    return PLACEHOLDER_LINE_RE.test(normalizedLine);
}
function hasUsableCandidateText(text) {
    for (const rawLine of text.split('\n')) {
        const line = cleanCandidateLine(rawLine);
        if (!line)
            continue;
        if (/^https?:\/\//i.test(line) || isPlaceholderLine(line))
            continue;
        if (line.replace(/\s+/g, ' ').trim().length >= 16)
            return true;
    }
    return false;
}
function boundSnippets(snippets, maxCharsPerPr) {
    const bounded = [];
    let usedChars = 0;
    for (const snippet of snippets) {
        const availableChars = maxCharsPerPr - usedChars;
        if (availableChars <= 0)
            break;
        bounded.push(snippet.slice(0, availableChars));
        usedChars += snippet.length + 1;
    }
    return bounded;
}
/**
 * Convert extracted rationale material into bounded provider snippets.
 * @param sections Extracted target sections.
 * @param body Normalized pull request body used as an optional fallback.
 * @param maxCharsPerPr Maximum combined snippet length.
 * @param allowBodyFallback Whether the full body may supply candidates.
 * @returns Cleaned, bounded candidate lines.
 */
export function buildWhyCandidateSnippets(sections, body, maxCharsPerPr, allowBodyFallback) {
    const sources = sections.length > 0
        ? sections.map((section) => ({
            text: section.text,
            stopAtTemplateLabel: true,
        }))
        : allowBodyFallback
            ? [{ text: body, stopAtTemplateLabel: false }]
            : [];
    const snippets = [];
    for (const source of sources) {
        const cleanedLines = [];
        for (const rawLine of source.text.split('\n')) {
            const line = cleanCandidateLine(rawLine);
            if (!line)
                continue;
            if (isTemplateFieldLabel(line)) {
                if (source.stopAtTemplateLabel)
                    break;
                continue;
            }
            if (/^https?:\/\//i.test(line) || isPlaceholderLine(line))
                continue;
            cleanedLines.push(line);
        }
        for (const line of cleanedLines) {
            const compactLine = line.replace(/\s+/g, ' ').trim();
            if (compactLine.length < 16)
                continue;
            snippets.push(compactLine.slice(0, 240));
            if (snippets.join('\n').length >= maxCharsPerPr) {
                return boundSnippets(snippets, maxCharsPerPr);
            }
        }
    }
    return boundSnippets(snippets, maxCharsPerPr);
}
