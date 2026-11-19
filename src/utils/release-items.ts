import type { CommitLite } from '@/types/commit.js';
import type { PullRef } from '@/types/github.js';
import type {
  ExcludedReleaseChange,
  ReleaseChange,
  ReleaseChangeId,
  ReleaseChangeOrigin,
  ReleaseItem,
} from '@/types/release.js';
import { detectPrSubChangesFromCommits } from '@/utils/sub-changes.js';
import { stripConventionalPrefix } from '@/utils/title-normalize.js';
import { CONVENTIONAL_BREAKING_PREFIX_RE } from '@/constants/conventional.js';

function findPullRequestWithTitle(
  commitSha: string,
  pullRequestsBySha: Readonly<Record<string, readonly PullRef[]>>,
): PullRef | undefined {
  return pullRequestsBySha[commitSha]?.find((candidate) =>
    candidate.title?.trim(),
  );
}

/**
 * Build a stable release-change ID from its source identity.
 * @param origin Source record for the release change.
 * @returns Stable ID suitable for provider reconciliation.
 */
export function buildReleaseChangeId(
  origin: ReleaseChangeOrigin,
): ReleaseChangeId {
  switch (origin.kind) {
    case 'pull-request':
      return `pr:${origin.number}`;
    case 'pull-request-subchange':
      return `pr:${origin.number}:c${origin.subIndex}`;
    case 'commit':
      return `commit:${origin.sha}`;
    case 'release-note':
      return `release-note:${origin.index}`;
    default: {
      const exhaustiveOrigin: never = origin;
      throw new Error(
        `Unsupported release-change origin: ${JSON.stringify(exhaustiveOrigin)}`,
      );
    }
  }
}

/**
 * Assign stable identities to items parsed from ordered release notes before transforms.
 * WHY: Display titles may be duplicated or rewritten, so downstream stages need an
 * identity that does not depend on title matching. The first occurrence of a pull request
 * receives a PR-based identity, while duplicate references receive position-based
 * release-note identities to prevent ID collisions and enable tracking in excludedChanges.
 * @param items Parsed release-note items in source order.
 * @returns Pre-transform release changes with unique identities.
 */
export function buildIdentifiedReleaseItems(
  items: readonly ReleaseItem[],
): ReleaseChange[] {
  const seenPrNumbers = new Set<number>();
  return items.map((item, itemIndex) => {
    let origin: ReleaseChangeOrigin;
    if (item.pr !== undefined && !seenPrNumbers.has(item.pr)) {
      seenPrNumbers.add(item.pr);
      origin = { kind: 'pull-request', number: item.pr };
    } else {
      origin = { kind: 'release-note', index: itemIndex };
    }
    return {
      ...item,
      id: buildReleaseChangeId(origin),
      origin,
    };
  });
}

/**
 * Assign stable identities to items parsed from ordered release notes.
 * WHY: Display titles may be duplicated or rewritten, so downstream stages
 * need an identity that does not depend on title matching.
 * @param items Parsed release-note items in source order.
 * @param excludedChanges Optional collector for tracked duplicate exclusions.
 * @returns Canonical release changes with PR- or position-based identities.
 */
export function identifyReleaseItems(
  items: readonly ReleaseItem[],
  excludedChanges?: ExcludedReleaseChange[],
): ReleaseChange[] {
  const changes = buildIdentifiedReleaseItems(items);
  return deduplicateReleaseChangesByPullRequest(changes, excludedChanges);
}

/**
 * Deduplicate canonical changes by their final enriched pull request number.
 * WHY: Title-based enrichment runs after initial identification and can reveal
 * that separately parsed release-note rows refer to the same pull request.
 * @param changes Canonical changes after any available PR enrichment.
 * @param excludedChanges Optional collector for tracked duplicate exclusions.
 * @returns Source-ordered changes containing at most one entry per PR number.
 */
