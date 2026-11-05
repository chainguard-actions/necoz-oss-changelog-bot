import { HEAD_REF } from '../constants/git.js';
import { createMetadataDiagnostics, mergeMetadataDiagnostics, recordMetadataLookupOutcome, } from '../utils/metadata-diagnostics.js';
import { formatBranchMetadataFallbackReason, formatReleaseMetadataFallbackReason, } from '../utils/github-error.js';
/**
 * Associate release commits with pull requests and preserve lookup diagnostics.
 * @param params Repository, release, commit, and lookup inputs.
 * @returns Pull request map and metadata diagnostics.
 */
export async function resolvePullRequestsByShaWithDiagnostics({ deps, owner, repo, releaseRef, repoPath, token, githubApiBase, commitList, }) {
    const commitShas = commitList.map((commit) => commit.sha);
    const branchName = releaseRef === HEAD_REF ? deps.currentBranch(repoPath) : null;
    const diagnostics = createMetadataDiagnostics();
    let branchPullRequests = [];
    if (branchName) {
        if (deps.fetchPullRequestsForBranchResult) {
            const branchResult = await deps.fetchPullRequestsForBranchResult(owner, repo, branchName, token, githubApiBase);
            const fallbackReason = branchResult.status !== 'success'
                ? formatBranchMetadataFallbackReason(branchName, branchResult)
                : undefined;
            recordMetadataLookupOutcome(diagnostics, branchResult, fallbackReason);
            if (branchResult.status === 'success') {
                branchPullRequests = branchResult.data;
            }
        }
        else {
            branchPullRequests = await deps.fetchPullRequestsForBranch(owner, repo, branchName, token, githubApiBase);
        }
    }
    const remotePrNumber = branchName && branchPullRequests.length === 0
        ? deps.tryFindPullRequestNumberForBranch(branchName, repoPath)
        : null;
    const oldestCommit = commitList[commitList.length - 1];
    const remotePullRequest = remotePrNumber && oldestCommit
        ? {
            number: remotePrNumber,
            title: oldestCommit.subject,
            url: `https://github.com/${owner}/${repo}/pull/${remotePrNumber}`,
        }
        : null;
    const authoritativePullRequests = branchPullRequests.length
        ? branchPullRequests
        : remotePullRequest
            ? [remotePullRequest]
            : [];
    if (authoritativePullRequests.length) {
        return {
            pullRequestsBySha: Object.fromEntries(commitShas.map((commitSha) => [commitSha, authoritativePullRequests])),
            diagnostics,
        };
    }
    if (deps.mapCommitsToPrsWithDiagnostics) {
        const commitMapping = await deps.mapCommitsToPrsWithDiagnostics(owner, repo, commitShas, token, githubApiBase);
        return {
            pullRequestsBySha: commitMapping.pullRequestsBySha,
            diagnostics: mergeMetadataDiagnostics(diagnostics, commitMapping.diagnostics),
        };
    }
    const pullRequestsBySha = await deps.mapCommitsToPrs(owner, repo, commitShas, token, githubApiBase);
    return { pullRequestsBySha, diagnostics };
}
/**
 * Associate release commits with pull requests from branch metadata or the API.
 * WHY: A HEAD release may itself be a pull request. In that case its branch PR
 * is authoritative for every commit and avoids misleading per-commit matches.
 * @param params Repository, release, commit, and lookup inputs.
 * @returns Pull request references keyed by commit SHA.
 */
export async function resolvePullRequestsBySha(params) {
    const result = await resolvePullRequestsByShaWithDiagnostics(params);
    return result.pullRequestsBySha;
}
/**
 * Resolve release notes and preserve lookup diagnostics.
 * @param params CLI, repository, and GitHub lookup inputs.
 * @returns Release notes body and metadata diagnostics.
 */
export async function resolveReleaseBodyWithDiagnostics(params) {
    const diagnostics = createMetadataDiagnostics();
    if (params.cli.releaseBody) {
        return { releaseBody: params.cli.releaseBody, diagnostics };
    }
    if (!params.cli.releaseTag || params.cli.releaseTag === HEAD_REF) {
        return { releaseBody: '', diagnostics };
    }
    if (params.deps.fetchReleaseBodyResult) {
        const result = await params.deps.fetchReleaseBodyResult(params.owner, params.repo, params.cli.releaseTag, params.token, params.githubApiBase);
        const fallbackReason = result.status !== 'success'
            ? formatReleaseMetadataFallbackReason(params.cli.releaseTag, result)
            : undefined;
        recordMetadataLookupOutcome(diagnostics, result, fallbackReason);
        return {
            releaseBody: result.status === 'success' ? result.data : '',
            diagnostics,
        };
    }
    const releaseBody = await params.deps.fetchReleaseBody(params.owner, params.repo, params.cli.releaseTag, params.token, params.githubApiBase);
    return { releaseBody, diagnostics };
}
/**
 * Resolve release notes from the CLI first, then GitHub when a tag is present.
 * @param params CLI, repository, and GitHub lookup inputs.
 * @returns Release notes body, or an empty string when none can be resolved.
 */
export async function resolveReleaseBody(params) {
    const result = await resolveReleaseBodyWithDiagnostics(params);
    return result.releaseBody;
}
