// WHY: readChangelog() must keep working when the caught value is not an object.
// The real filesystem only throws Error objects, so node:fs has to be mocked to
// feed it a primitive or null throw.

import { beforeEach, describe, expect, jest, test } from '@jest/globals';

const readFileSyncMock = jest.fn<() => string>();
const writeFileSyncMock = jest.fn();

jest.unstable_mockModule('node:fs', () => ({
  readFileSync: readFileSyncMock,
  writeFileSync: writeFileSyncMock,
}));

const { readChangelog } = await import('@/lib/changelog-file.js');

/**
 * Run a function and return whatever it threw, keeping the thrown value intact.
 * @param run Function expected to throw.
 * @returns The thrown value.
 */
function captureThrow(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }

  throw new Error('expected the function to throw');
}

describe('readChangelog error handling', () => {
  beforeEach(() => {
    readFileSyncMock.mockReset();
  });

  test('returns an empty string for ENOENT file errors', () => {
    readFileSyncMock.mockImplementation(() => {
      throw Object.assign(new Error('missing'), { code: 'ENOENT' });
    });

    expect(readChangelog('CHANGELOG.md')).toBe('');
  });

  test('rethrows non-ENOENT filesystem errors unchanged', () => {
    const permissionError = Object.assign(new Error('denied'), {
      code: 'EACCES',
    });
    readFileSyncMock.mockImplementation(() => {
      throw permissionError;
    });

    expect(captureThrow(() => readChangelog('CHANGELOG.md'))).toBe(
      permissionError,
    );
  });

  test.each(['boom', null, undefined, 42, false])(
    'rethrows a non-object value unchanged: %p',
    (thrownValue) => {
      readFileSyncMock.mockImplementation(() => {
        throw thrownValue;
      });

      expect(captureThrow(() => readChangelog('CHANGELOG.md'))).toBe(
        thrownValue,
      );
    },
  );

  test('rethrows an error without a code property unchanged', () => {
    const plainError = new Error('no code');
    readFileSyncMock.mockImplementation(() => {
      throw plainError;
    });

    expect(captureThrow(() => readChangelog('CHANGELOG.md'))).toBe(plainError);
  });
});
