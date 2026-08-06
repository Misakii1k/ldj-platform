/**
 * D4-T：game_state payload 中标准桌面视角的客户端严格解析。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TABLETOP_VIEW_VERSION } from '@ldj/shared';
import { parseGameStatePayload } from '../src/game/types.ts';

function basePayload() {
  return {
    sessionId: 's1',
    moduleId: 'undercover',
    status: 'ACTIVE',
    role: 'player',
    rulesetId: 'undercover_classic_v1',
    engineContractVersion: 2,
    viewVersion: 1,
    view: { gameId: 'undercover', phase: 'speaking', players: [] },
  };
}

function validTabletop() {
  return {
    version: TABLETOP_VIEW_VERSION,
    phase: { code: 'speaking', sequence: 1 },
    round: null,
    turn: { mode: 'single', actorPlayerIds: ['p1'] },
    seats: [{ playerId: 'p1', seat: 0, participation: 'active', activity: 'acting' }],
    clock: null,
    availableCapabilityIds: ['canSpeak'],
    publicLog: { revision: 0, entries: [] },
    operations: [],
    result: null,
  };
}

test('D4-T：携带合法 tabletop 的 game_state 通过解析', () => {
  const payload = parseGameStatePayload({ ...basePayload(), tabletopVersion: TABLETOP_VIEW_VERSION, tabletop: validTabletop() });
  assert.ok(payload);
  assert.equal(payload?.tabletopVersion, TABLETOP_VIEW_VERSION);
  assert.equal(payload?.tabletop?.turn.mode, 'single');
});

test('D4-T：无 tabletop 的 legacy 帧仍通过（可选字段向后兼容）', () => {
  const payload = parseGameStatePayload(basePayload());
  assert.ok(payload);
  assert.equal(payload?.tabletop, undefined);
});

test('D4-T：版本不匹配或畸形 tabletop 失败关闭', () => {
  assert.equal(parseGameStatePayload({ ...basePayload(), tabletopVersion: 99, tabletop: validTabletop() }), null);
  assert.equal(
    parseGameStatePayload({
      ...basePayload(),
      tabletopVersion: TABLETOP_VIEW_VERSION,
      tabletop: { ...validTabletop(), availableCapabilityIds: ['canDoMagic'] },
    }),
    null,
  );
  assert.equal(
    parseGameStatePayload({
      ...basePayload(),
      tabletopVersion: TABLETOP_VIEW_VERSION,
      tabletop: { ...validTabletop(), turn: { mode: 'warp', actorPlayerIds: [] } },
    }),
    null,
  );
});
