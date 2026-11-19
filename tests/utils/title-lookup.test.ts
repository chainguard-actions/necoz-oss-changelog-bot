import { describe, expect, test } from '@jest/globals';
import { buildTitleLookup, findTitleMatch } from '@/utils/title-lookup.js';
import type { TitleLookupCollision } from '@/utils/title-lookup.js';

describe('title-lookup utils', () => {
  test('matches direct titles after stripping conventional prefixes', () => {
    const lookup = buildTitleLookup([
      { titles: ['Add login flow'], value: 42 },
    ]);

    expect(findTitleMatch('feat(auth): Add login flow', lookup)).toBe(42);
  });

  test('supports fuzzy prefix matching with a relative length threshold', () => {
    const lookup = buildTitleLookup([
      { titles: ['Add login flow with passwordless fallback'], value: 42 },
    ]);

    expect(
      findTitleMatch('Add login flow with passwordless', lookup, {
        minRelativePrefixLength: 0.5,
      }),
    ).toBe(42);
    expect(
      findTitleMatch('Add', lookup, {
        minRelativePrefixLength: 0.5,
      }),
    ).toBeUndefined();
  });

  test('uses the collision resolver for normalized title clashes', () => {
    const lookup = buildTitleLookup(
      [
        { titles: ['Add login flow'], value: 42 },
        { titles: ['add-login-flow'], value: 99 },
      ],
      {
        onNormalizedCollision: ({ existingValue, incomingValue }) =>
          Math.max(existingValue, incomingValue),
      },
    );

    expect(findTitleMatch('Add login flow', lookup)).toBe(99);
    expect(findTitleMatch('Add! Login Flow', lookup)).toBe(99);
  });

  test('keeps the first normalized value when no collision resolver is given', () => {
    const lookup = buildTitleLookup([
      { titles: ['Add login flow'], value: 'first' },
      { titles: ['add-login-flow'], value: 'second' },
    ]);

    expect(lookup.normalized.get('add login flow')).toBe('first');
    expect(findTitleMatch('Add login flow', lookup)).toBe('first');
  });

  test('keeps the existing normalized value when the resolver returns undefined', () => {
    const lookup = buildTitleLookup(
      [
        { titles: ['Add login flow'], value: 'first' },
        { titles: ['add-login-flow'], value: 'second' },
      ],
      { onNormalizedCollision: () => undefined },
    );

    expect(lookup.normalized.get('add login flow')).toBe('first');
    expect(findTitleMatch('add login flow', lookup)).toBe('first');
  });

  test('passes the collision context to the resolver', () => {
    const collisions: TitleLookupCollision<string>[] = [];

    buildTitleLookup(
      [
        { titles: ['Add login flow'], value: 'first' },
        { titles: ['add-login-flow'], value: 'second' },
      ],
      {
        onNormalizedCollision: (collision) => {
          collisions.push(collision);
          return collision.incomingValue;
        },
      },
    );

    expect(collisions).toEqual([
      {
        title: 'add-login-flow',
        normalizedTitle: 'add login flow',
        existingValue: 'first',
        incomingValue: 'second',
      },
    ]);
  });

  test('prefers a normalized match over a conflicting direct match', () => {
    const lookup = buildTitleLookup([
      { titles: ['Add login flow'], value: 'normalized-first' },
      // The same raw title overwrites the direct key but not the normalized one.
      { titles: ['Add login flow'], value: 'direct-later' },
    ]);

    expect(lookup.direct.get('Add login flow')).toBe('direct-later');
    expect(findTitleMatch('Add login flow', lookup)).toBe('normalized-first');
  });

  test.each([
    'Add login flow',
    'ADD LOGIN FLOW',
    'add-login-flow',
    'Add  login   flow!',
    'feat(auth): add login flow',
  ])('matches title variant %j consistently', (variant) => {
    const lookup = buildTitleLookup([
      { titles: ['Add login flow'], value: 42 },
    ]);

    expect(findTitleMatch(variant, lookup)).toBe(42);
  });

  test('ignores empty titles when building lookup tables', () => {
    const lookup = buildTitleLookup([{ titles: [''], value: 'empty' }]);

    expect(lookup.direct.size).toBe(0);
    expect(lookup.normalized.size).toBe(0);
    expect(findTitleMatch('', lookup)).toBeUndefined();
  });

  test('keeps fuzzy prefix matching bounded by the relative length threshold', () => {
    const lookup = buildTitleLookup([
      { titles: ['Add login flow with passwordless fallback'], value: 42 },
    ]);

    expect(
      findTitleMatch('add login flow with passwordless', lookup, {
        minRelativePrefixLength: 0.5,
      }),
    ).toBe(42);
    expect(
      findTitleMatch('add login flow', lookup, {
        minRelativePrefixLength: 0.9,
      }),
    ).toBeUndefined();
    expect(findTitleMatch('Unrelated release note', lookup)).toBeUndefined();
  });
});
