/**
 * Canonical delivery destinations supported by changelog-bot.
 */
export const OUTPUT_DESTINATIONS = ['pull-request', 'file', 'stdout'] as const;

/**
 * Default delivery destination preserving backward compatibility.
 */
export const DEFAULT_OUTPUT_DESTINATION = 'pull-request' as const;

/**
 * Output destination target type.
 */
export type OutputDestination = (typeof OUTPUT_DESTINATIONS)[number];
