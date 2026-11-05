import { JevWhyExtractor } from '../providers/jev-why.js';
/**
 * Resolve the isolated adapter used to enrich changelog items with WHY notes.
 * @param cli Parsed runtime options.
 * @param appConfig Runtime configuration including Jev credentials.
 * @param provider Main LLM provider used for changelog generation.
 * @returns Selected WHY extractor and whether its credential is configured.
 */
export function resolveWhyExtractor(cli, appConfig, provider, hasProviderKey) {
    if (cli.whyEngine === 'jev') {
        return {
            extractor: new JevWhyExtractor(appConfig.typesafe),
            hasApiKey: Boolean(appConfig.typesafe.apiKey),
        };
    }
    return { extractor: provider, hasApiKey: hasProviderKey };
}
