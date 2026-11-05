/**
 * Typed environment accessor. Prefer values from a validated Env object
 * when provided; otherwise falls back to process.env.
 */
export function getEnv(key, parsed) {
    if (parsed)
        return parsed[key];
    return process.env[key];
}
