import { describe, expect, test } from '@jest/globals';
import {
  buildReleaseChangeId,
  buildReleaseItemsFromPullRequests,
  deduplicateReleaseChangesByPullRequest,
  expandReleaseChangesWithSubChanges,
} from '@/utils/release-items.js';
import type {
  ExcludedReleaseChange,
  ReleaseChange,
  ReleaseChangeOrigin,
} from '@/types/release.js';

describe('release-items identity and helpers', () => {
  test('buildReleaseChangeId produces pr:<number> for pull-request origin', () => {
    const origin: ReleaseChangeOrigin = {
      kind: 'pull-request',
      number: 42,
    };
    expect(buildReleaseChangeId(origin)).toBe('pr:42');
  });

  test('buildReleaseChangeId produces pr:<number>:c<subIndex> for pull-request-subchange origin', () => {
    const origin1: ReleaseChangeOrigin = {
      kind: 'pull-request-subchange',
      number: 42,
      subIndex: 1,
      commitSha: 'abcdef123',
    };
    const origin2: ReleaseChangeOrigin = {
      kind: 'pull-request-subchange',
      number: 42,
      subIndex: 2,
    };

    expect(buildReleaseChangeId(origin1)).toBe('pr:42:c1');
    expect(buildReleaseChangeId(origin2)).toBe('pr:42:c2');
  });

  test('buildReleaseChangeId produces commit:<sha> for commit origin', () => {
    const origin: ReleaseChangeOrigin = {
      kind: 'commit',
      sha: 'abcdef123456',
    };
    expect(buildReleaseChangeId(origin)).toBe('commit:abcdef123456');
  });

  test('buildReleaseChangeId produces release-note:<index> for release-note origin', () => {
    const origin: ReleaseChangeOrigin = {
      kind: 'release-note',
      index: 3,
    };
    expect(buildReleaseChangeId(origin)).toBe('release-note:3');
  });

  test('buildReleaseChangeId throws on unknown origin kind', () => {
    const invalidOrigin = {
      kind: 'unknown-origin',
    } as unknown as ReleaseChangeOrigin;

    expect(() => buildReleaseChangeId(invalidOrigin)).toThrow(
      'Unsupported release-change origin',
    );
  });
});

describe('buildReleaseItemsFromPullRequests with sub-changes', () => {
  test('uses the first associated pull request with a non-empty title', () => {
    const items = buildReleaseItemsFromPullRequests(
      [{ sha: 'c1', subject: 'feat: add a feature' }],
      {
        c1: [
          { number: 41, title: '   ' },
          { number: 42, title: 'feat: first titled pull request' },
          { number: 43, title: 'feat: later titled pull request' },
        ],
      },
    );

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: 'pr:42',
      origin: { kind: 'pull-request', number: 42 },
      title: 'first titled pull request',
      pr: 42,
    });
  });

  test('creates individual sub-changes when a PR contains multiple distinct user-facing commits', () => {
    const excludedChanges: ExcludedReleaseChange[] = [];
    const items = buildReleaseItemsFromPullRequests(
      [
        { sha: 'c1', subject: 'feat: add user authentication' },
        { sha: 'c2', subject: 'fix: resolve race condition in token refresh' },
      ],
      {
        c1: [
          {
            number: 42,
            title: 'feat: auth and session handling',
            author: 'alice',
            url: 'https://github.com/acme/tool/pull/42',
          },
        ],
        c2: [
          {
            number: 42,
            title: 'feat: auth and session handling',
            author: 'alice',
            url: 'https://github.com/acme/tool/pull/42',
          },
        ],
      },
      excludedChanges,
    );

    expect(items).toHaveLength(2);
    expect(items[0]).toEqual({
      id: 'pr:42:c1',
      origin: {
        kind: 'pull-request-subchange',
        number: 42,
        subIndex: 1,
        commitSha: 'c1',
      },
      title: 'add user authentication',
      rawTitle: 'feat: add user authentication',
      author: 'alice',
      pr: 42,
      url: 'https://github.com/acme/tool/pull/42',
    });
    expect(items[1]).toEqual({
      id: 'pr:42:c2',
      origin: {
        kind: 'pull-request-subchange',
        number: 42,
        subIndex: 2,
        commitSha: 'c2',
      },
      title: 'resolve race condition in token refresh',
      rawTitle: 'fix: resolve race condition in token refresh',
      author: 'alice',
      pr: 42,
      url: 'https://github.com/acme/tool/pull/42',
    });

    // Both source commits are recorded in excludedChanges
    expect(excludedChanges).toHaveLength(2);
    expect(excludedChanges[0].change.id).toBe('commit:c1');
    expect(excludedChanges[0].reason).toBe('collapsed-into-pr');
    expect(excludedChanges[1].change.id).toBe('commit:c2');
    expect(excludedChanges[1].reason).toBe('collapsed-into-pr');
  });

  test('preserves single pr:<number> change when multi-commit PR is homogeneous or contains fixups', () => {
    const excludedChanges: ExcludedReleaseChange[] = [];
    const items = buildReleaseItemsFromPullRequests(
      [
        { sha: 'c1', subject: 'feat: add dark mode' },
        { sha: 'c2', subject: 'fix: typo in dark mode settings' },
        { sha: 'c3', subject: 'chore: lint fix' },
      ],
      {
        c1: [{ number: 10, title: 'feat: add dark mode', author: 'bob' }],
        c2: [{ number: 10, title: 'feat: add dark mode', author: 'bob' }],
        c3: [{ number: 10, title: 'feat: add dark mode', author: 'bob' }],
      },
      excludedChanges,
    );

    expect(items).toHaveLength(1);
    expect(items[0].id).toBe('pr:10');
    expect(items[0].origin).toEqual({ kind: 'pull-request', number: 10 });
    expect(excludedChanges).toHaveLength(3);
  });
});

