import { createRequire } from 'node:module';
import { describe, expect, it } from '@jest/globals';

type MergeOptions = {
  clone?: boolean;
  arrayMerge?: (target: unknown[], source: unknown[]) => unknown[];
  customMerge?: (
    key: string | symbol,
  ) => ((target: unknown, source: unknown) => unknown) | undefined;
};
type Deepmerge = (
  target: unknown,
  source: unknown,
  options?: MergeOptions,
) => Record<PropertyKey, unknown>;

// WHY: pnpm keeps transitive packages private; resolve the exact copy used by Jest.
const require = createRequire(import.meta.url);
const jestRequire = createRequire(require.resolve('jest'));
const jestConfigRequire = createRequire(jestRequire.resolve('jest-config'));
const deepmergePath = jestConfigRequire.resolve('deepmerge');
const packageRequire = createRequire(deepmergePath);
const entryPoints: [string, Deepmerge][] = [
  ['CommonJS', packageRequire(deepmergePath) as Deepmerge],
  ['UMD', packageRequire('./umd.js') as Deepmerge],
];

const poisoned = () =>
  JSON.parse('{"__proto__":{"isAdmin":true},"safe":1}') as Record<
    string,
    unknown
  >;

for (const [entryPoint, deepmerge] of entryPoints) {
  describe(`deepmerge security patch (${entryPoint})`, () => {
    it('rejects __proto__ in targets, sources, nested objects and arrays', () => {
      const results = [
        deepmerge(Object.create(null), poisoned()),
        deepmerge(poisoned(), {}),
        deepmerge(poisoned(), poisoned()),
        deepmerge({ nested: null }, { nested: poisoned() }).nested,
        deepmerge({ nested: 1 }, { nested: poisoned() }).nested,
        deepmerge([], [poisoned()])[0],
        deepmerge([poisoned()], [])[0],
      ] as Record<string, unknown>[];

      for (const result of results) {
        expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
        expect(result.isAdmin).toBeUndefined();
        expect(Object.hasOwn(result, '__proto__')).toBe(false);
        expect(result.safe).toBe(1);
      }
      expect(({} as Record<string, unknown>).isAdmin).toBeUndefined();
    });

    it('preserves explicit clone and array merge options', () => {
      const source = poisoned();
      const reference = deepmerge({}, { nested: source }, { clone: false });
      expect(reference.nested).toBe(source);
      const combined = deepmerge(
        { items: [1] },
        { items: [2] },
        {
          arrayMerge: (_target, replacement) => replacement,
        },
      );
      expect(combined.items).toEqual([2]);
    });

    it('keeps legitimate keys, symbols, arrays and custom merge behavior', () => {
      const marker = Symbol('marker');
      const target = {
        constructor: { old: true },
        prototype: 'target',
        [marker]: 'symbol',
        items: [1],
        value: { old: true },
      };
      const result = deepmerge(
        target,
        {
          constructor: { current: true },
          prototype: 'source',
          items: [2],
          value: { current: true },
        },
        {
          customMerge: (key) =>
            key === 'value' ? () => ({ custom: true }) : undefined,
        },
      );
      expect(result.constructor).toEqual({ old: true, current: true });
      expect(result.prototype).toBe('source');
      expect(result[marker]).toBe('symbol');
      expect(result.items).toEqual([1, 2]);
      expect(result.value).toEqual({ custom: true });
    });
  });
}

describe('glob compatibility with the minimatch override', () => {
  it('finds and filters files through Jest and Istanbul dependencies', async () => {
    const glob = jestConfigRequire('glob') as {
      globSync: (pattern: string) => string[];
    };
    const babelJestRequire = createRequire(
      jestConfigRequire.resolve('babel-jest'),
    );
    const transformRequire = createRequire(
      babelJestRequire.resolve('@jest/transform'),
    );
    const istanbulRequire = createRequire(
      transformRequire.resolve('babel-plugin-istanbul'),
    );
    const TestExclude = istanbulRequire('test-exclude') as new (
      options: object,
    ) => {
      globSync: () => string[];
      glob: () => Promise<string[]>;
    };
    const testExclude = new TestExclude({
      cwd: process.cwd(),
      include: ['tests/evaluation/**/*.test.ts'],
      exclude: [],
      extension: ['.ts'],
    });
    const expected = 'tests/evaluation/why-corpus.test.ts';
    // WHY: glob returns paths with OS-specific separators (for example
    // `tests\evaluation\...` on Windows), so normalize before comparing.
    const toPosixPath = (filePath: string): string =>
      filePath.replaceAll('\\', '/');
    expect(
      glob.globSync('tests/evalu*/why-*.test.ts').map(toPosixPath),
    ).toContain(expected);
    expect(testExclude.globSync().map(toPosixPath)).toContain(expected);
    expect((await testExclude.glob()).map(toPosixPath)).toContain(expected);
  });
});
