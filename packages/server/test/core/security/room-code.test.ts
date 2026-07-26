import { describe, expect, it, vi } from 'vitest';

import {
  generateRoomCode,
  ROOM_CODE_ALPHABET,
} from '../../../src/core/security/room-code.js';

describe('generateRoomCode', () => {
  it('generates five-character codes without ambiguous characters', () => {
    for (let index = 0; index < 100; index += 1) {
      expect(generateRoomCode()).toMatch(/^[A-HJ-NP-Z2-9]{5}$/);
    }
  });

  it('uses the injected random index source for deterministic tests', () => {
    const randomIndex = vi
      .fn<(maxExclusive: number) => number>()
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(1)
      .mockReturnValueOnce(2)
      .mockReturnValueOnce(3)
      .mockReturnValueOnce(ROOM_CODE_ALPHABET.length - 1);

    expect(generateRoomCode(randomIndex)).toBe(`ABCD${ROOM_CODE_ALPHABET.at(-1)}`);
    expect(randomIndex).toHaveBeenCalledTimes(5);
    expect(randomIndex).toHaveBeenCalledWith(ROOM_CODE_ALPHABET.length);
  });

  it('rejects invalid injected values', () => {
    expect(() => generateRoomCode(() => -1)).toThrow('random index source');
    expect(() => generateRoomCode(() => ROOM_CODE_ALPHABET.length)).toThrow(
      'random index source',
    );
    expect(() => generateRoomCode(() => 1.5)).toThrow('random index source');
  });
});
