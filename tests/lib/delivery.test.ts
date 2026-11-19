import { describe, expect, jest, test } from '@jest/globals';
import {
  deliverChangelog,
  type DeliverChangelogDependencies,
} from '@/lib/delivery.js';
import type { GeneratedChangelog } from '@/types/delivery.js';

describe('deliverChangelog', () => {
  const basePayload: GeneratedChangelog = {
    destination: 'pull-request',
    releaseSectionMarkdown:
      '## [1.2.3] - 2026-11-08\n\n### Added\n- New feature (#1)',
    updatedChangelog:
      '# Changelog\n\n## [1.2.3] - 2026-11-08\n\n### Added\n- New feature (#1)',
    changelogPath: 'CHANGELOG.md',
    version: '1.2.3',
    token: 'test-token',
    deliveryMetadata: {
      owner: 'octo',
      repo: 'repo',
      baseBranch: 'main',
      branchName: 'chore/changelog-v1.2.3',
      title: 'docs(changelog): 1.2.3',
      body: 'Automated changelog update',
      labels: ['changelog', 'release'],
    },
    outcome: {
      kind: 'release',
      result: {
        version: '1.2.3',
        date: '2026-11-08',
        changes: [],
        assignments: {},
        excludedChanges: [],
        sourceChanges: [],
      },
    },
  };

  function createMockDeps(): DeliverChangelogDependencies {
    return {
      ensureGithubTokenRequired: jest.fn(),
      writeChangelog: jest.fn(),
      createPR: jest.fn<DeliverChangelogDependencies['createPR']>(
        async () => 42,
      ),
      writeStdout: jest.fn(),
      log: jest.fn(),
    };
  }

  test('delivers pull-request by writing file and creating PR', async () => {
    const deps = createMockDeps();
    const result = await deliverChangelog(
      { ...basePayload, destination: 'pull-request' },
      deps,
    );

    expect(deps.ensureGithubTokenRequired).toHaveBeenCalledWith(
      false,
      'test-token',
    );
    expect(deps.writeChangelog).toHaveBeenCalledWith(
      'CHANGELOG.md',
      basePayload.updatedChangelog,
    );
    expect(deps.createPR).toHaveBeenCalledWith({
      owner: 'octo',
      repo: 'repo',
      baseBranch: 'main',
      branchName: 'chore/changelog-v1.2.3',
      title: 'docs(changelog): 1.2.3',
      body: 'Automated changelog update',
      labels: ['changelog', 'release'],
      token: 'test-token',
      changelogEntry: 'CHANGELOG.md',
    });
    expect(deps.log).toHaveBeenCalledWith('Created PR #42');
    expect(deps.writeStdout).not.toHaveBeenCalled();
    expect(result).toEqual({
      destination: 'pull-request',
      prNumber: 42,
      skipped: false,
    });
  });

  test('delivers file by updating changelog without git or token requirements', async () => {
    const deps = createMockDeps();
    const result = await deliverChangelog(
      {
        ...basePayload,
        destination: 'file',
        token: undefined,
      },
      deps,
    );

    expect(deps.ensureGithubTokenRequired).not.toHaveBeenCalled();
    expect(deps.writeChangelog).toHaveBeenCalledWith(
      'CHANGELOG.md',
      basePayload.updatedChangelog,
    );
    expect(deps.createPR).not.toHaveBeenCalled();
    expect(deps.writeStdout).not.toHaveBeenCalled();
    expect(deps.log).toHaveBeenCalledWith(
      'Updated CHANGELOG.md for release v1.2.3',
    );
    expect(result).toEqual({
      destination: 'file',
      changelogPath: 'CHANGELOG.md',
      skipped: false,
    });
  });

  test('delivers stdout by writing release markdown without modifying files or git state', async () => {
    const deps = createMockDeps();
    const result = await deliverChangelog(
      {
        ...basePayload,
        destination: 'stdout',
        token: undefined,
      },
      deps,
    );

    expect(deps.ensureGithubTokenRequired).not.toHaveBeenCalled();
    expect(deps.writeChangelog).not.toHaveBeenCalled();
    expect(deps.createPR).not.toHaveBeenCalled();
    expect(deps.writeStdout).toHaveBeenCalledWith(
      basePayload.releaseSectionMarkdown,
    );
    expect(deps.log).not.toHaveBeenCalled();
    expect(result).toEqual({
      destination: 'stdout',
      skipped: false,
    });
  });

  test('skips pull-request delivery when outcome is no-changes', async () => {
    const deps = createMockDeps();
    const result = await deliverChangelog(
      {
        ...basePayload,
        destination: 'pull-request',
        outcome: {
          kind: 'no-changes',
          version: '1.2.3',
          date: '2026-11-08',
          excludedChanges: [],
        },
      },
      deps,
    );

    expect(deps.ensureGithubTokenRequired).not.toHaveBeenCalled();
    expect(deps.writeChangelog).not.toHaveBeenCalled();
    expect(deps.createPR).not.toHaveBeenCalled();
    expect(deps.log).toHaveBeenCalledWith(
      'No changes found for release v1.2.3; skipping PR creation.',
    );
    expect(result).toEqual({
      destination: 'pull-request',
      skipped: true,
      reason: 'no-changes',
    });
  });

  test('skips file delivery when outcome is no-changes', async () => {
    const deps = createMockDeps();
    const result = await deliverChangelog(
      {
        ...basePayload,
        destination: 'file',
        outcome: {
          kind: 'no-changes',
          version: '1.2.3',
          date: '2026-11-08',
          excludedChanges: [],
        },
      },
      deps,
    );

    expect(deps.writeChangelog).not.toHaveBeenCalled();
    expect(deps.log).toHaveBeenCalledWith(
      'No changes found for release v1.2.3; skipping file update.',
    );
    expect(result).toEqual({
      destination: 'file',
      changelogPath: 'CHANGELOG.md',
      skipped: true,
      reason: 'no-changes',
    });
  });

  test('skips stdout delivery when outcome is no-changes', async () => {
    const deps = createMockDeps();
    const result = await deliverChangelog(
      {
        ...basePayload,
        destination: 'stdout',
        outcome: {
          kind: 'no-changes',
          version: '1.2.3',
          date: '2026-11-08',
          excludedChanges: [],
        },
      },
      deps,
    );

    expect(deps.writeStdout).not.toHaveBeenCalled();
    expect(deps.log).toHaveBeenCalledWith(
      'No changes found for release v1.2.3; nothing to output.',
    );
    expect(result).toEqual({
      destination: 'stdout',
      skipped: true,
      reason: 'no-changes',
    });
  });
});
