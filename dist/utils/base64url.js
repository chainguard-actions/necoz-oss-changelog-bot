/**
 * Encode input as base64url (RFC 4648 §5) without padding.
 * @param input String or Buffer to encode.
 * @returns URL-safe base64 string using -_ and no = padding.
 */
export function base64url(input) {
    return Buffer.from(input)
        .toString('base64')
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');
}
