import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { RoomSnapshotView, ServerEnvelope } from '@ldj/shared';
import { applyEnvelope, parseServerEnvelope } from '../src/connection/envelopeReducer.ts';
import { INITIAL_CONNECTION_STATE } from '../src/connection/types.ts';

function envelope(
  type: ServerEnvelope['type'],
  payload: unknown,
  roomSeq?: number,
): ServerEnvelope {
  return {
    v: 1,
    type,
    serverNow: 1,
    payload,
    ...(roomSeq === undefined ? {} : { roomSeq }),
  };
}

function room(seq: number): RoomSnapshotView {
  return {
    roomCode: 'ABCDE',
    status: 'IN_GAME',
    seq,
    gameId: 'undercover',
    config: {},
    members: [],
  };
}

const game = (phase: string) => ({
  sessionId: 'session-1',
  moduleId: 'undercover',
  status: 'ACTIVE',
  role: 'player' as const,
  rulesetId: 'undercover_classic_v1',
  engineContractVersion: 2,
  viewVersion: 1,
  view: {
    phase,
    round: 1,
    players: [{ playerId: 'p1', seat: 0, alive: true, exitReason: null, revealedRole: null }],
    speakingOrder: [],
    currentSpeakerId: null,
    deadlineAt: null,
    votesSubmitted: 0,
    votesExpected: 0,
    runoffCandidates: [],
    confirmedPlayerIds: [],
    lastVoteSummary: null,
    winner: null,
    aborted: false,
    reveal: null,
    me: { playerId: 'p1', word: '词', role: null, alive: true, confirmed: false, hasVoted: false, myVote: null },
  },
});

test('D3：旧 room_snapshot 不得覆盖更新基线', () => {
  const current = {
    ...INITIAL_CONNECTION_STATE,
    connState: 'synced' as const,
    roomSeq: 10,
    room: room(10),
  };
  const result = applyEnvelope(current, envelope('room_snapshot', room(9), 9));
  assert.equal(result.state, current);
  assert.deepEqual(result.effects, [{ type: 'send_resync' }]);
});

test('D3：旧 game_state 不得覆盖更新视角，且主动重同步请求当前权威视角', () => {
  const current = {
    ...INITIAL_CONNECTION_STATE,
    roomSeq: 10,
    game: game('speaking'),
  };
  const result = applyEnvelope(current, envelope('game_state', game('word_reveal'), 9));
  assert.equal(result.state, current);
  assert.deepEqual(result.effects, [{ type: 'send_resync' }]);
});

test('D7：room_snapshot payload 坏损不静默丢帧，触发重同步', () => {
  const current = {
    ...INITIAL_CONNECTION_STATE,
    connState: 'synced' as const,
    roomSeq: 5,
    room: room(5),
  };
  const malformed = { roomCode: 'ABCDE', status: 'IN_GAME', seq: 'not-a-number', members: [] };
  const result = applyEnvelope(current, envelope('room_snapshot', malformed, 6));
  assert.equal(result.state, current);
  assert.deepEqual(result.effects, [{ type: 'send_resync' }]);
});

test('D7：game_state payload 坏损不静默丢帧，触发重同步', () => {
  const current = {
    ...INITIAL_CONNECTION_STATE,
    connState: 'synced' as const,
    roomSeq: 5,
    game: game('speaking'),
  };
  const malformed = { sessionId: 1, moduleId: 'undercover', status: 'ACTIVE', role: 'player' };
  const result = applyEnvelope(current, envelope('game_state', malformed, 6));
  assert.equal(result.state, current);
  assert.deepEqual(result.effects, [{ type: 'send_resync' }]);
});

test('D3：权威 room_snapshot 跳号建立基线，不触发重复 resync', () => {
  const current = {
    ...INITIAL_CONNECTION_STATE,
    connState: 'server_recovering' as const,
    roomSeq: 3,
    room: room(3),
  };
  const result = applyEnvelope(current, envelope('room_snapshot', room(20), 20));
  assert.equal(result.state.roomSeq, 20);
  assert.equal(result.state.room?.seq, 20);
  assert.equal(result.state.connState, 'synced');
  assert.deepEqual(result.effects, []);
});

test('D3：增量 game_state 推进 roomSeq，缺口只请求一次 resync', () => {
  const current = {
    ...INITIAL_CONNECTION_STATE,
    connState: 'synced' as const,
    roomSeq: 4,
    game: game('word_reveal'),
  };
  const result = applyEnvelope(current, envelope('game_state', game('speaking'), 6));
  assert.equal(result.state.roomSeq, 6);
  assert.equal((result.state.game?.view as { phase: string }).phase, 'speaking');
  assert.deepEqual(result.effects, [{ type: 'send_resync' }]);
});

test('D3：未经运行时验证的视角触发重同步且不覆盖旧视角', () => {
  const current = {
    ...INITIAL_CONNECTION_STATE,
    connState: 'synced' as const,
    roomSeq: 10,
    game: game('speaking'),
  };
  const malformed = {
    sessionId: 'session-1',
    moduleId: 'undercover',
    status: 'ACTIVE',
    role: 'player',
    rulesetId: 'undercover_classic_v1',
    engineContractVersion: 2,
    viewVersion: 1,
    view: { phase: 'voting', extraSecretField: 'should-not-render' },
  };
  const result = applyEnvelope(current, envelope('game_state', malformed, 11));
  assert.equal(result.state.roomSeq, 10, '坏帧不得推进序号');
  assert.equal((result.state.game?.view as { phase: string }).phase, 'speaking', '保留旧视角');
  assert.deepEqual(result.effects, [{ type: 'send_resync' }]);
});

test('D3：未知 viewVersion 的 V2 游戏失败关闭并请求重同步', () => {
  const current = {
    ...INITIAL_CONNECTION_STATE,
    connState: 'synced' as const,
    roomSeq: 10,
    game: game('speaking'),
  };
  const unknownVersion = {
    ...game('speaking'),
    viewVersion: 99,
  };
  const result = applyEnvelope(current, envelope('game_state', unknownVersion, 11));
  assert.equal(result.state.roomSeq, 10);
  assert.deepEqual(result.effects, [{ type: 'send_resync' }]);
});

test('D3：strict envelope 解析拒绝坏版本、坏序号与坏时间戳', () => {
  const valid = JSON.stringify({ v: 1, type: 'ack', serverNow: 1, payload: {} });
  assert.ok(parseServerEnvelope(valid) !== null);
  assert.equal(parseServerEnvelope(JSON.stringify({ v: 2, type: 'ack', serverNow: 1, payload: {} })), null);
  assert.equal(parseServerEnvelope(JSON.stringify({ v: 1, type: 'no_such', serverNow: 1, payload: {} })), null);
  assert.equal(parseServerEnvelope(JSON.stringify({ v: 1, type: 'ack', serverNow: -1, payload: {} })), null);
  assert.equal(parseServerEnvelope(JSON.stringify({ v: 1, type: 'ack', serverNow: 1, roomSeq: 1.5, payload: {} })), null);
  assert.equal(parseServerEnvelope('not json'), null);
});
