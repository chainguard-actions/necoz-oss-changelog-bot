/**
 * Common Markdown regex patterns used across utils/libs.
 */
export const ANY_H2_HEADING_RE = /^##\s.*$/m;
export const H3_SUBHEADER_CAPTURE_RE = /^###\s+(.+?)\s*$/;
export const RELEASE_HEADER_CAPTURE_RE = /^##\s*\[([^\]]+)\](.*)$/;
export const BULLET_PREFIX_RE = /^[*-]\s+/;
export const OPENING_FENCE_RE = /^ {0,3}(```+|~~~+)([^\r\n]*)\r?$/;
export const CLOSING_FENCE_RE = /^ {0,3}(```+|~~~+)[ \t]*\r?$/;
