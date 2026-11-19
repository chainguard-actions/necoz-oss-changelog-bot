// @ts-nocheck
import { test, expect, describe } from '@jest/globals';
import { attachPrNumbers } from '@/utils/attach-pr.js';

describe('attachPrNumbers', () => {
  test('adds PR reference when missing', () => {
    const md = ['### Added', '- Add feature', ''].join('\n');

    const out = attachPrNumbers(md, { 'Add feature': 42 });

    expect(out).toContain('- Add feature (#42)');
  });

  test('does not duplicate existing PR references', () => {
    const md = ['### Added', '- Add feature (#42)', ''].join('\n');

    const out = attachPrNumbers(md, { 'Add feature': 42 });

    expect(out.match(/#42/g)?.length).toBe(1);
  });

  test('matches normalized titles with conventional prefixes', () => {
    const md = ['### Added', '- feat: Add feature', ''].join('\n');

    const out = attachPrNumbers(md, { 'Add feature': 99 });

    expect(out).toContain('- feat: Add feature (#99)');
  });

  test('does not attach PR references to nested detail bullets', () => {
    const md = [
      '### Added',
      '- Add feature',
      '  - Fix internal edge case',
      '',
    ].join('\n');

    const out = attachPrNumbers(
      md,
      { 'Add feature': 42, 'Fix internal edge case': 42 },
      { owner: 'octo', repo: 'repo' },
    );

    expect(out).toContain(
      '- Add feature in [#42](https://github.com/octo/repo/pull/42)',
    );
    expect(out).toContain('  - Fix internal edge case');
    expect(out).not.toContain(
      'Fix internal edge case in [#42](https://github.com/octo/repo/pull/42)',
    );
  });

  test('preserves bullet lines inside triple-backtick fences', () => {
    const md = [
      '### Added',
      '- Add feature',
      '',
      '```text',
      '- Add feature',
      '```',
      '',
    ].join('\n');

    const out = attachPrNumbers(md, { 'Add feature': 42 });

    const lines = out.split('\n');
    expect(lines[1]).toBe('- Add feature (#42)');
    expect(lines[4]).toBe('- Add feature');
    expect(out.match(/\(#42\)/g)?.length).toBe(1);
  });

  test('preserves bullet lines inside triple-tilde fences', () => {
    const md = [
      '### Added',
      '~~~md',
      '- Add feature',
      '~~~',
      '- Add feature',
      '',
    ].join('\n');

    const out = attachPrNumbers(md, { 'Add feature': 42 });

    const lines = out.split('\n');
    expect(lines[2]).toBe('- Add feature');
    expect(lines[4]).toBe('- Add feature (#42)');
  });

  test('a shorter fence does not close a longer one', () => {
    const md = [
      '````md',
      '- Add feature',
      '```',
      '- Add feature',
      '````',
      '- Add feature',
      '',
    ].join('\n');

    const out = attachPrNumbers(md, { 'Add feature': 42 });

    const lines = out.split('\n');
    expect(lines[1]).toBe('- Add feature');
    expect(lines[3]).toBe('- Add feature');
    expect(lines[5]).toBe('- Add feature (#42)');
  });

  test('a backtick fence does not close a tilde fence', () => {
    const md = [
      '~~~md',
      '```',
      '- Add feature',
      '~~~',
      '- Add feature',
      '',
    ].join('\n');

    const out = attachPrNumbers(md, { 'Add feature': 42 });

    const lines = out.split('\n');
    expect(lines[2]).toBe('- Add feature');
    expect(lines[4]).toBe('- Add feature (#42)');
  });

  test.each(['\n', '\r\n'])(
    'does not open a backtick fence with backticks in the info string (%j)',
    (lineEnding) => {
      const lines = ['```inline code```', '', '- Add feature', ''];
      const expected = [lines[0], '', '- Add feature (#42)', ''];
      expect(
        attachPrNumbers(lines.join(lineEnding), { 'Add feature': 42 }),
      ).toBe(expected.join(lineEnding));
    },
  );

  test('allows backticks in the info string of a tilde fence', () => {
    const lines = ['~~~md `example`', '- Add feature', '~~~', '- Add feature'];
    const expected = [...lines];
    expected[3] = '- Add feature (#42)';

    expect(attachPrNumbers(lines.join('\n'), { 'Add feature': 42 })).toBe(
      expected.join('\n'),
    );
  });

  test.each(['```', '~~~'])(
    'does not close a %s fence when text follows the delimiter',
    (fence) => {
      const lines = [
        `${fence}md`,
        `${fence}not-a-closing-fence`,
        '- Add feature',
        `${fence} \tstill-not-a-closing-fence`,
        '- Add feature',
        fence,
        '- Add feature',
        '',
      ];
      const expected = [...lines];
      expected[6] = '- Add feature (#42)';

      expect(attachPrNumbers(lines.join('\n'), { 'Add feature': 42 })).toBe(
        expected.join('\n'),
      );
    },
  );

  test.each(['```', '~~~'])(
    'allows longer %s closing fences with spaces and tabs',
    (fence) => {
      const lines = [
        `   ${fence}md`,
        '- Add feature',
        `  ${fence}${fence} \t`,
        '- Add feature',
        '',
      ];
      const expected = [...lines];
      expected[3] = '- Add feature (#42)';

      expect(attachPrNumbers(lines.join('\n'), { 'Add feature': 42 })).toBe(
        expected.join('\n'),
      );
    },
  );

  test.each(['    ```', '\t```', '\u00a0```', '```\u00a0'])(
    'does not close a fence with invalid whitespace: %s',
    (invalidFence) => {
      const lines = [
        '```',
        invalidFence,
        '- Add feature',
        '```',
        '- Add feature',
      ];
      const expected = [...lines];
      expected[4] = '- Add feature (#42)';

      expect(attachPrNumbers(lines.join('\n'), { 'Add feature': 42 })).toBe(
        expected.join('\n'),
      );
    },
  );

  test.each(['    ```', '\t```', '\u00a0```'])(
    'does not open a fence with invalid indentation: %s',
    (invalidFence) => {
      const md = [invalidFence, '- Add feature', ''].join('\n');
      const expected = [invalidFence, '- Add feature (#42)', ''].join('\n');

      expect(attachPrNumbers(md, { 'Add feature': 42 })).toBe(expected);
    },
  );

  test.each([undefined, { owner: 'octo', repo: 'repo' }])(
    'preserves CRLF around fenced blocks and linked bullets with repo %p',
    (repo) => {
      const lines = [
        '- Add feature',
        '```text',
        '```not-a-closing-fence',
        '- Add feature',
        '   ```` \t',
        '- Add feature',
        '',
      ];
      const expected = [...lines];
      const linkedBullet = repo
        ? '- Add feature in [#42](https://github.com/octo/repo/pull/42)'
        : '- Add feature (#42)';
      expected[0] = linkedBullet;
      expected[5] = linkedBullet;

      expect(
        attachPrNumbers(lines.join('\r\n'), { 'Add feature': 42 }, repo),
      ).toBe(expected.join('\r\n'));
    },
  );
});
