import { describe, expect, test } from '@jest/globals';
import {
  hasConventionalBreakingDeclaration,
  hasConventionalBreakingFooter,
} from '@/utils/conventional.js';

describe('conventional breaking change detection', () => {
  describe('hasConventionalBreakingFooter', () => {
    test.each([
      ['BREAKING CHANGE: drop legacy configuration option'],
      ['BREAKING-CHANGE: rename parameter to prevent ambiguity'],
      ['Some context\n\nBREAKING CHANGE: remove deprecated method'],
      ['Some context\n\nBREAKING-CHANGE: switch default port to 8080'],
      ['BREAKING CHANGE: drop node 18\nand bump minimum engine to 20'],
      [
        'Closes #42\nBREAKING CHANGE: change response shape\nSigned-off-by: author',
      ],
      [
        'Details about the redesign.\n\nBREAKING CHANGE: drop node 18\n\nSigned-off-by: author',
      ],
      [
        [
          'Replace the authentication flow.',
          '',
          'BREAKING CHANGE: remove legacy authentication.',
          '',
          'Existing users must regenerate their API tokens.',
        ].join('\n'),
      ],
    ])('returns true for valid breaking change footer: %j', (body) => {
      expect(hasConventionalBreakingFooter(body)).toBe(true);
    });

    test.each([
      [undefined],
      [''],
      ['   '],
      ['Just a normal commit body without footers.'],
      ['breaking change: lowercase token must be rejected'],
      ['breaking-change: lowercase token must be rejected'],
      ['Breaking Change: mixed case token must be rejected'],
      ['BREAKING CHANGE:'],
      ['BREAKING-CHANGE:   '],
      ['    BREAKING CHANGE: indented token in code example should not match'],
      [
        '  BREAKING-CHANGE: two space indented token in example should not match',
      ],
      ['This is not a footer: BREAKING CHANGE: embedded in a sentence'],
      [
        'Here is an example:\n```yaml\nBREAKING CHANGE: remove old API\n```\nMore body text.',
      ],
      ['Code block demonstration:\n```\nBREAKING CHANGE: remove old API\n```'],
      [
        'Tilde code block demonstration:\n~~~\nBREAKING CHANGE: remove old API\n~~~',
      ],
      ['Remember to format as:\nBREAKING CHANGE: remove old API'],
      ['Here is an example:\nBREAKING CHANGE: remove old API'],
    ])('returns false for invalid or non-breaking body: %j', (body) => {
      expect(hasConventionalBreakingFooter(body)).toBe(false);
    });
  });

  describe('hasConventionalBreakingDeclaration', () => {
    test.each([
      ['feat!: replace the public API', undefined],
      ['feat(parser)!: replace the output contract', 'Normal body text'],
      ['fix!: break backwards compatibility', ''],
      [
        'chore: drop node 18',
        'BREAKING CHANGE: node 18 is no longer supported',
      ],
      ['feat: new config', 'BREAKING-CHANGE: old config format removed'],
    ])(
      'returns true when subject or footer declares breaking change: %s',
      (subject, body) => {
        expect(hasConventionalBreakingDeclaration(subject, body)).toBe(true);
      },
    );

    test.each([
      ['feat: add optional flag', undefined],
      ['fix(parser): handle undefined token', 'Fixed edge case.'],
      ['chore: clean up dependencies', 'Updated lockfile.'],
      [
        'feat: test',
        'breaking change: lowercase is not valid Conventional Commit',
      ],
    ])(
      'returns false when neither subject nor footer declares breaking change: %s',
      (subject, body) => {
        expect(hasConventionalBreakingDeclaration(subject, body)).toBe(false);
      },
    );
  });
});