export function deduplicateReleaseChangesByPullRequest(
  changes: readonly ReleaseChange[],
  excludedChanges?: ExcludedReleaseChange[],
): ReleaseChange[] {
  const deduplicatedChanges: ReleaseChange[] = [];
  const changesByPrNumber = new Map<number, ReleaseChange>();
  const changesById = new Map<ReleaseChangeId, ReleaseChange>();

  for (const change of changes) {
    if (change.pr === undefined) {
      deduplicatedChanges.push(change);
      continue;
    }

    if (change.origin.kind === 'pull-request-subchange') {
      const existingChange = changesById.get(change.id);
      if (existingChange) {
        existingChange.author ??= change.author;
        existingChange.url ??= change.url;
        // WHY: Sibling occurrences of the exact same sub-change ID are dropped from changes
        // but must NOT be added to excludedChanges with the same ID, because validateReleaseResult
        // enforces strict disjointness between changes and excludedChanges.
        continue;
      }
      changesById.set(change.id, change);
      deduplicatedChanges.push(change);
      continue;
    }

    const existingChange = changesByPrNumber.get(change.pr);
    if (existingChange) {
      if (
        existingChange.origin.kind === 'release-note' &&
        change.origin.kind === 'pull-request'
      ) {
        // WHY: A title-resolved release note has a positional identity, while an
        // explicit PR reference is the canonical parent needed for sub-change
        // expansion. Keep the original position so unrelated entries remain ordered.
        const existingChangeIndex = deduplicatedChanges.indexOf(existingChange);
        deduplicatedChanges[existingChangeIndex] = change;
        changesByPrNumber.set(change.pr, change);
        change.author ??= existingChange.author;
        change.url ??= existingChange.url;
        if (excludedChanges && change.id !== existingChange.id) {
          excludedChanges.push({
            change: existingChange,
            reason: 'duplicate',
            detail: `Duplicate change for PR #${change.pr}`,
          });
        }
        continue;
      }

      // Keep the first display entry while retaining metadata found later.
      existingChange.author ??= change.author;
      existingChange.url ??= change.url;
      if (excludedChanges && change.id !== existingChange.id) {
        excludedChanges.push({
          change,
          reason: 'duplicate',
          detail: `Duplicate change for PR #${change.pr}`,
        });
      }
      continue;
    }

    changesByPrNumber.set(change.pr, change);
    deduplicatedChanges.push(change);
  }

  return deduplicatedChanges;
}

/**
 * Check whether a pull request or any of its associated commits declares an explicit breaking change.
 * @param pullRequestTitle Pull request title string.
 * @param prCommits Associated commits for this pull request.
 * @returns True when a breaking change is explicitly declared.
 */
function isPullRequestBreaking(
  pullRequestTitle?: string,
  prCommits?: readonly CommitLite[],
): boolean {
  if (
    pullRequestTitle &&
    CONVENTIONAL_BREAKING_PREFIX_RE.test(pullRequestTitle)
  ) {
    return true;
  }
  return Boolean(prCommits?.some((commit) => commit.breaking));
}

/**
 * Determine whether a pull request can be safely expanded into sub-changes without losing
 * or misattributing explicit breaking change declarations.
 * WHY: If sub-change discovery excludes a breaking commit (e.g. chore/fixup) or the PR title
 * itself was breaking without commit-level breakdown, expanding into non-breaking sub-changes
 * would silently drop the breaking signal. In that case, preserving the PR-level change is required.
 * @param pullRequestTitle Pull request title string.
 * @param prCommits Associated commits for this pull request.
 * @param subChanges Discovered sub-changes.
 * @returns True when expansion is safe and accounts for all breaking declarations.
 */
function canSafelyExpandPrSubChanges(
  pullRequestTitle: string | undefined,
  prCommits: readonly CommitLite[],
  subChanges: readonly { commitSha?: string }[] | null,
): boolean {
  if (!subChanges || subChanges.length < 2) {
    return false;
  }

  const breakingCommits = prCommits.filter((commit) => commit.breaking);

  // If the PR title itself declared breaking, but none of the commits were breaking,
  // expanding into sub-changes would lose the PR title's breaking signal.
  const prTitleIsBreaking = Boolean(
    pullRequestTitle && CONVENTIONAL_BREAKING_PREFIX_RE.test(pullRequestTitle),
  );
  if (prTitleIsBreaking && breakingCommits.length === 0) {
    return false;
  }

  // If any commit has an explicit breaking declaration, verify that every breaking commit
  // is directly attributed to an expanded sub-change. If any breaking commit was excluded
  // (e.g. non-user-facing chore), do not expand so the breaking signal is never discarded.
  if (breakingCommits.length > 0) {
    const subChangeShas = new Set(
      subChanges
        .map((sub) => sub.commitSha)
        .filter((sha): sha is string => Boolean(sha)),
    );
    const allBreakingRepresented = breakingCommits.every((commit) =>
      subChangeShas.has(commit.sha),
    );
    if (!allBreakingRepresented) {
      return false;
    }
  }

  return true;
}

