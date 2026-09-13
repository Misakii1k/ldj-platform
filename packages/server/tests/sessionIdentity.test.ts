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
import { getSessionGameModule, getDefaultRuleset, getGameModule, resolveRulesetForStart } from '../src/core/game/registry.ts';

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

test('D5 P1a 注册断言：open_kill 解析到 v2 模块、legacy 仍解析到 legacy 模块', async () => {
  const db = freshDb();
  const executor = new RoomCommandExecutor(db);

  // legacy 开局（config 不带 rulesetId）→ legacy 模块（无 versioned identity）
  const roomA = await makeRoomWithPlayers(db, executor, 'werewolf', 6);
  await executor.executeOnRoom({
    roomId: roomA.roomId,
    actorScope: 'conn:host-a',
    requestId: 'start-a-d5',
    handler: (tx) => startGame(tx, roomA.roomId, { preset: 'classic', pace: 'fast', witchSelfSave: 'first_night', winCondition: 'numbers' }),
  });
  const sessionA = getActiveSession(db, roomA.roomId);
  assert.ok(sessionA);
  assert.equal(sessionA.ruleset_id, 'werewolf_legacy_platform_v2');
  const legacyModule = getSessionGameModule(sessionA);
  assert.ok(legacyModule);
  assert.ok(!('identity' in legacyModule), 'legacy 规则集必须解析到 legacy 模块（不得是 versioned）');

  // open-kill 开局（config.rulesetId = werewolf_platform_open_kill_v1）→ v2 模块
  const roomB = await makeRoomWithPlayers(db, executor, 'werewolf', 6);
  await executor.executeOnRoom({
    roomId: roomB.roomId,
    actorScope: 'conn:host-b',
    requestId: 'start-b-d5',
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
  const v2Module = getSessionGameModule(sessionB);
  assert.ok(v2Module, 'open_kill 必须能解析到模块');
  assert.ok('identity' in v2Module, 'open_kill 规则集必须解析到 v2 模块');
  if ('identity' in v2Module) {
    assert.equal(v2Module.identity.rulesetId, 'werewolf_platform_open_kill_v1');
    assert.equal(v2Module.identity.engineContractVersion, 2);
    assert.equal(v2Module.identity.viewVersion, 1);
  }

  // moderator 规则集解析测试
  const directMod = getGameModule('werewolf', 'werewolf_moderator_v1');
  assert.ok(directMod, 'werewolf_moderator_v1 必须能解析到模块');
  assert.ok('identity' in directMod, 'werewolf_moderator_v1 必须是版本化模块');
  if ('identity' in directMod) {
    assert.equal(directMod.identity.rulesetId, 'werewolf_moderator_v1');
    assert.equal(directMod.identity.engineContractVersion, 2);
  }

  // 注册表精确解析：legacy 规则集仍落在 legacy 模块
  const directLegacy = getGameModule('werewolf', 'werewolf_legacy_platform_v2');
  assert.ok(directLegacy);
  assert.ok(!('identity' in directLegacy), 'werewolf_legacy_platform_v2 必须解析到 legacy 模块');
  closeDb(db);
});

test('getDefaultRuleset / resolveRulesetForStart 与目录默认一致', () => {
  assert.equal(getDefaultRuleset('undercover'), 'undercover_classic_v1');
  assert.equal(getDefaultRuleset('uno'), 'uno_legacy_platform_v1');
  assert.equal(getDefaultRuleset('landlord'), 'landlord_platform_v1');
  assert.equal(getDefaultRuleset('werewolf'), 'werewolf_legacy_platform_v2');
  assert.equal(resolveRulesetForStart('werewolf', {}), 'werewolf_legacy_platform_v2');
  assert.equal(resolveRulesetForStart('werewolf', { rulesetId: 'werewolf_platform_open_kill_v1' }), 'werewolf_platform_open_kill_v1');
  assert.throws(() => resolveRulesetForStart('werewolf', { rulesetId: 'uno_legacy_platform_v1' }), /未注册|声明/);
});

test('D5 P2a 注册断言：landlord_platform_v1 解析到 v2 平台模块、legacy 仍解析到 legacy 模块', () => {
  // 注册表精确解析：legacy 规则集仍落在 legacy 模块
  const legacyModule = getGameModule('landlord', 'landlord_legacy_platform_v1');
  assert.ok(legacyModule);
  assert.ok(!('identity' in legacyModule), 'landlord_legacy_platform_v1 必须解析到 legacy 模块（不得是 versioned）');

  // landlord_platform_v1 → 平台 v2 模块（registry 第二笔）
  const platformModule = getGameModule('landlord', 'landlord_platform_v1');
  assert.ok(platformModule, 'landlord_platform_v1 必须能解析到模块');
  assert.ok('identity' in platformModule, 'landlord_platform_v1 必须解析到 v2 模块');
  if ('identity' in platformModule) {
    assert.equal(platformModule.identity.rulesetId, 'landlord_platform_v1');
    assert.equal(platformModule.identity.engineContractVersion, 2);
    assert.equal(platformModule.identity.viewVersion, 1);
  }

  // 开局解析：新建房默认进入平台规则；显式 legacy 仍保留兼容路径
  assert.equal(resolveRulesetForStart('landlord', {}), 'landlord_platform_v1');
  assert.equal(resolveRulesetForStart('landlord', { rulesetId: 'landlord_legacy_platform_v1' }), 'landlord_legacy_platform_v1');
  assert.equal(resolveRulesetForStart('landlord', { rulesetId: 'landlord_platform_v1' }), 'landlord_platform_v1');
  assert.throws(() => resolveRulesetForStart('landlord', { rulesetId: 'werewolf_platform_open_kill_v1' }), /未注册|声明/);
});

test('D6：斗地主默认切换不改写显式 legacy 会话身份', async () => {
  const db = freshDb();
  const executor = new RoomCommandExecutor(db);
  const { roomId } = await makeRoomWithPlayers(db, executor, 'landlord', 3);
  await executor.executeOnRoom({
    roomId,
    actorScope: 'conn:host',
    requestId: 'start-landlord-legacy',
    handler: (tx) => startGame(tx, roomId, { rulesetId: 'landlord_legacy_platform_v1', variant: 'standard' }),
  });
  const session = getActiveSession(db, roomId);
  assert.ok(session);
  assert.equal(session.ruleset_id, 'landlord_legacy_platform_v1');
  const module = getSessionGameModule(session);
  assert.ok(module);
  assert.ok(!('identity' in module), '显式 legacy 会话必须继续解析到 legacy 模块');
  closeDb(db);
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
