// @ts-nocheck
import { test, expect } from '@jest/globals';
import { updateCompareLinks } from '@/lib/changelog.js';

test('appends compare link if missing', () => {
  const base = '# Changelog\n\nSome content';

  const out = updateCompareLinks(
    base,
    '[v1.2.3]: https://example.com/compare/v1.2.2...v1.2.3',
  );

  expect(out).toMatch(
    /\n\n\[v1\.2\.3\]: https:\/\/example\.com\/compare\/v1\.2\.2\.\.\.v1\.2\.3\n?$/,
  );
});

test('updates existing Unreleased link', () => {
  const existing = `# Changelog\n\n[Unreleased]: https://example.com/old\n`;

  const out = updateCompareLinks(
    existing,
    undefined,
    '[Unreleased]: https://example.com/compare/v1.2.3...HEAD',
  );

  expect(
    out.includes('[Unreleased]: https://example.com/compare/v1.2.3...HEAD'),
  ).toBe(true);
  expect(out.includes('https://example.com/old')).toBe(false);
});

test('adds Unreleased link when absent and avoids duplicates', () => {
  const existing = '# Changelog\n';
  const unreleased = '[Unreleased]: https://example.com/compare/v1.2.3...HEAD';

  const once = updateCompareLinks(existing, undefined, unreleased);
  const twice = updateCompareLinks(once, undefined, unreleased);
  const matches = twice.match(/^\[Unreleased\]: .+$/gm) || [];

  expect(matches.length).toBe(1);
});

test('does not duplicate a version compare link on repeated updates', () => {
  const existing = '# Changelog\n';
  const compareLine = '[v1.2.3]: https://example.com/compare/v1.2.2...v1.2.3';

  const updatedOnce = updateCompareLinks(existing, compareLine);
  const updatedTwice = updateCompareLinks(updatedOnce, compareLine);

  expect(updatedTwice).toBe(updatedOnce);
  expect(updatedTwice.match(/^\[v1\.2\.3\]: .+$/gm)).toEqual([compareLine]);
});

test('preserves an existing identical version compare link', () => {
  const compareLine = '[v1.2.3]: https://example.com/compare/v1.2.2...v1.2.3';
  const existing = `# Changelog\n\n${compareLine}\n`;

  const updatedContent = updateCompareLinks(existing, compareLine);

  expect(updatedContent).toBe(existing);
});

test('does not duplicate a version compare link with trailing whitespace', () => {
  const compareLine = '[v1.2.3]: https://example.com/compare/v1.2.2...v1.2.3';
  const existing = `# Changelog\n\n${compareLine} \t\n`;

  const updatedContent = updateCompareLinks(existing, compareLine);

  expect(updatedContent).toBe(existing);
});

test('preserves unrelated compare links when adding a version compare link', () => {
  const previousCompareLines = [
    '[v1.2.1]: https://example.com/compare/v1.2.0...v1.2.1',
    '[v1.2.2]: https://example.com/compare/v1.2.1...v1.2.2',
  ].join('\n');
  const existing = `# Changelog\n\n${previousCompareLines}\n`;
  const compareLine = '[v1.2.3]: https://example.com/compare/v1.2.2...v1.2.3';

  const updatedContent = updateCompareLinks(existing, compareLine);

  expect(updatedContent).toBe(`${existing}\n${compareLine}\n`);
});
