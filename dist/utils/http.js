import { safeJsonParse } from './json.js';
import { isUndefined } from './is.js';
/**
 * Build a rich HttpError instance containing status code and parsed body details.
 * @param response Fetch response used when the request failed.
 * @param text Raw response text.
 * @param errorPrefix Prefix string to prepend to the error message.
 */
function buildHttpError(response, text, errorPrefix) {
    const parsed = safeJsonParse(text);
    return Object.assign(new Error(`${errorPrefix} ${response.status}: ${text}`), {
        status: response.status,
        body: parsed ?? text,
    });
}
/**
 * Parse the response body as JSON, throwing descriptive errors on failure.
 * @param response Fetch response.
 * @param errorPrefix Prefix string to include in thrown errors.
 * @returns Parsed JSON payload.
 */
async function parseJsonResponse(response, errorPrefix) {
    const text = await response.text();
    if (!response.ok) {
        throw buildHttpError(response, text, errorPrefix);
    }
    const data = safeJsonParse(text);
    if (isUndefined(data)) {
        throw new Error(`${errorPrefix} failed to parse JSON response`);
    }
    return data;
}
/**
 * POST JSON and parse the JSON response, throwing rich errors on non-2xx.
 * WHY: Centralizes minimal fetch handling and consistent error construction.
 * @param url Target endpoint.
 * @param payload Serializable request body.
 * @param headers Headers to merge with `Content-Type: application/json`.
 * @param errorPrefix Label included in thrown error messages (e.g., provider name).
 * @returns Parsed JSON response typed as `T`.
 */
export async function postJson(url, payload, headers, errorPrefix) {
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...headers,
        },
        body: JSON.stringify(payload),
    });
    return parseJsonResponse(response, errorPrefix);
}
/**
 * GET JSON and parse the JSON response, throwing rich errors on non-2xx.
 * @param url Target endpoint.
 * @param headers Request headers.
 * @param errorPrefix Label included in thrown error messages.
 * @returns Parsed JSON payload typed as `T`.
 */
export async function getJson(url, headers, errorPrefix) {
    const response = await fetch(url, { headers });
    return parseJsonResponse(response, errorPrefix);
}
