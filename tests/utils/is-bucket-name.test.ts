import { describe, expect, test } from '@jest/globals';
import { SECTION_ORDER } from '@/constants/changelog.js';
import type { BucketName } from '@/types/changelog.js';
import { isBucketName } from '@/utils/is.js';

type SameType<Actual, Expected> =
  (<Value>() => Value extends Actual ? 1 : 2) extends <
    Value,
  >() => Value extends Expected ? 1 : 2
    ? true
    : false;

describe('isBucketName', () => {
  test.each(SECTION_ORDER)('accepts bucket %s', (bucket) => {
    expect(isBucketName(bucket)).toBe(true);
  });

  test.each([[''], ['not-a-bucket'], [null], [undefined], [42], [{}]])(
    'rejects %p',
    (candidate) => {
      expect(isBucketName(candidate)).toBe(false);
    },
  );

  test('narrows unknown values to the bucket-name literal union', () => {
    const candidate: unknown = SECTION_ORDER[0];
    if (!isBucketName(candidate)) throw new Error('Expected a bucket name');

    expect<SameType<typeof candidate, BucketName>>(true).toBe(true);
  });
});
