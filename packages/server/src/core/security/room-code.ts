import { randomInt } from 'node:crypto';

export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ROOM_CODE_LENGTH = 5;

export type RandomIndexSource = (maxExclusive: number) => number;

export function generateRoomCode(randomIndex: RandomIndexSource = randomInt): string {
  let roomCode = '';

  for (let index = 0; index < ROOM_CODE_LENGTH; index += 1) {
    const randomCharacterIndex = randomIndex(ROOM_CODE_ALPHABET.length);
    if (
      !Number.isInteger(randomCharacterIndex) ||
      randomCharacterIndex < 0 ||
      randomCharacterIndex >= ROOM_CODE_ALPHABET.length
    ) {
      throw new RangeError('random index source returned an out-of-range value');
    }

    roomCode += ROOM_CODE_ALPHABET[randomCharacterIndex];
  }

  return roomCode;
}
