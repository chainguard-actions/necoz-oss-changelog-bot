import { resolvePullRequestsByShaWithDiagnostics, resolveReleaseBodyWithDiagnostics, } from './release-data.js';
import { resolveWhyExtractor } from '../utils/why-extractor.js';
import { mergeMetadataDiagnostics } from '../utils/metadata-diagnostics.js';
/**
 * Collect release data and configuration needed to generate a changelog.
 * WHY: Keeping input resolution separate from generation makes the workflow
 * phases explicit and prevents network and filesystem concerns from spreading
 * through the output orchestration.
 * @param params CLI options, runtime configuration, and workflow adapters.
 * @returns Fully resolved input for changelog generation.
 */
export async function resolveChangelogRunInput({ cli, appConfig, deps, }) {
    const provider = deps.providerFactory(cli.provider, appConfig.providers);
    const releasePlan = deps.resolveReleasePlan(cli, deps.getRepoFullName(appConfig));
    const { owner, repo, repoPath, changelogPath, releaseRef, version, prevRef } = releasePlan;
    const mergedPullRequests = deps.gitMergedPRs(prevRef, releaseRef, repoPath);
    const existingChangelog = deps.prepareExistingChangelog(changelogPath, version);
    const commitList = deps.commitsInRange(prevRef, releaseRef, repoPath);
    const { token, hasProviderKey } = await deps.resolveRunCredentials(provider.name, owner, repo, appConfig);
    const { extractor: whyExtractor, hasApiKey: hasWhyExtractorKey } = resolveWhyExtractor(cli, appConfig, provider, hasProviderKey);
    // WHY: These GitHub lookups depend on the same resolved credentials but not
    // on each other, so running them together avoids unnecessary network latency.
    const [pullRequestsResolution, releaseBodyResolution] = await Promise.all([
        resolvePullRequestsByShaWithDiagnostics({
            deps,
            owner,
            repo,
            releaseRef,
            repoPath,
            token,
            githubApiBase: appConfig.github.apiBase,
            commitList,
        }),
        resolveReleaseBodyWithDiagnostics({
            cli,
            deps,
            owner,
            repo,
            token,
            githubApiBase: appConfig.github.apiBase,
        }),
    ]);
    const pullRequestsBySha = pullRequestsResolution.pullRequestsBySha;
    const releaseBody = releaseBodyResolution.releaseBody;
    const metadataDiagnostics = mergeMetadataDiagnostics(pullRequestsResolution.diagnostics, releaseBodyResolution.diagnostics);
    const prNumbersBySha = deps.buildPrMapBySha({
        commitList,
        prsLog: mergedPullRequests,
        repoPath,
        apiPrMap: pullRequestsBySha,
    });
    const titleToPr = deps.buildTitleToPr(commitList, mergedPullRequests, prNumbersBySha);
    const customInstructionsResolution = deps.resolveCustomInstructionsWithDiagnostics({
        instructions: cli.instructions,
        instructionsFile: cli.instructionsFile,
        repoPath,
    });
    return {
        provider,
        releasePlan,
        mergedPullRequests,
        existingChangelog,
        commitList,
        token,
        hasProviderKey,
        whyExtractor,
        hasWhyExtractorKey,
        pullRequestsBySha,
        releaseBody,
        prNumbersBySha,
        titleToPr,
        customInstructionsResolution,
        providerConfig: deps.getProviderRuntimeConfig(appConfig, provider.name),
        metadataDiagnostics,
    };
}
