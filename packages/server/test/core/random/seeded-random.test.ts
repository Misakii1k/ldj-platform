import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import {
  generateRandomSeed,
  SeededRandomSource,
} from '../../../src/core/random/seeded-random.js';

const SEED_A = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const SEED_B = 'BAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQ';

describe('SeededRandomSource', () => {
  it('replays the same sequence and shuffle from the same seed', () => {
    const left = new SeededRandomSource({ seed: SEED_A });
    const right = new SeededRandomSource({ seed: SEED_A });

    expect(Array.from({ length: 12 }, () => left.nextInt(-10, 25))).toEqual(
      Array.from({ length: 12 }, () => right.nextInt(-10, 25)),
    );
    expect(left.shuffle(['a', 'b', 'c', 'd', 'e'])).toEqual(
      right.shuffle(['a', 'b', 'c', 'd', 'e']),
    );
  });

  it('keeps the versioned algorithm output stable across releases', () => {
    const random = new SeededRandomSource({ seed: SEED_A });

    expect(Array.from({ length: 8 }, () => random.nextInt(0, 1_000_000))).toEqual([
      537_354, 22_117, 837_724, 789_173, 341_112, 436_994, 547_354, 721_863,
    ]);
  });

  it('continues exactly from a persisted draw cursor', () => {
    const original = new SeededRandomSource({ seed: SEED_A });
    Array.from({ length: 7 }, () => original.nextInt(0, 1_000));
    const snapshot = original.getSnapshot();
    const expected = Array.from({ length: 8 }, () => original.nextInt(0, 1_000));

    const restored = new SeededRandomSource({ seed: SEED_A, snapshot });
    expect(Array.from({ length: 8 }, () => restored.nextInt(0, 1_000))).toEqual(expected);
    expect(restored.getSnapshot()).toEqual({
      algorithm: 'hmac-sha256-v1',
      cursor: snapshot.cursor + 8,
    });
  });

  it('does not mutate the input passed to shuffle', () => {
    const input = Object.freeze(['a', 'b', 'c', 'd']);
    const random = new SeededRandomSource({ seed: SEED_A });

    const shuffled = random.shuffle(input);

    expect(input).toEqual(['a', 'b', 'c', 'd']);
    expect(shuffled).not.toBe(input);
    expect([...shuffled].sort()).toEqual([...input].sort());
  });

  it('validates seeds, cursors, and integer ranges without echoing seed material', () => {
    const secret = 'not-a-valid-secret-seed';
    expect(() => new SeededRandomSource({ seed: secret })).toThrowError(
      expect.not.objectContaining({ message: expect.stringContaining(secret) }),
    );
    for (const snapshot of [
      { algorithm: 'hmac-sha256-v2', cursor: 0 },
      { algorithm: 'hmac-sha256-v1', cursor: -1 },
      { algorithm: 'hmac-sha256-v1', cursor: 0, unexpected: true },
    ]) {
      expect(() => new SeededRandomSource({ seed: SEED_A, snapshot })).toThrow();
    }

    const random = new SeededRandomSource({ seed: SEED_A });
    for (const range of [
      [1, 1],
      [2, 1],
      [0.5, 2],
      [0, Number.MAX_SAFE_INTEGER],
    ] as const) {
      expect(() => random.nextInt(range[0], range[1])).toThrow(RangeError);
    }
  });

  it('uses distinct generated canonical 32-byte seeds', () => {
    const first = generateRandomSeed();
    const second = generateRandomSeed();

    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(second).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(second).not.toBe(first);
    expect(() => new SeededRandomSource({ seed: first })).not.toThrow();
  });

  it('keeps every generated value in the requested range', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -10_000, max: 10_000 }),
        fc.integer({ min: 1, max: 10_000 }),
        (minimum, width) => {
          const maximum = minimum + width;
          const random = new SeededRandomSource({ seed: SEED_B });
          for (let index = 0; index < 100; index += 1) {
            const value = random.nextInt(minimum, maximum);
            expect(value).toBeGreaterThanOrEqual(minimum);
            expect(value).toBeLessThan(maximum);
          }
        },
      ),
    );
  });
});