describe('deduplicateReleaseChangesByPullRequest with sub-changes', () => {
  test('preserves distinct sub-changes of the same pull request', () => {
    const subChange1: ReleaseChange = {
      id: 'pr:42:c1',
      origin: { kind: 'pull-request-subchange', number: 42, subIndex: 1 },
      title: 'change 1',
      pr: 42,
    };
    const subChange2: ReleaseChange = {
      id: 'pr:42:c2',
      origin: { kind: 'pull-request-subchange', number: 42, subIndex: 2 },
      title: 'change 2',
      pr: 42,
    };

    const result = deduplicateReleaseChangesByPullRequest([
      subChange1,
      subChange2,
    ]);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('pr:42:c1');
    expect(result[1].id).toBe('pr:42:c2');
  });

  test('deduplicates duplicate occurrences of the same sub-change ID without polluting excludedChanges', () => {
    const subChange1: ReleaseChange = {
      id: 'pr:42:c1',
      origin: { kind: 'pull-request-subchange', number: 42, subIndex: 1 },
      title: 'change 1',
      pr: 42,
    };
    const duplicateSubChange1: ReleaseChange = {
      id: 'pr:42:c1',
      origin: { kind: 'pull-request-subchange', number: 42, subIndex: 1 },
      title: 'change 1 duplicate',
      pr: 42,
    };

    const excludedChanges: ExcludedReleaseChange[] = [];
    const result = deduplicateReleaseChangesByPullRequest(
      [subChange1, duplicateSubChange1],
      excludedChanges,
    );

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('pr:42:c1');
    // Sibling sub-change duplicate must NOT be added to excludedChanges with the same ID
    expect(excludedChanges).toHaveLength(0);
  });
});

