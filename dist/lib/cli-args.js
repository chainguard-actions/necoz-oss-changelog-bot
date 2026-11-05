import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { z } from 'zod';
import { CliOptionsSchema } from '../schema/cli.js';
import { PROVIDER_NAMES, PROVIDER_OPENAI } from '../constants/provider.js';
import { loadCliConfigFile } from './config-file.js';
import { ConfigError } from './errors.js';
import { isInstanceOf, isUndefined } from '../utils/is.js';
const isZodError = isInstanceOf(z.ZodError);
function omitUndefined(value) {
    return Object.fromEntries(Object.entries(value).filter(([, fieldValue]) => !isUndefined(fieldValue)));
}
/**
 * Parse CLI arguments and normalize them with schema validation.
 * @param argv Raw argv array (typically `process.argv`).
 * @param options Optional parser dependencies for tests.
 * @returns Validated CLI options.
 */
export async function parseCliArgs(argv, options = {}) {
    const parsed = await yargs(hideBin(argv))
        // Force English help/messages regardless of system locale
        .locale('en')
        .option('config', { type: 'string' })
        .option('repo-path', { type: 'string' })
        .option('changelog-path', { type: 'string' })
        .option('base-branch', { type: 'string' })
        .option('provider', {
        type: 'string',
        choices: [...PROVIDER_NAMES],
    })
        .option('release-tag', { type: 'string' })
        .option('release-name', { type: 'string' })
        .option('release-body', { type: 'string' })
        .option('language', { type: 'string' })
        .option('instructions', { type: 'string' })
        .option('instructions-file', { type: 'string' })
        .option('dry-run', { type: 'boolean' })
        .option('dry-run-json-report', { type: 'boolean' })
        .option('fail-on-llm-error', { type: 'boolean' })
        .option('require-provider', { type: 'boolean' })
        .option('ai', { type: 'boolean' })
        .option('why', { type: 'boolean' })
        .option('why-engine', {
        type: 'string',
        choices: ['llm', 'jev'],
    })
        .option('why-max-prs', { type: 'number' })
        .option('why-max-chars-per-pr', { type: 'number' })
        .option('why-confidence', {
        type: 'string',
        choices: ['low', 'medium', 'high'],
    })
        .option('why-label', { type: 'string' })
        .fail((message, error) => {
        const detail = message || error?.message || 'Invalid CLI arguments';
        throw new ConfigError(`Invalid CLI arguments: ${detail}`);
    })
        .strict()
        .parse();
    const config = loadCliConfigFile(parsed.config, options.cwd);
    const cliOverrides = omitUndefined({
        repoPath: parsed['repo-path'],
        changelogPath: parsed['changelog-path'],
        baseBranch: parsed['base-branch'],
        provider: parsed.provider,
        releaseTag: parsed['release-tag'],
        releaseName: parsed['release-name'],
        releaseBody: parsed['release-body'],
        language: parsed.language,
        instructions: parsed.instructions,
        instructionsFile: parsed['instructions-file'],
        dryRun: parsed['dry-run'],
        dryRunJsonReport: parsed['dry-run-json-report'],
        failOnLlmError: parsed['fail-on-llm-error'],
        requireProvider: parsed['require-provider'],
        noAi: isUndefined(parsed.ai) ? undefined : !parsed.ai,
        why: parsed.why,
        whyEngine: parsed['why-engine'],
        whyMaxPrs: parsed['why-max-prs'],
        whyMaxCharsPerPr: parsed['why-max-chars-per-pr'],
        whyConfidence: parsed['why-confidence'],
        whyLabel: parsed['why-label'],
    });
    try {
        return CliOptionsSchema.parse({
            provider: PROVIDER_OPENAI,
            ...config,
            ...cliOverrides,
        });
    }
    catch (error) {
        if (isZodError(error)) {
            throw new ConfigError(`Invalid CLI options: ${z.prettifyError(error)}`);
        }
        throw error;
    }
}
