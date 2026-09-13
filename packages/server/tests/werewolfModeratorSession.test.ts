/* eslint-disable @typescript-eslint/no-explicit-any -- 测试需直接探查引擎内部状态 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { openDb, closeDb, type Db } from '../src/persistence/db.ts';
import { migrate } from '../src/persistence/migrator.ts';
import { RoomCommandExecutor } from '../src/core/executor.ts';
import { seedRoom } from './helpers/seedRoom.ts';
import { applyJoinRoom } from '../src/core/commands/joinRoom.ts';
import { applyRoomCommand } from '../src/core/commands/roomCommand.ts';
import {
  startGame,
  getActiveSession,
  applyGameAction,
} from '../src/core/game/session.ts';
import { getSessionGameModule } from '../src/core/game/registry.ts';
import type { WerewolfModeratorView } from '@ldj/shared';

function freshDb(): Db {
  const db = openDb({ path: ':memory:' });
  migrate(db);
  return db;
}

async function makeRoomWithPlayers(
  db: Db,
  executor: RoomCommandExecutor,
  gameId: string,
  playerCount = 6,
): Promise<{ roomId: string; hostId: string; playerIds: string[] }> {
  const seeded = seedRoom(db, { gameId });
  const { roomId, hostId } = seeded;
  for (let index = 2; index <= playerCount; index += 1) {
    await executor.executeOnRoom({
      roomId,
      actorScope: `conn:join${index}`,
      requestId: `join-${index}`,
      handler: (tx) =>
        applyJoinRoom(tx, roomId, {
          roomCode: seeded.roomCode,
          nickname: `玩家${index}`,
          asSpectator: false,
        }),
    });
  }
  const players = (
    db
      .prepare(
        `SELECT player_id FROM room_members
       WHERE room_id = ? AND seat_role = 'player' ORDER BY seat ASC`,
      )
      .all(roomId) as { player_id: string }[]
  ).map((r) => r.player_id);

  for (const playerId of players) {
    await executor.executeOnRoom({
      roomId,
      actorScope: `conn:ready-${playerId}`,
      requestId: `ready-${playerId}`,
      handler: (tx) =>
        applyRoomCommand(tx, roomId, playerId, { command: 'ready', ready: true }, {}),
    });
  }
  return { roomId, hostId, playerIds: players };
}

test('真人主持模式（werewolf_moderator_v1）全链路房间开局、发牌、出局与终局', async () => {
  const db = freshDb();
  const executor = new RoomCommandExecutor(db);

  // 1. 创建 6 人房间（1 房主/主持人 + 5 抽卡玩家）
  const { roomId, hostId, playerIds } = await makeRoomWithPlayers(db, executor, 'werewolf', 6);
  assert.equal(playerIds.length, 6);
  assert.equal(playerIds[0], hostId);
  const cardPlayerIds = playerIds.slice(1);
  assert.equal(cardPlayerIds.length, 5);

  // 2. 房主开局，选择真人主持模式 ruleset
  await executor.executeOnRoom({
    roomId,
    actorScope: 'conn:host',
    requestId: 'start-mod-game',
    handler: (tx) =>
      startGame(tx, roomId, {
        rulesetId: 'werewolf_moderator_v1',
      }),
  });

  const session = getActiveSession(db, roomId);
  assert.ok(session);
  assert.equal(session.ruleset_id, 'werewolf_moderator_v1');
  const modModule = getSessionGameModule(session);
  assert.ok(modModule);
  assert.ok('identity' in modModule);
  if ('identity' in modModule) {
    assert.equal(modModule.identity.rulesetId, 'werewolf_moderator_v1');
  }

  // 3. 验证视角：房主视角为主持人全知视角，玩家视角只含自己底牌
  const snapshotJson = (
    db.prepare('SELECT snapshot_json FROM game_sessions WHERE id = ?').get(session.id) as {
      snapshot_json: string;
    }
  ).snapshot_json;
  const envelope = JSON.parse(snapshotJson) as { state: any };
  const internalState = envelope.state;

  assert.equal(internalState.moderatorPlayerId, hostId);
  assert.deepEqual(internalState.playerOrder, cardPlayerIds);

  const hostView = modModule.getPlayerView(internalState, hostId) as WerewolfModeratorView;
  assert.equal(hostView.isModerator, true);
  assert.equal(hostView.players.length, 5);
  assert.ok(hostView.statistics);
  assert.equal(hostView.statistics.totalPlayers, 5);
  assert.equal(hostView.statistics.totalAlive, 5);
  assert.equal(hostView.statistics.aliveWolves, 1); // 5人局配 1 狼

  const p1Id = cardPlayerIds[0]!;
  const p1View = modModule.getPlayerView(internalState, p1Id) as WerewolfModeratorView;
  assert.equal(p1View.isModerator, false);
  assert.ok(p1View.myRole);
  assert.equal(p1View.myRole.role, internalState.assignedRoles[p1Id]);
  // 严格保密他人底牌
  for (const p of p1View.players) {
    assert.equal(p.role, undefined);
    assert.equal(p.roleInfo, undefined);
  }

  // 4. 房主执行出局操作：标记 p1Id 出局
  await executor.executeOnRoom({
    roomId,
    actorScope: 'conn:host',
    requestId: 'act-elim-1',
    handler: (tx) =>
      applyGameAction(
        tx,
        roomId,
        hostId,
        { type: 'eliminate_player', targetPlayerId: p1Id },
        'act-elim-1',
      ),
  });

  const sessionAfterElim = getActiveSession(db, roomId)!;
  const envAfterElim = JSON.parse(
    (
      db.prepare('SELECT snapshot_json FROM game_sessions WHERE id = ?').get(sessionAfterElim.id) as {
        snapshot_json: string;
      }
    ).snapshot_json,
  ) as { state: any };

  const p1ViewAfterElim = modModule.getPlayerView(
    envAfterElim.state,
    p1Id,
  ) as WerewolfModeratorView;
  assert.equal(p1ViewAfterElim.isMeEliminated, true);

  const hostViewAfterElim = modModule.getPlayerView(
    envAfterElim.state,
    hostId,
  ) as WerewolfModeratorView;
  const p1InHostView = hostViewAfterElim.players.find((p) => p.playerId === p1Id)!;
  assert.equal(p1InHostView.isEliminated, true);
  assert.equal(hostViewAfterElim.statistics?.totalEliminated, 1);
  assert.equal(hostViewAfterElim.statistics?.totalAlive, 4);

  // 5. 房主撤销出局操作
  await executor.executeOnRoom({
    roomId,
    actorScope: 'conn:host',
    requestId: 'act-revive-1',
    handler: (tx) =>
      applyGameAction(
        tx,
        roomId,
        hostId,
        { type: 'revive_player', targetPlayerId: p1Id },
        'act-revive-1',
      ),
  });

  const sessionAfterRevive = getActiveSession(db, roomId)!;
  const envAfterRevive = JSON.parse(
    (
      db.prepare('SELECT snapshot_json FROM game_sessions WHERE id = ?').get(sessionAfterRevive.id) as {
        snapshot_json: string;
      }
    ).snapshot_json,
  ) as { state: any };

  const p1ViewAfterRevive = modModule.getPlayerView(
    envAfterRevive.state,
    p1Id,
  ) as WerewolfModeratorView;
  assert.equal(p1ViewAfterRevive.isMeEliminated, false);

  // 6. 房主点击结束对局并亮牌
  await executor.executeOnRoom({
    roomId,
    actorScope: 'conn:host',
    requestId: 'act-end-game',
    handler: (tx) =>
      applyGameAction(tx, roomId, hostId, { type: 'end_game' }, 'act-end-game'),
  });

  const finishedSession = db
    .prepare('SELECT id, snapshot_json, status FROM game_sessions WHERE room_id = ? ORDER BY created_at DESC LIMIT 1')
    .get(roomId) as { id: string; snapshot_json: string; status: string };
  assert.ok(finishedSession);
  assert.equal(finishedSession.status, 'FINISHED');
  const envAfterEnd = JSON.parse(finishedSession.snapshot_json) as { state: any };

  assert.equal(envAfterEnd.state.gameEnded, true);

  // 终局后：普通玩家端全场身份亮牌完全可见！
  const p1ViewFinal = modModule.getPlayerView(
    envAfterEnd.state,
    p1Id,
  ) as WerewolfModeratorView;
  assert.equal(p1ViewFinal.gameEnded, true);
  for (const p of p1ViewFinal.players) {
    assert.ok(p.role, `终局后玩家 ${p.playerId} 身份应当亮出`);
    assert.ok(p.roleInfo, `终局后玩家 ${p.playerId} 身份详情应当亮出`);
  }

  closeDb(db);
});

test('真人主持模式（werewolf_moderator_v1）不足6人（1主持人+4玩家）开局被明确拒绝', async () => {
  const db = freshDb();
  const executor = new RoomCommandExecutor(db);

  // 1. 创建 5 人房间（1 房主 + 4 玩家）
  const { roomId } = await makeRoomWithPlayers(db, executor, 'werewolf', 5);

  // 2. 尝试开局，预期抛出 ACTION_NOT_ALLOWED 错误
  await assert.rejects(
    () =>
      executor.executeOnRoom({
        roomId,
        actorScope: 'conn:host',
        requestId: 'start-under-capacity',
        handler: (tx) =>
          startGame(tx, roomId, {
            rulesetId: 'werewolf_moderator_v1',
          }),
      }),
    (err: { code: string; message: string }) => {
      assert.equal(err.code, 'ACTION_NOT_ALLOWED');
      assert.match(err.message, /真人主持模式至少需要 1 名主持人与 5 名参与抽卡玩家/);
      return true;
    },
  );

  closeDb(db);
});

