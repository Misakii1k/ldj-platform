import { roomSnapshotEnvelopeSchema, serverEnvelopeSchema } from '@lan-party/shared';
import { describe, expect, it } from 'vitest';

import { initialLobbyState, lobbyReducer } from './lobby-state';

describe('lobby reducer', () => {
  it('places known server errors beside the responsible field', () => {
    const pending = lobbyReducer(initialLobbyState, {
      type: 'request_started',
      request: { requestId: 'request-1', kind: 'join', roomCode: 'ABC23' },
    });
    const error = serverEnvelopeSchema.parse({
      v: 1,
      type: 'error',
      requestId: 'request-1',
      serverNow: 1,
      payload: { code: 'INVALID_PASSWORD', message: 'invalid', recoverable: true },
    });
    const next = lobbyReducer(pending, { type: 'server_message', message: error });
    expect(next.fieldErrors.password).toBe('房间密码不正确。');
    expect(next.pending).toBeUndefined();
    expect(next.synchronized).toBe(false);
  });

  it('does not report success on ack and unlocks only after a snapshot', () => {
    const pending = lobbyReducer(initialLobbyState, {
      type: 'request_started',
      request: { requestId: 'request-2', kind: 'create' },
    });
    const acknowledged = lobbyReducer(pending, {
      type: 'server_message',
      message: serverEnvelopeSchema.parse({
        v: 1,
        type: 'ack',
        requestId: 'request-2',
        serverNow: 1,
        roomSeq: 1,
        payload: { accepted: true },
      }),
    });
    expect(acknowledged.synchronized).toBe(false);
    expect(acknowledged.roomSeq).toBe(0);
    expect(acknowledged.notice?.text).toContain('等待房间状态同步');

    const synchronized = lobbyReducer(acknowledged, {
      type: 'server_message',
      message: serverEnvelopeSchema.parse({
        v: 1,
        type: 'room_snapshot',
        serverNow: 2,
        roomSeq: 2,
        payload: {
          roomCode: 'ABC23',
          status: 'LOBBY',
          hostPlayerId: 'player-a',
          members: [
            {
              playerId: 'player-a',
              nickname: '阿沐',
              role: 'player',
              connectionStatus: 'CONNECTED',
              isHost: true,
              joinedAt: 1,
            },
          ],
          spectatorsAllowed: true,
          game: null,
        },
      }),
    });
    expect(synchronized.synchronized).toBe(true);
    expect(synchronized.room?.roomCode).toBe('ABC23');
  });

  it('shows an explicit unavailable message instead of false success', () => {
    const pending = lobbyReducer(initialLobbyState, {
      type: 'request_started',
      request: { requestId: 'request-3', kind: 'create' },
    });
    const next = lobbyReducer(pending, {
      type: 'server_message',
      message: serverEnvelopeSchema.parse({
        v: 1,
        type: 'error',
        requestId: 'request-3',
        serverNow: 1,
        payload: { code: 'ACTION_NOT_ALLOWED', message: 'not enabled', recoverable: false },
      }),
    });
    expect(next.notice).toEqual({
      tone: 'error',
      text: '主机尚未开放此房间功能，请稍后再试。',
    });
  });

  it('clears an in-flight request when the connection is lost', () => {
    const pending = lobbyReducer(initialLobbyState, {
      type: 'request_started',
      request: { requestId: 'request-4', kind: 'join', roomCode: 'ABC23' },
    });
    const disconnected = lobbyReducer(pending, { type: 'connection_lost' });
    expect(disconnected.pending).toBeUndefined();
    expect(disconnected.synchronized).toBe(false);
  });

  it('ignores stale snapshots and requests a full sync for gaps without advancing roomSeq', () => {
    const initialSnapshot = roomSnapshotEnvelopeSchema.parse({
      v: 1,
      type: 'room_snapshot',
      serverNow: 1,
      roomSeq: 5,
      payload: {
        roomCode: 'ABC23',
        status: 'LOBBY',
        hostPlayerId: 'player-a',
        members: [{
          playerId: 'player-a',
          nickname: '当前昵称',
          role: 'player',
          connectionStatus: 'CONNECTED',
          isHost: true,
          joinedAt: 1,
        }],
        spectatorsAllowed: true,
        game: null,
      },
    });
    const current = lobbyReducer(initialLobbyState, { type: 'server_message', message: initialSnapshot });
    const stale = roomSnapshotEnvelopeSchema.parse({
      ...initialSnapshot,
      roomSeq: 4,
      payload: {
        ...initialSnapshot.payload,
        members: [{ ...initialSnapshot.payload.members[0]!, nickname: '过期昵称' }],
      },
    });
    expect(lobbyReducer(current, { type: 'server_message', message: stale })).toBe(current);

    const gap = roomSnapshotEnvelopeSchema.parse({ ...initialSnapshot, roomSeq: 7 });
    const waiting = lobbyReducer(current, { type: 'server_message', message: gap });
    expect(waiting.roomSeq).toBe(5);
    expect(waiting.synchronized).toBe(false);
    expect(waiting.notice?.text).toContain('状态断档');

    const required = lobbyReducer(current, {
      type: 'server_message',
      message: serverEnvelopeSchema.parse({
        v: 1,
        type: 'resync_required',
        serverNow: 2,
        roomSeq: 9,
        payload: { reason: 'sequence_gap', currentSeq: 9 },
      }),
    });
    expect(required.roomSeq).toBe(5);

    const resyncing = lobbyReducer(waiting, { type: 'resync_started' });
    const fullSnapshot = roomSnapshotEnvelopeSchema.parse({ ...initialSnapshot, roomSeq: 9 });
    const restored = lobbyReducer(resyncing, { type: 'server_message', message: fullSnapshot });
    expect(restored.roomSeq).toBe(9);
    expect(restored.synchronized).toBe(true);
    expect(restored.resyncPending).toBe(false);
  });

  it('clears stale room state when a resume credential is invalid or expired', () => {
    const room = lobbyReducer(initialLobbyState, {
      type: 'server_message',
      message: serverEnvelopeSchema.parse({
        v: 1,
        type: 'room_snapshot',
        serverNow: 1,
        roomSeq: 5,
        payload: {
          roomCode: 'ABC23',
          status: 'LOBBY',
          hostPlayerId: 'player-a',
          members: [],
          spectatorsAllowed: true,
          game: null,
        },
      }),
    });
    const pending = lobbyReducer(room, {
      type: 'request_started',
      request: { requestId: 'request-resume', kind: 'resume', roomCode: 'ABC23' },
    });
    const failed = lobbyReducer(pending, {
      type: 'server_message',
      message: serverEnvelopeSchema.parse({
        v: 1,
        type: 'error',
        requestId: 'request-resume',
        serverNow: 2,
        payload: { code: 'RESERVATION_EXPIRED', message: 'expired', recoverable: false },
      }),
    });
    expect(failed.room).toBeUndefined();
    expect(failed.notice).toEqual({ tone: 'error', text: '席位保留已过期，请重新加入房间。' });
  });

  it('keeps session replacement visible as a terminal room error', () => {
    const replaced = lobbyReducer(initialLobbyState, {
      type: 'server_message',
      message: serverEnvelopeSchema.parse({
        v: 1,
        type: 'session_replaced',
        serverNow: 2,
        payload: { reason: 'new_connection' },
      }),
    });
    expect(replaced.synchronized).toBe(false);
    expect(replaced.notice).toEqual({ tone: 'error', text: '该席位已在另一台设备上接管。' });
  });
});