describe('expandReleaseChangesWithSubChanges', () => {
  test('expands PR change into sub-changes when commits demonstrate multiple distinct changes', () => {
    const parentPrChange: ReleaseChange = {
      id: 'pr:42',
      origin: { kind: 'pull-request', number: 42 },
      title: 'multi-feature PR',
      pr: 42,
      author: 'alice',
      url: 'https://github.com/acme/tool/pull/42',
    };
    const standaloneChange: ReleaseChange = {
      id: 'pr:43',
      origin: { kind: 'pull-request', number: 43 },
      title: 'single fix',
      pr: 43,
      author: 'bob',
    };

    const commits = [
      { sha: 'c1', subject: 'feat: add user authentication' },
      { sha: 'c2', subject: 'fix: resolve race condition in token refresh' },
      { sha: 'c3', subject: 'fix: button alignment' },
    ];
    const pullRequestsBySha = {
      c1: [{ number: 42, title: 'multi-feature PR' }],
      c2: [{ number: 42, title: 'multi-feature PR' }],
      c3: [{ number: 43, title: 'single fix' }],
    };

    const excludedChanges: ExcludedReleaseChange[] = [];
    const result = expandReleaseChangesWithSubChanges(
      [parentPrChange, standaloneChange],
      commits,
      pullRequestsBySha,
      excludedChanges,
    );

    expect(result).toHaveLength(3);
    expect(result[0]).toMatchObject({
      id: 'pr:42:c1',
      title: 'add user authentication',
      pr: 42,
    });
    expect(result[1]).toMatchObject({
      id: 'pr:42:c2',
      title: 'resolve race condition in token refresh',
      pr: 42,
    });
    expect(result[2]).toMatchObject({
      id: 'pr:43',
      title: 'single fix',
      pr: 43,
    });

    // Parent item is recorded in excludedChanges
    expect(excludedChanges).toHaveLength(1);
    expect(excludedChanges[0].change.id).toBe('pr:42');
    expect(excludedChanges[0].reason).toBe('collapsed-into-pr');
  });

  test('preserves PR changes without changes when commits do not meet multi-change threshold', () => {
    const parentPrChange: ReleaseChange = {
      id: 'pr:42',
      origin: { kind: 'pull-request', number: 42 },
      title: 'feature with chore',
      pr: 42,
    };
    const commits = [
      { sha: 'c1', subject: 'feat: add feature' },
      { sha: 'c2', subject: 'chore: lint fix' },
    ];
    const pullRequestsBySha = {
      c1: [{ number: 42, title: 'feature with chore' }],
      c2: [{ number: 42, title: 'feature with chore' }],
    };

    const excludedChanges: ExcludedReleaseChange[] = [];
    const result = expandReleaseChangesWithSubChanges(
      [parentPrChange],
      commits,
      pullRequestsBySha,
      excludedChanges,
    );

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('pr:42');
    expect(excludedChanges).toHaveLength(0);
  });

  test('propagates breaking flag to single-commit PR item', () => {
    const items = buildReleaseItemsFromPullRequests(
      [{ sha: 'c1', subject: 'feat: add breaking API', breaking: true }],
      {
        c1: [{ number: 50, title: 'feat: add breaking API', author: 'alice' }],
      },
    );

    expect(items).toHaveLength(1);
    expect(items[0].id).toBe('pr:50');
    expect(items[0].breaking).toBe(true);
  });

  test('detects breaking declaration in PR title even if commit is not marked breaking', () => {
    const items = buildReleaseItemsFromPullRequests(
      [{ sha: 'c1', subject: 'feat: normal commit' }],
      {
        c1: [{ number: 51, title: 'feat!: breaking PR title', author: 'bob' }],
      },
    );

    expect(items).toHaveLength(1);
    expect(items[0].id).toBe('pr:51');
    expect(items[0].breaking).toBe(true);
  });

  test('attributes breaking flag specifically to the breaking sub-change when expanded', () => {
    const parentPrChange: ReleaseChange = {
      id: 'pr:60',
      origin: { kind: 'pull-request', number: 60 },
      title: 'multi-change PR',
      pr: 60,
    };
    const commits = [
      { sha: 'c1', subject: 'feat: add new feature' },
      { sha: 'c2', subject: 'fix: drop old method', breaking: true },
    ];
    const pullRequestsBySha = {
      c1: [{ number: 60, title: 'multi-change PR' }],
      c2: [{ number: 60, title: 'multi-change PR' }],
    };

    const result = expandReleaseChangesWithSubChanges(
      [parentPrChange],
      commits,
      pullRequestsBySha,
    );

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('pr:60:c1');
    expect(result[0].breaking).toBeUndefined();
    expect(result[1].id).toBe('pr:60:c2');
    expect(result[1].breaking).toBe(true);
  });

  test('aborts sub-change expansion and retains parent PR as breaking when a breaking commit would be excluded', () => {
    const parentPrChange: ReleaseChange = {
      id: 'pr:70',
      origin: { kind: 'pull-request', number: 70 },
      title: 'feature with breaking chore',
      pr: 70,
    };
    const commits = [
      { sha: 'c1', subject: 'feat: normal user-facing feature' },
      { sha: 'c2', subject: 'fix: another fix' },
      // chore commit is breaking, but standard sub-change classification might exclude chore
      { sha: 'c3', subject: 'chore: drop node 18', breaking: true },
    ];
    const pullRequestsBySha = {
      c1: [{ number: 70, title: 'feature with breaking chore' }],
      c2: [{ number: 70, title: 'feature with breaking chore' }],
      c3: [{ number: 70, title: 'feature with breaking chore' }],
    };

    const excludedChanges: ExcludedReleaseChange[] = [];
    const result = expandReleaseChangesWithSubChanges(
      [parentPrChange],
      commits,
      pullRequestsBySha,
      excludedChanges,
    );

    // Expansion should be rejected to prevent losing the breaking change from the excluded commit
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('pr:70');
    expect(result[0].breaking).toBe(true);
    expect(excludedChanges).toHaveLength(0);
  });
});
