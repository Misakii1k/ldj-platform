/**
 * D4-F1：会话规则集身份。
 * 覆盖：startGame 持久化 ruleset_id；会话级模块解析；
 * 未知规则集开局失败关闭；狼人双规则集（legacy/open-kill）解析；
 * catalog 默认规则集只影响新局，不改变活动会话。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb, closeDb, type Db } from '../src/persistence/db.ts';
import { migrate } from '../src/persistence/migrator.ts';
import { RoomCommandExecutor } from '../src/core/executor.ts';
import { seedRoom } from './helpers/seedRoom.ts';
import { applyJoinRoom } from '../src/core/commands/joinRoom.ts';
import { applyRoomCommand } from '../src/core/commands/roomCommand.ts';
import { startGame, getActiveSession, type SessionRow } from '../src/core/game/session.ts';
import { getSessionGameModule, getDefaultRuleset, resolveRulesetForStart } from '../src/core/game/registry.ts';

function freshDb(): Db {
  const db = openDb({ path: ':memory:' });
  migrate(db);
  return db;
}

async function makeRoomWithPlayers(db: Db, executor: RoomCommandExecutor, gameId: string, playerCount = 4): Promise<{ roomId: string; hostId: string }> {
  const seeded = seedRoom(db, { gameId });
  const { roomId, hostId } = seeded;
  for (let index = 2; index <= playerCount; index += 1) {
    await executor.executeOnRoom({
      roomId,
      actorScope: `conn:join${index}`,
      requestId: `join-${index}`,
      handler: (tx) => applyJoinRoom(tx, roomId, { roomCode: seeded.roomCode, nickname: `玩家${index}`, asSpectator: false }),
    });
  }
  const players = (db.prepare(
    `SELECT player_id FROM room_members
     WHERE room_id = ? AND seat_role = 'player' ORDER BY seat ASC`,
  ).all(roomId) as { player_id: string }[]).map((r) => r.player_id);
  for (const playerId of players) {
    await executor.executeOnRoom({
      roomId,
      actorScope: `conn:ready-${playerId}`,
      requestId: `ready-${playerId}`,
      handler: (tx) => applyRoomCommand(tx, roomId, playerId, { command: 'ready', ready: true }, {}),
    });
  }
  return { roomId, hostId };
}

test('startGame 持久化权威 ruleset_id，会话级解析返回对应模块', async () => {
  const db = freshDb();
  const executor = new RoomCommandExecutor(db);
  const { roomId } = await makeRoomWithPlayers(db, executor, 'undercover');
  await executor.executeOnRoom({
    roomId,
    actorScope: 'conn:host',
    requestId: 'start-1',
    handler: (tx) => startGame(tx, roomId, { rulesetId: 'undercover_classic_v1', speechSeconds: 60, voteSeconds: 45 }),
  });
  const session = getActiveSession(db, roomId);
  assert.ok(session);
  assert.equal(session.ruleset_id, 'undercover_classic_v1');
  const module = getSessionGameModule(session);
  assert.ok(module);
  assert.equal(module.manifest.id, 'undercover');
  closeDb(db);
});

test('未知 rulesetId 开局失败关闭（不猜测默认）', async () => {
  const db = freshDb();
  const executor = new RoomCommandExecutor(db);
  const { roomId } = await makeRoomWithPlayers(db, executor, 'undercover');
  await assert.rejects(
    executor.executeOnRoom({
      roomId,
      actorScope: 'conn:host',
      requestId: 'start-bad',
      handler: (tx) => startGame(tx, roomId, { rulesetId: 'not_a_ruleset' }),
    }),
    /未在模块注册表中声明/,
  );
  assert.equal(getActiveSession(db, roomId), undefined);
  closeDb(db);
});

test('狼人双规则集：legacy 默认与 open-kill 配置均正确解析', async () => {
  const db = freshDb();
  const executor = new RoomCommandExecutor(db);

  // legacy 开局（config 不带 rulesetId 或显式 legacy）
  const roomA = await makeRoomWithPlayers(db, executor, 'werewolf', 6);
  await executor.executeOnRoom({
    roomId: roomA.roomId,
    actorScope: 'conn:host-a',
    requestId: 'start-a',
    handler: (tx) => startGame(tx, roomA.roomId, { preset: 'classic', pace: 'fast', witchSelfSave: 'first_night', winCondition: 'numbers' }),
  });
  const sessionA = getActiveSession(db, roomA.roomId);
  assert.ok(sessionA);
  assert.equal(sessionA.ruleset_id, 'werewolf_legacy_platform_v2');
  assert.equal(getSessionGameModule(sessionA)?.manifest.id, 'werewolf');

  // open-kill 开局（config.rulesetId = werewolf_platform_open_kill_v1）
  const roomB = await makeRoomWithPlayers(db, executor, 'werewolf', 6);
  await executor.executeOnRoom({
    roomId: roomB.roomId,
    actorScope: 'conn:host-b',
    requestId: 'start-b',
    handler: (tx) =>
      startGame(tx, roomB.roomId, {
        rulesetId: 'werewolf_platform_open_kill_v1',
        preset: 'classic',
        pace: 'fast',
        witchSelfSave: 'first_night',
        winCondition: 'numbers',
      }),
  });
  const sessionB = getActiveSession(db, roomB.roomId);
  assert.ok(sessionB);
  assert.equal(sessionB.ruleset_id, 'werewolf_platform_open_kill_v1');
  assert.equal(getSessionGameModule(sessionB)?.manifest.id, 'werewolf');
  closeDb(db);
});

test('getDefaultRuleset / resolveRulesetForStart 与目录默认一致', () => {
  assert.equal(getDefaultRuleset('undercover'), 'undercover_classic_v1');
  assert.equal(getDefaultRuleset('uno'), 'uno_legacy_platform_v1');
  assert.equal(getDefaultRuleset('landlord'), 'landlord_legacy_platform_v1');
  assert.equal(getDefaultRuleset('werewolf'), 'werewolf_legacy_platform_v2');
  assert.equal(resolveRulesetForStart('werewolf', {}), 'werewolf_legacy_platform_v2');
  assert.equal(resolveRulesetForStart('werewolf', { rulesetId: 'werewolf_platform_open_kill_v1' }), 'werewolf_platform_open_kill_v1');
  assert.throws(() => resolveRulesetForStart('werewolf', { rulesetId: 'uno_legacy_platform_v1' }), /未注册|声明/);
});

test('SUSPENDED 会话占用活动位，且无规则集解析时失败关闭', async () => {
  const db = freshDb();
  const executor = new RoomCommandExecutor(db);
  const { roomId } = await makeRoomWithPlayers(db, executor, 'undercover');
  await executor.executeOnRoom({
    roomId,
    actorScope: 'conn:host',
    requestId: 'start-1',
    handler: (tx) => startGame(tx, roomId, { rulesetId: 'undercover_classic_v1' }),
  });
  // 手工置 SUSPENDED 模拟内部失败：仍占用活动位
  db.prepare(`UPDATE game_sessions SET status = 'SUSPENDED' WHERE room_id = ?`).run(roomId);
  const session = getActiveSession(db, roomId);
  assert.ok(session);
  assert.equal(session.status, 'SUSPENDED');
  assert.ok(getSessionGameModule(session));
  // 会话 ruleset 被抹掉 → 无法解析 → 失败关闭
  db.prepare(`UPDATE game_sessions SET ruleset_id = 'unregistered_module' WHERE room_id = ?`).run(roomId);
  const broken = db.prepare('SELECT * FROM game_sessions WHERE room_id = ?').get(roomId) as unknown as SessionRow;
  assert.equal(getSessionGameModule(broken), undefined);
  closeDb(db);
});