/**
 * Assign stable commit-based identities to commits in the release range before transforms.
 * WHY: Establishes an independent pre-transform ledger for commit-based sources, ensuring
 * that every commit subsequently replaced by or collapsed into a PR item is accounted for.
 * @param commits Commits included in the release range.
 * @returns Pre-transform release changes with unique commit identities.
 */
export function buildCommitReleaseChanges(
  commits: readonly CommitLite[],
): ReleaseChange[] {
  return commits.map((commit) => {
    const origin: ReleaseChangeOrigin = {
      kind: 'commit',
      sha: commit.sha,
    };
    return {
      id: buildReleaseChangeId(origin),
      origin,
      title: stripConventionalPrefix(commit.subject),
      rawTitle: commit.subject,
      ...(commit.breaking ? { breaking: true } : {}),
    };
  });
}

/**
 * Build release items from authoritative commit-to-PR associations.
 * WHY: HEAD may have no release body, while its commits already belong to an
 * open PR whose title and author are the stable parent changelog item.
 * @param commits Commits included in the release range.
 * @param pullRequestsBySha Pull request metadata keyed by commit SHA.
 * @param excludedChanges Optional collector for commits collapsed into parent PRs.
 * @returns PR-level and unmapped commit items, or an empty array without PR metadata.
 */
export function buildReleaseItemsFromPullRequests(
  commits: readonly CommitLite[],
  pullRequestsBySha: Readonly<Record<string, readonly PullRef[]>>,
  excludedChanges?: ExcludedReleaseChange[],
): ReleaseChange[] {
  if (commits.length === 0) return [];

  // Group commits by associated pull request number
  const commitsByPrNumber = new Map<
    number,
    { pullRequest: PullRef; commits: CommitLite[] }
  >();
  for (const commit of commits) {
    const pullRequest = findPullRequestWithTitle(commit.sha, pullRequestsBySha);
    if (pullRequest?.title) {
      let entry = commitsByPrNumber.get(pullRequest.number);
      if (!entry) {
        entry = { pullRequest, commits: [] };
        commitsByPrNumber.set(pullRequest.number, entry);
      }
      entry.commits.push(commit);
    }
  }

  const items: ReleaseChange[] = [];
  const processedPrNumbers = new Set<number>();
  let foundPullRequest = false;

  for (const commit of commits) {
    const pullRequest = findPullRequestWithTitle(commit.sha, pullRequestsBySha);
    if (!pullRequest?.title) {
      const origin: ReleaseChangeOrigin = {
        kind: 'commit',
        sha: commit.sha,
      };
      items.push({
        id: buildReleaseChangeId(origin),
        origin,
        title: stripConventionalPrefix(commit.subject),
        rawTitle: commit.subject,
        ...(commit.breaking ? { breaking: true } : {}),
      });
      continue;
    }

    foundPullRequest = true;

    if (!processedPrNumbers.has(pullRequest.number)) {
      processedPrNumbers.add(pullRequest.number);
      const prEntry = commitsByPrNumber.get(pullRequest.number)!;
      const isPrBreaking = isPullRequestBreaking(
        prEntry.pullRequest.title,
        prEntry.commits,
      );
      const subChanges = detectPrSubChangesFromCommits(
        pullRequest.number,
        prEntry.pullRequest.title ?? '',
        prEntry.commits,
      );

      if (
        canSafelyExpandPrSubChanges(
          prEntry.pullRequest.title,
          prEntry.commits,
          subChanges,
        ) &&
        subChanges
      ) {
        for (const sub of subChanges) {
          const origin: ReleaseChangeOrigin = {
            kind: 'pull-request-subchange',
            number: pullRequest.number,
            subIndex: sub.subIndex,
            commitSha: sub.commitSha,
          };
          const subCommit = prEntry.commits.find(
            (candidate) => candidate.sha === sub.commitSha,
          );
          items.push({
            id: buildReleaseChangeId(origin),
            origin,
            title: sub.title,
            rawTitle: sub.rawTitle,
            author: pullRequest.author,
            pr: pullRequest.number,
            url: pullRequest.url,
            ...(subCommit?.breaking ? { breaking: true } : {}),
          });
        }
      } else {
        const origin: ReleaseChangeOrigin = {
          kind: 'pull-request',
          number: pullRequest.number,
        };
        items.push({
          id: buildReleaseChangeId(origin),
          origin,
          title: stripConventionalPrefix(pullRequest.title),
          rawTitle: pullRequest.title,
          author: pullRequest.author,
          pr: pullRequest.number,
          url: pullRequest.url,
          ...(isPrBreaking ? { breaking: true } : {}),
        });
      }
    }

    // WHY: Every source commit replaced by a PR-level item or sub-change must be recorded
    // in excludedChanges with an explicit reason so that the pre-transform commit ledger
    // is independently and completely accounted for.
    if (excludedChanges) {
      const commitOrigin: ReleaseChangeOrigin = {
        kind: 'commit',
        sha: commit.sha,
      };
      excludedChanges.push({
        change: {
          id: buildReleaseChangeId(commitOrigin),
          origin: commitOrigin,
          title: stripConventionalPrefix(commit.subject),
          rawTitle: commit.subject,
          pr: pullRequest.number,
          url: pullRequest.url,
        },
        reason: 'collapsed-into-pr',
        detail: `Commit ${commit.sha} collapsed into PR #${pullRequest.number}`,
      });
    }
  }

  return foundPullRequest ? items : [];
}

