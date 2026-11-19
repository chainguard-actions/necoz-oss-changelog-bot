// @ts-nocheck
import { describe, test, expect } from '@jest/globals';
import { buildChangesForClassification } from '@/utils/classify-pre.js';

function releaseNoteChange(index, title, rawTitle) {
  return {
    id: `release-note:${index}`,
    origin: { kind: 'release-note', index },
    title,
    rawTitle,
  };
}

describe('classification input', () => {
  test('preserves improvement titles without manufacturing a prefix', () => {
    const items = [
      releaseNoteChange(0, 'add pre-processing to improve classification'),
    ];
    const out = buildChangesForClassification(items);
    expect(out[0].title).toBe('add pre-processing to improve classification');
    expect(out[0].id).toBe('release-note:0');
  });

  test('preserves implicit fix titles without manufacturing a prefix', () => {
    const items = [
      releaseNoteChange(0, 'tighten option type to prevent misuse'),
    ];
    const out = buildChangesForClassification(items);
    expect(out[0].title).toBe('tighten option type to prevent misuse');
  });

  test('keeps explicit feat', () => {
    const items = [
      releaseNoteChange(0, 'feat: add option', 'feat: add option'),
    ];
    const out = buildChangesForClassification(items);
    expect(out[0].title).toBe('feat: add option');
  });

  test('projects strictly id and title, omitting commit bodies and internal fields from classification payload', () => {
    const items = [
      {
        ...releaseNoteChange(0, 'clean title', 'feat: clean title'),
        body: 'Arbitrary commit body that must not leak to providers',
        author: 'alice',
        url: 'https://github.com/org/repo/pull/1',
      },
      {
        ...releaseNoteChange(1, 'breaking change', 'feat!: breaking change'),
        breaking: true,
        body: 'BREAKING CHANGE: drop v1 API',
      },
    ];

    const out = buildChangesForClassification(items);
    expect(out).toEqual([
      { id: 'release-note:0', title: 'feat: clean title' },
      { id: 'release-note:1', title: 'feat!: breaking change', breaking: true },
    ]);
    expect(out[0]).not.toHaveProperty('body');
    expect(out[1]).not.toHaveProperty('body');
    expect(out[0]).not.toHaveProperty('author');
  });
});
