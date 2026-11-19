import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from '@jest/globals';
import {
  commitsFromMerge,
  commitsInRange,
  currentBranch,
  dateForRef,
  firstCommit,
  gitMergedPRs,
  parseCommitsFromLog,
  run,
  tryDetectLatestTag,
  tryDetectPrevTag,
  tryRun,
} from '@/lib/git.js';

function executeGit(repositoryPath: string, args: string[]): string {
  return execFileSync('git', args, {
    cwd: repositoryPath,
    encoding: 'utf8',
  }).trim();
}

describe('git repository helpers', () => {
  let repositoryPath: string;
  let initialCommitSha: string;
  let featureCommitSha: string;
  let mergeCommitSha: string;

  beforeAll(() => {
    repositoryPath = mkdtempSync(join(tmpdir(), 'changelog-bot-git-'));
    executeGit(repositoryPath, ['init', '--initial-branch=main']);
    executeGit(repositoryPath, ['config', 'user.name', 'Changelog Bot Test']);
    executeGit(repositoryPath, [
      'config',
      'user.email',
      'changelog-bot@example.com',
    ]);

    writeFileSync(join(repositoryPath, 'README.md'), 'initial\n', 'utf8');
    executeGit(repositoryPath, ['add', 'README.md']);
    executeGit(repositoryPath, ['commit', '-m', 'chore: initial commit']);
    initialCommitSha = executeGit(repositoryPath, ['rev-parse', 'HEAD']);
    executeGit(repositoryPath, ['tag', 'v1.0.0']);

    executeGit(repositoryPath, ['checkout', '-b', 'feature']);
    writeFileSync(join(repositoryPath, 'feature.txt'), 'feature\n', 'utf8');
    executeGit(repositoryPath, ['add', 'feature.txt']);
    executeGit(repositoryPath, ['commit', '-m', 'feat: add feature']);
    featureCommitSha = executeGit(repositoryPath, ['rev-parse', 'HEAD']);

    executeGit(repositoryPath, ['checkout', 'main']);
    writeFileSync(join(repositoryPath, 'main.txt'), 'main\n', 'utf8');
    executeGit(repositoryPath, ['add', 'main.txt']);
    executeGit(repositoryPath, ['commit', '-m', 'docs: update main']);
    executeGit(repositoryPath, [
      'merge',
      '--no-ff',
      'feature',
      '-m',
      'Merge pull request #42 from feature',
      '-m',
      'Add the release feature.',
    ]);
    mergeCommitSha = executeGit(repositoryPath, ['rev-parse', 'HEAD']);
    executeGit(repositoryPath, ['tag', 'v1.1.0']);
  });

  afterAll(() => {
    rmSync(repositoryPath, { recursive: true, force: true });
  });

  test('reads branch, tag, commit, and date metadata', () => {
    expect(run(['branch', '--show-current'], repositoryPath)).toBe('main');
    expect(currentBranch(repositoryPath)).toBe('main');
    expect(tryDetectLatestTag(repositoryPath)).toBe('v1.1.0');
    expect(tryDetectPrevTag('v1.1.0', repositoryPath)).toBe('v1.0.0');
    expect(firstCommit(repositoryPath)).toBe(initialCommitSha);
    expect(dateForRef('v1.1.0', repositoryPath)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test('enumerates commit ranges and merge contents', () => {
    const commits = commitsInRange('v1.0.0', 'v1.1.0', repositoryPath);

    expect(commits).toEqual(
      expect.arrayContaining([
        { sha: featureCommitSha, subject: 'feat: add feature' },
        {
          sha: mergeCommitSha,
          subject: 'Merge pull request #42 from feature',
        },
      ]),
    );
    expect(gitMergedPRs('v1.0.0', 'v1.1.0', repositoryPath)).toContain(
      `${mergeCommitSha} Add the release feature.`,
    );
    expect(commitsFromMerge(mergeCommitSha, repositoryPath)).toContain(
      featureCommitSha,
    );
  });

  test('parses multiple commits in exact sequence with empty, multiline, literal separator, and breaking declarations', () => {
    executeGit(repositoryPath, ['checkout', '-b', 'multi-commit-range-test']);

    writeFileSync(join(repositoryPath, 'c1.txt'), 'c1\n', 'utf8');
    executeGit(repositoryPath, ['add', 'c1.txt']);
    executeGit(repositoryPath, ['commit', '-m', 'chore: empty body commit']);
    const commit1Sha = executeGit(repositoryPath, ['rev-parse', 'HEAD']);

    writeFileSync(join(repositoryPath, 'c2.txt'), 'c2\n', 'utf8');
    executeGit(repositoryPath, ['add', 'c2.txt']);
    executeGit(repositoryPath, [
      'commit',
      '-m',
      'feat: multiline body commit\n\nFirst paragraph of details.\n\nSecond paragraph of details.',
    ]);
    const commit2Sha = executeGit(repositoryPath, ['rev-parse', 'HEAD']);

    writeFileSync(join(repositoryPath, 'c3.txt'), 'c3\n', 'utf8');
    executeGit(repositoryPath, ['add', 'c3.txt']);
    executeGit(repositoryPath, [
      'commit',
      '-m',
      'fix: test\x1ewith\x1fseparators\n\nBody containing \x1e and \x1f literal characters.',
    ]);
    const commit3Sha = executeGit(repositoryPath, ['rev-parse', 'HEAD']);

    writeFileSync(join(repositoryPath, 'c4.txt'), 'c4\n', 'utf8');
    executeGit(repositoryPath, ['add', 'c4.txt']);
    executeGit(repositoryPath, [
      'commit',
      '-m',
      'fix: update api\n\nBREAKING CHANGE: drop legacy endpoints',
    ]);
    const commit4Sha = executeGit(repositoryPath, ['rev-parse', 'HEAD']);

    writeFileSync(join(repositoryPath, 'c5.txt'), 'c5\n', 'utf8');
    executeGit(repositoryPath, ['add', 'c5.txt']);
    executeGit(repositoryPath, [
      'commit',
      '-m',
      'feat!: overhaul architecture\n\nNew architecture implementation.',
    ]);
    const commit5Sha = executeGit(repositoryPath, ['rev-parse', 'HEAD']);

    try {
      const commits = commitsInRange('v1.1.0', 'HEAD', repositoryPath);
      // Assert the complete resulting commit array with toEqual to verify order,
      // absence of unexpected/duplicated/missing records, and clean metadata boundaries.
      expect(commits).toEqual([
        {
          sha: commit5Sha,
          subject: 'feat!: overhaul architecture',
          breaking: true,
        },
        {
          sha: commit4Sha,
          subject: 'fix: update api',
          breaking: true,
        },
        {
          sha: commit3Sha,
          subject: 'fix: test\x1ewith\x1fseparators',
        },
        {
          sha: commit2Sha,
          subject: 'feat: multiline body commit',
        },
        {
          sha: commit1Sha,
          subject: 'chore: empty body commit',
        },
      ]);
    } finally {
      executeGit(repositoryPath, ['checkout', 'main']);
      executeGit(repositoryPath, ['branch', '-D', 'multi-commit-range-test']);
    }
  });

  test('parseCommitsFromLog returns empty array for empty log output', () => {
    expect(parseCommitsFromLog('')).toEqual([]);
  });

  test('parseCommitsFromLog throws for incomplete record structures', () => {
    // Only 2 fields instead of 3
    const incomplete =
      '0123456789abcdef0123456789abcdef01234567\0feat: incomplete';
    expect(() => parseCommitsFromLog(incomplete)).toThrow(
      /incomplete record structure/,
    );
  });

  test('parseCommitsFromLog throws for invalid commit SHA', () => {
    const invalidSha = 'not-a-valid-sha\0feat: invalid sha\0body text';
    expect(() => parseCommitsFromLog(invalidSha)).toThrow(
      /invalid commit SHA "not-a-valid-sha"/,
    );
  });

  test('returns null for failed optional Git lookups', () => {
    expect(tryRun(['not-a-command'], repositoryPath)).toBeNull();
  });

  test('returns null when HEAD is detached', () => {
    executeGit(repositoryPath, ['checkout', '--detach', mergeCommitSha]);

    try {
      expect(currentBranch(repositoryPath)).toBeNull();
    } finally {
      executeGit(repositoryPath, ['checkout', 'main']);
    }
  });
});
