import { tryDetectLatestTag, tryDetectPrevTag, firstCommit, dateForRef, } from './git.js';
import { readChangelog } from './changelog.js';
import { getProviderRuntimeConfig } from './app-config.js';
import { resolveGitHubAuth } from '../utils/github-auth.js';
import { normalizeReleaseName, versionFromRef } from '../utils/version.js';
import { escapeRegExp } from '../utils/escape.js';
import { HEAD_REF } from '../constants/git.js';
import { DATE_YYYY_MM_DD_LEN } from '../constants/time.js';
/**
 * Resolve release refs, version, and date from CLI options and repository state.
 * @param cli Validated CLI options.
 * @param repoFullName Repository identifier in `owner/repo` format.
 * @returns Normalized release metadata used by the CLI workflow.
 */
export function resolveReleasePlan(cli, repoFullName) {
    const [owner, repo] = repoFullName.split('/');
    const releaseRef = cli.releaseTag || tryDetectLatestTag(cli.repoPath) || HEAD_REF;
    const version = cli.releaseName
        ? normalizeReleaseName(cli.releaseName)
        : versionFromRef(releaseRef);
    const prevRef = tryDetectPrevTag(releaseRef, cli.repoPath) || firstCommit(cli.repoPath);
    const date = dateForRef(releaseRef, cli.repoPath) ||
        new Date().toISOString().slice(0, DATE_YYYY_MM_DD_LEN);
    return {
        owner,
        repo,
        repoPath: cli.repoPath,
        changelogPath: cli.changelogPath,
        releaseRef,
        version,
        prevRef,
        date,
    };
}
/**
 * Read the changelog and remove any existing compare link for the target version.
 * WHY: The release section already embeds the compare link, so stale bottom links
 * must be removed before recomputing the changelog to keep reruns idempotent.
 * @param changelogPath Path to the changelog file on disk.
 * @param version Release version without the leading `v`.
 * @returns Existing changelog text with the target version link removed.
 */
export function prepareExistingChangelog(changelogPath, version) {
    const existingChangelog = readChangelog(changelogPath);
    return existingChangelog.replace(new RegExp(`\n\\[v${escapeRegExp(version)}\\]: .*\n?`, 'g'), '\n');
}
/**
 * Resolve GitHub auth and provider API-key availability for the current run.
 * @param providerName Selected provider identifier.
 * @param owner Repository owner or org.
 * @param repo Repository name.
 * @param env Environment variables to inspect for provider credentials.
 * @returns Token and provider-key availability for the workflow.
 */
export async function resolveRunCredentials(providerName, owner, repo, appConfig) {
    const gitHubAuth = await resolveGitHubAuth(owner, repo, appConfig.github);
    return {
        token: gitHubAuth?.token,
        hasProviderKey: Boolean(getProviderRuntimeConfig(appConfig, providerName).apiKey),
    };
}