/**
 * Expand PR-level release changes into sub-changes when associated commit history proves
 * multiple independently identifiable user-facing changes.
 * WHY: GitHub Release Notes flow parses PR-level items upfront from 'What's Changed'.
 * This function ensures multi-change sub-discovery runs for normal releaseBody flows as well as
 * commit-fallback flows, while recording expanded parent PRs in excludedChanges.
 * @param changes Release changes (parsed from release notes or commits).
 * @param commits Commits in the release range.
 * @param pullRequestsBySha PR references mapped by commit SHA.
 * @param excludedChanges Collector for parent PR items replaced by sub-changes.
 * @returns Release changes with qualified PR items expanded into sub-changes.
 */
export function expandReleaseChangesWithSubChanges(
  changes: readonly ReleaseChange[],
  commits: readonly CommitLite[],
  pullRequestsBySha: Readonly<Record<string, readonly PullRef[]>>,
  excludedChanges?: ExcludedReleaseChange[],
): ReleaseChange[] {
  if (changes.length === 0 || commits.length === 0) {
    return [...changes];
  }

  // Group commits by pull request number
  const commitsByPrNumber = new Map<number, CommitLite[]>();
  for (const commit of commits) {
    const pullRequest = findPullRequestWithTitle(commit.sha, pullRequestsBySha);
    if (pullRequest?.number) {
      let list = commitsByPrNumber.get(pullRequest.number);
      if (!list) {
        list = [];
        commitsByPrNumber.set(pullRequest.number, list);
      }
      list.push(commit);
    }
  }

  const result: ReleaseChange[] = [];

  for (const change of changes) {
    if (change.pr === undefined || change.origin.kind !== 'pull-request') {
      result.push(change);
      continue;
    }

    const prCommits = commitsByPrNumber.get(change.pr);
    const prTitle = change.rawTitle ?? change.title;
    const isPrBreaking = isPullRequestBreaking(prTitle, prCommits);

    if (!prCommits || prCommits.length < 2) {
      if (isPrBreaking && !change.breaking) {
        result.push({ ...change, breaking: true });
      } else {
        result.push(change);
      }
      continue;
    }

    const subChanges = detectPrSubChangesFromCommits(
      change.pr,
      prTitle,
      prCommits,
    );

    if (
      !canSafelyExpandPrSubChanges(prTitle, prCommits, subChanges) ||
      !subChanges
    ) {
      if (isPrBreaking && !change.breaking) {
        result.push({ ...change, breaking: true });
      } else {
        result.push(change);
      }
      continue;
    }

    // Expand into sub-changes
    for (const sub of subChanges) {
      const origin: ReleaseChangeOrigin = {
        kind: 'pull-request-subchange',
        number: change.pr,
        subIndex: sub.subIndex,
        commitSha: sub.commitSha,
      };
      const subCommit = prCommits.find(
        (candidate) => candidate.sha === sub.commitSha,
      );
      result.push({
        id: buildReleaseChangeId(origin),
        origin,
        title: sub.title,
        rawTitle: sub.rawTitle,
        author: change.author,
        pr: change.pr,
        url: change.url,
        ...(subCommit?.breaking ? { breaking: true } : {}),
      });
    }

    // Record original parent PR in excludedChanges
    if (excludedChanges) {
      excludedChanges.push({
        change:
          isPrBreaking && !change.breaking
            ? { ...change, breaking: true }
            : change,
        reason: 'collapsed-into-pr',
        detail: `Expanded into sub-changes for PR #${change.pr}`,
      });
    }
  }

  return result;
}
