import { commitsInRange, currentBranch, gitMergedPRs, tryFindPullRequestNumberForBranch, } from './git.js';
import { writeChangelog } from './changelog.js';
import { createPR } from './pr.js';
import { fetchPRDetails, fetchPullRequestsForBranch, fetchPullRequestsForBranchResult, fetchReleaseBody, fetchReleaseBodyResult, mapCommitsToPrs, mapCommitsToPrsWithDiagnostics, } from './github.js';
import { ensureGithubTokenRequired } from '../schema/env.js';
import { getProviderRuntimeConfig } from './app-config.js';
import { providerFactory } from '../utils/provider.js';
import { getRepoFullName } from '../utils/repository.js';
import { buildChangelogLlmOutput } from '../utils/llm-output.js';
import { prepareExistingChangelog, resolveReleasePlan, resolveRunCredentials, } from './release-context.js';
import { finalizeChangelogUpdate } from './changelog-update.js';
import { resolveCustomInstructionsWithDiagnostics } from './customization.js';
import { buildPrMapBySha, buildTitleToPr } from '../utils/pr-mapping.js';
import { runWhyExtraction } from './why-extraction.js';
import { createMetadataDiagnostics } from '../utils/metadata-diagnostics.js';
const defaultDependencies = {
    providerFactory,
    getRepoFullName,
    resolveReleasePlan,
    gitMergedPRs,
    commitsInRange,
    currentBranch,
    tryFindPullRequestNumberForBranch,
    prepareExistingChangelog,
    resolveRunCredentials,
    mapCommitsToPrs,
    mapCommitsToPrsWithDiagnostics,
    fetchReleaseBody,
    fetchReleaseBodyResult,
    fetchPRDetails,
    fetchPullRequestsForBranch,
    fetchPullRequestsForBranchResult,
    resolveCustomInstructionsWithDiagnostics,
    buildPrMapBySha,
    buildTitleToPr,
    getProviderRuntimeConfig,
    buildChangelogLlmOutput,
    finalizeChangelogUpdate,
    runWhyExtraction,
    writeChangelog,
    ensureGithubTokenRequired,
    createPR,
};
/**
 * Merge dependency overrides with the production changelog workflow adapters.
 * @param overrides Partial adapters supplied by tests or alternate runtimes.
 * @returns Complete dependency set for one changelog run.
 */
export function resolveChangelogRunDependencies(overrides = {}) {
    const merged = {
        ...defaultDependencies,
        ...overrides,
    };
    // WHY: Legacy and mock dependencies often provide mapCommitsToPrs instead of
    // mapCommitsToPrsWithDiagnostics. Adapt the simplified method so diagnostic-aware
    // workflows route through the caller-provided mock.
    if (overrides.mapCommitsToPrs && !overrides.mapCommitsToPrsWithDiagnostics) {
        merged.mapCommitsToPrsWithDiagnostics = async (owner, repo, commitShas, token, githubApiBase) => {
            const pullRequestsBySha = await overrides.mapCommitsToPrs(owner, repo, commitShas, token, githubApiBase);
            const diagnostics = createMetadataDiagnostics();
            diagnostics.totalLookups = commitShas.length;
            diagnostics.successfulLookups = commitShas.length;
            return { pullRequestsBySha, diagnostics };
        };
    }
    // WHY: When tests mock fetchPullRequestsForBranch, ensure diagnostics callers
    // observe the mock response instead of invoking the production fetchPullRequestsForBranchResult.
    if (overrides.fetchPullRequestsForBranch &&
        !overrides.fetchPullRequestsForBranchResult) {
        merged.fetchPullRequestsForBranchResult = async (owner, repo, branch, token, githubApiBase) => {
            const pullRequests = await overrides.fetchPullRequestsForBranch(owner, repo, branch, token, githubApiBase);
            return { status: 'success', data: pullRequests };
        };
    }
    // WHY: When tests mock fetchReleaseBody, adapt it to return a successful lookup result.
    if (overrides.fetchReleaseBody && !overrides.fetchReleaseBodyResult) {
        merged.fetchReleaseBodyResult = async (owner, repo, tag, token, githubApiBase) => {
            const releaseBody = await overrides.fetchReleaseBody(owner, repo, tag, token, githubApiBase);
            return { status: 'success', data: releaseBody };
        };
    }
    return merged;
}
