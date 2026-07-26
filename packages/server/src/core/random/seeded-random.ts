import { createHmac, randomBytes } from 'node:crypto';

import type { RandomSource } from '@lan-party/shared';
import { z } from 'zod';

const ALGORITHM = 'hmac-sha256-v1' as const;
const SEED_BYTES = 32;
const UINT32_SIZE = 0x1_0000_0000;

export interface RandomCursorSnapshot {
  readonly algorithm: typeof ALGORITHM;
  readonly cursor: number;
}

export interface SeededRandomSourceOptions {
  readonly seed: string | Uint8Array;
  readonly snapshot?: unknown;
}

export const randomCursorSnapshotSchema = z
  .object({
    algorithm: z.literal(ALGORITHM),
    cursor: z.number().int().min(0).safe(),
  })
  .strict();

export function generateRandomSeed(): string {
  return randomBytes(SEED_BYTES).toString('base64url');
}

/**
 * A server-only deterministic random source whose persisted cursor counts
 * every sampled 32-bit word, including samples discarded to avoid modulo bias.
 */
export class SeededRandomSource implements RandomSource {
  readonly #seed: Buffer;
  #cursor: number;

  constructor(options: SeededRandomSourceOptions) {
    this.#seed = parseSeed(options.seed);
    this.#cursor =
      options.snapshot === undefined
        ? 0
        : randomCursorSnapshotSchema.parse(options.snapshot).cursor;
  }

  nextInt(minInclusive: number, maxExclusive: number): number {
    if (!Number.isSafeInteger(minInclusive) || !Number.isSafeInteger(maxExclusive)) {
      throw new RangeError('random range bounds must be safe integers');
    }

    const span = maxExclusive - minInclusive;
    if (span <= 0 || span > UINT32_SIZE || !Number.isSafeInteger(span)) {
      throw new RangeError('random range width must be between 1 and 2^32');
    }

    const acceptanceLimit = UINT32_SIZE - (UINT32_SIZE % span);
    let sampled: number;
    do {
      sampled = this.#nextUint32();
    } while (sampled >= acceptanceLimit);

    return minInclusive + (sampled % span);
  }

  shuffle<T>(items: readonly T[]): T[] {
    const shuffled = [...items];
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const swapIndex = this.nextInt(0, index + 1);
      const current = shuffled[index];
      shuffled[index] = shuffled[swapIndex]!;
      shuffled[swapIndex] = current!;
    }
    return shuffled;
  }

  getSnapshot(): RandomCursorSnapshot {
    return Object.freeze({ algorithm: ALGORITHM, cursor: this.#cursor });
  }

  #nextUint32(): number {
    if (this.#cursor >= Number.MAX_SAFE_INTEGER) {
      throw new RangeError('random cursor is exhausted');
    }

    const counter = Buffer.allocUnsafe(8);
    counter.writeBigUInt64BE(BigInt(this.#cursor));
    const sampled = createHmac('sha256', this.#seed).update(counter).digest().readUInt32BE(0);
    this.#cursor += 1;
    return sampled;
  }
}

function parseSeed(seed: string | Uint8Array): Buffer {
  if (typeof seed !== 'string') {
    if (seed.byteLength !== SEED_BYTES) throw new RangeError('random seed must contain 32 bytes');
    return Buffer.from(seed);
  }

  if (!/^[A-Za-z0-9_-]{43}$/.test(seed)) {
    throw new RangeError('random seed must be canonical base64url');
  }
  const decoded = Buffer.from(seed, 'base64url');
  if (decoded.length !== SEED_BYTES || decoded.toString('base64url') !== seed) {
    throw new RangeError('random seed must contain 32 bytes');
  }
  return decoded;
}
