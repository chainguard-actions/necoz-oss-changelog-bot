import { describe, expect, test } from '@jest/globals';
import { mapConcurrent } from '@/utils/concurrency.js';

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

// WHY: Every invalid limit must collapse to the same sequential fallback, so the
// expected behavior is identical and only the limit under test varies.
const invalidConcurrencyLimits: readonly number[] = [
  0,
  -5,
  2.7,
  Number.NaN,
  Number.POSITIVE_INFINITY,
  Number.NEGATIVE_INFINITY,
  Number.MAX_SAFE_INTEGER + 1,
];

describe('mapConcurrent', () => {
  test('returns empty array when given empty input', async () => {
    let callCount = 0;
    const results = await mapConcurrent([], 4, async () => {
      callCount += 1;
      return 'unused';
    });

    expect(results).toEqual([]);
    expect(callCount).toBe(0);
  });

  test('preserves original element order when tasks finish out of order', async () => {
    // Tasks finish in reverse order: task 0 takes 40ms, task 3 takes 5ms
    const taskDelaysInMs = [40, 25, 10, 5];
    const results = await mapConcurrent(
      taskDelaysInMs,
      4,
      async (sleepDuration, itemIndex) => {
        await delay(sleepDuration);
        return `result-${itemIndex}`;
      },
    );

    expect(results).toEqual(['result-0', 'result-1', 'result-2', 'result-3']);
  });

  test('strictly bounds concurrent executions to the specified limit', async () => {
    const totalItems = 15;
    const concurrencyLimit = 3;
    const items = Array.from({ length: totalItems }, (_, index) => index);

    let activeTaskCount = 0;
    let maxObservedConcurrency = 0;

    const results = await mapConcurrent(
      items,
      concurrencyLimit,
      async (itemValue) => {
        activeTaskCount += 1;
        maxObservedConcurrency = Math.max(
          maxObservedConcurrency,
          activeTaskCount,
        );

        // Small async delay to allow other workers to run
        await delay(10);

        activeTaskCount -= 1;
        return itemValue * 2;
      },
    );

    expect(results).toEqual(items.map((itemValue) => itemValue * 2));
    expect(maxObservedConcurrency).toBe(concurrencyLimit);
    expect(activeTaskCount).toBe(0);
  });

  test('handles arrays smaller than the concurrency limit', async () => {
    const items = ['alpha', 'beta'];
    const results = await mapConcurrent(items, 10, async (textValue) => {
      return textValue.toUpperCase();
    });

    expect(results).toEqual(['ALPHA', 'BETA']);
  });

  test('clamps invalid or non-integer concurrency limits to at least 1', async () => {
    const items = [1, 2, 3];
    const resultsZero = await mapConcurrent(
      items,
      0,
      async (itemNumber) => itemNumber + 1,
    );
    expect(resultsZero).toEqual([2, 3, 4]);

    const resultsNegative = await mapConcurrent(
      items,
      -5,
      async (itemNumber) => itemNumber * 10,
    );
    expect(resultsNegative).toEqual([10, 20, 30]);

    const resultsFloat = await mapConcurrent(
      items,
      2.7,
      async (itemNumber) => itemNumber,
    );
    expect(resultsFloat).toEqual([1, 2, 3]);
  });

  test.each(invalidConcurrencyLimits)(
    'maps items sequentially and exactly once with invalid limit %p',
    async (concurrencyLimit) => {
      const items = [4, 7, 2];
      const mapperInvocations: { item: number; index: number }[] = [];
      let activeMapperCount = 0;
      let maxActiveMapperCount = 0;

      const results = await mapConcurrent(
        items,
        concurrencyLimit,
        async (itemValue, itemIndex) => {
          mapperInvocations.push({ item: itemValue, index: itemIndex });
          activeMapperCount += 1;
          maxActiveMapperCount = Math.max(
            maxActiveMapperCount,
            activeMapperCount,
          );
          // WHY: Yielding a microtask keeps the overlap probe deterministic;
          // timers would make the assertion timing-dependent.
          await Promise.resolve();
          activeMapperCount -= 1;
          return itemValue * 10;
        },
      );

      expect(maxActiveMapperCount).toBe(1);
      expect(mapperInvocations).toEqual([
        { item: 4, index: 0 },
        { item: 7, index: 1 },
        { item: 2, index: 2 },
      ]);
      expect(results).toEqual([40, 70, 20]);
    },
  );

  test('observes overlapping mapper calls when the limit allows concurrency', async () => {
    const items = [0, 1, 2];
    let activeMapperCount = 0;
    let maxActiveMapperCount = 0;

    const results = await mapConcurrent(items, 3, async (itemValue) => {
      activeMapperCount += 1;
      maxActiveMapperCount = Math.max(maxActiveMapperCount, activeMapperCount);
      await Promise.resolve();
      activeMapperCount -= 1;
      return itemValue;
    });

    // WHY: Guards against a vacuous sequential assertion; a valid limit must be
    // observable as real overlap, otherwise the probe above proves nothing.
    expect(maxActiveMapperCount).toBe(3);
    expect(results).toEqual([0, 1, 2]);
  });

  test('propagates errors when mapper rejects', async () => {
    const items = [1, 2, 3];
    const failingPromise = mapConcurrent(items, 2, async (itemNumber) => {
      if (itemNumber === 2) {
        throw new Error('Task failed');
      }
      return itemNumber;
    });

    await expect(failingPromise).rejects.toThrow('Task failed');
  });
});
