// @ts-nocheck
import { test, expect, describe } from '@jest/globals';
import { normalizeSectionCategories } from '@/utils/section-normalize.js';

describe('normalizeSectionCategories', () => {
  test('adds v prefix to release header and normalizes categories', () => {
    const input = [
      '## [1.2.3] - 2024-01-01',
      '',
      '### docs',
      '- Update docs',
      '',
      '### add',
      '- Add feature',
      '',
    ].join('\n');

    const expected = [
      '## [v1.2.3] - 2024-01-01',
      '',
      '### Docs',
      '- Update docs',
      '',
      '### Added',
      '- Add feature',
      '',
    ].join('\n');

    expect(normalizeSectionCategories(input)).toBe(expected);
  });

  test('preserves an unknown heading that matches an inherited property name', () => {
    const input = [
      '## [v1.2.3]',
      '',
      '### constructor',
      '- Example entry',
      '',
    ].join('\n');

    expect(normalizeSectionCategories(input)).toBe(input);
  });

  test('preserves a __proto__ heading', () => {
    const input = [
      '## [v1.2.3]',
      '',
      '### __proto__',
      '- Example entry',
      '',
    ].join('\n');

    expect(normalizeSectionCategories(input)).toBe(input);
  });

  test('preserves an ordinary unknown heading', () => {
    const input = [
      '## [v1.2.3]',
      '',
      '### Security',
      '- Example entry',
      '',
    ].join('\n');

    expect(normalizeSectionCategories(input)).toBe(input);
  });
});
