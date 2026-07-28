import type { Me } from '../connection/types.ts';

export interface RoomAckOutcome {
  roomCode: string;
  playerId: string;
  resumeToken: string;
  seatRole?: 'player' | 'spectator';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseRoomAck(payload: unknown): RoomAckOutcome | null {
  if (!isRecord(payload)) return null;
  const { roomCode, playerId, resumeToken, seatRole } = payload;
  if (typeof roomCode !== 'string' || typeof playerId !== 'string' || typeof resumeToken !== 'string') {
    return null;
  }
  if (seatRole !== undefined && seatRole !== 'player' && seatRole !== 'spectator') return null;
  return { roomCode, playerId, resumeToken, seatRole };
}

export function makeMeFromRoomAck(
  outcome: RoomAckOutcome,
  nickname: string,
  fallbackSeatRole: 'player' | 'spectator' = 'player',
): Me {
  return {
    playerId: outcome.playerId,
    resumeToken: outcome.resumeToken,
    roomCode: outcome.roomCode,
    nickname,
    seatRole: outcome.seatRole ?? fallbackSeatRole,
  };
}
