import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/persistence/db.ts';
import { migrate } from '../src/persistence/migrator.ts';
import { seedRoom } from './helpers/seedRoom.ts';
import {
  applyChatSend,
  listChatAfter,
  canReadChat,
} from '../src/core/commands/chat.ts';
import { CommandError, type TxContext } from '../src/core/executor.ts';

function createTestContext() {
  const db = openDb({ path: ':memory:' });
  migrate(db);
  const now = 1700000000000;
  const tx: TxContext = { db, now, roomSeq: 1 };
  return { db, tx, now };
}

function addMember(
  db: ReturnType<typeof openDb>,
  roomId: string,
  playerId: string,
  nickname: string,
  options: {
    connectionStatus?: 'CONNECTED' | 'DISCONNECTED_RESERVED' | 'EXPIRED' | 'KICKED';
    isBot?: number;
    seat?: number;
  } = {},
) {
  const now = 1700000000000;
  db.prepare(
    `INSERT INTO room_members
       (room_id, player_id, identity_id, nickname, seat_role, seat, connection_status,
        resume_token_hash, reserved_until, joined_at, is_bot, bot_kind, ready)
     VALUES (?, ?, NULL, ?, 'player', ?, ?, 'dummy-hash', NULL, ?, ?, NULL, 1)`,
  ).run(
    roomId,
    playerId,
    nickname,
    options.seat ?? 2,
    options.connectionStatus ?? 'CONNECTED',
    now,
    options.isBot ?? 0,
  );
}

test('privateChat：A→B 私聊，断言 A/B 可读、C/null 不可读；公共消息四种视角均可读', () => {
  const { db, tx } = createTestContext();
  const { roomId, hostId: playerA } = seedRoom(db, { nickname: '玩家A' });
  const playerB = 'player-b';
  const playerC = 'player-c';
  addMember(db, roomId, playerB, '玩家B', { seat: 2 });
  addMember(db, roomId, playerC, '玩家C', { seat: 3 });

  // A 发送私聊给 B
  const dm = applyChatSend(tx, roomId, playerA, 'A对B的悄悄话', playerB);
  assert.equal(dm.fromPlayerId, playerA);
  assert.equal(dm.toPlayerId, playerB);
  assert.equal(dm.text, 'A对B的悄悄话');

  // A 发送公共消息
  const pub = applyChatSend(tx, roomId, playerA, '大家好的公共消息');
  assert.equal(pub.toPlayerId, undefined);

  // 纯函数判定 canReadChat
  assert.equal(canReadChat(dm, playerA), true);
  assert.equal(canReadChat(dm, playerB), true);
  assert.equal(canReadChat(dm, playerC), false);
  assert.equal(canReadChat(dm, null), false);

  assert.equal(canReadChat(pub, playerA), true);
  assert.equal(canReadChat(pub, playerB), true);
  assert.equal(canReadChat(pub, playerC), true);
  assert.equal(canReadChat(pub, null), true);

  // 数据库查询 listChatAfter
  const listA = listChatAfter(db, roomId, null, playerA);
  const listB = listChatAfter(db, roomId, null, playerB);
  const listC = listChatAfter(db, roomId, null, playerC);
  const listPub = listChatAfter(db, roomId, null, null);

  assert.equal(listA.some((m) => m.text === 'A对B的悄悄话'), true);
  assert.equal(listB.some((m) => m.text === 'A对B的悄悄话'), true);
  assert.equal(listC.some((m) => m.text === 'A对B的悄悄话'), false);
  assert.equal(listPub.some((m) => m.text === 'A对B的悄悄话'), false);

  assert.equal(listA.some((m) => m.text === '大家好的公共消息'), true);
  assert.equal(listB.some((m) => m.text === '大家好的公共消息'), true);
  assert.equal(listC.some((m) => m.text === '大家好的公共消息'), true);
  assert.equal(listPub.some((m) => m.text === '大家好的公共消息'), true);

  db.close();
});

test('privateChat：101+ 条 B↔C 私聊后插入公共消息，A 按游标查询必须拿到公共（LIMIT 前过滤）', () => {
  const { db, tx } = createTestContext();
  const { roomId, hostId: playerA } = seedRoom(db, { nickname: '玩家A' });
  const playerB = 'player-b';
  const playerC = 'player-c';
  addMember(db, roomId, playerB, '玩家B', { seat: 2 });
  addMember(db, roomId, playerC, '玩家C', { seat: 3 });

  // 插入 105 条 B↔C 私聊
  for (let i = 1; i <= 105; i += 1) {
    applyChatSend(tx, roomId, playerB, `私聊内容-${i}`, playerC);
  }

  // 插入 1 条公共消息
  applyChatSend(tx, roomId, playerB, '重要的公共广播');

  // A 从 cursor=null 查询最近消息
  const recentA = listChatAfter(db, roomId, null, playerA);
  assert.equal(recentA.length, 1);
  assert.equal(recentA[0]?.text, '重要的公共广播');

  // A 从 cursor=0 顺查
  const forwardA = listChatAfter(db, roomId, 0, playerA);
  assert.equal(forwardA.length, 1);
  assert.equal(forwardA[0]?.text, '重要的公共广播');

  // 旁观视角（viewerId=null）也必须拿到该公共消息，不被105条私聊淹没
  const recentNull = listChatAfter(db, roomId, null, null);
  assert.equal(recentNull.length, 1);
  assert.equal(recentNull[0]?.text, '重要的公共广播');

  db.close();
});

test('privateChat：准入安全拦截（self/bot/不存在/已退出/跨房拒绝；离线保留可收件）', () => {
  const { db, tx } = createTestContext();
  const { roomId: room1, hostId: playerA } = seedRoom(db, { nickname: '玩家A' });
  const { hostId: otherRoomPlayer } = seedRoom(db, { nickname: '外房玩家' });

  const botPlayer = 'bot-player';
  const kickedPlayer = 'kicked-player';
  const expiredPlayer = 'expired-player';
  const offlineReservedPlayer = 'offline-player';

  addMember(db, room1, botPlayer, '机器人', { seat: 2, isBot: 1 });
  addMember(db, room1, kickedPlayer, '被踢玩家', { seat: 3, connectionStatus: 'KICKED' });
  addMember(db, room1, expiredPlayer, '过期玩家', { seat: 4, connectionStatus: 'EXPIRED' });
  addMember(db, room1, offlineReservedPlayer, '离线保留玩家', {
    seat: 5,
    connectionStatus: 'DISCONNECTED_RESERVED',
  });

  // 1. 发给自己 (self)
  assert.throws(
    () => applyChatSend(tx, room1, playerA, '自言自语', playerA),
    (err: unknown) => err instanceof CommandError && err.code === 'NOT_AUTHORIZED',
  );

  // 2. 发给机器人 (bot)
  assert.throws(
    () => applyChatSend(tx, room1, playerA, '你好机器人', botPlayer),
    (err: unknown) => err instanceof CommandError && err.code === 'NOT_AUTHORIZED',
  );

  // 3. 发给不存在的玩家
  assert.throws(
    () => applyChatSend(tx, room1, playerA, '查无此人', 'non-existent-player'),
    (err: unknown) => err instanceof CommandError && err.code === 'NOT_AUTHORIZED',
  );

  // 4. 跨房玩家
  assert.throws(
    () => applyChatSend(tx, room1, playerA, '跨房私聊', otherRoomPlayer),
    (err: unknown) => err instanceof CommandError && err.code === 'NOT_AUTHORIZED',
  );

  // 5. 已被踢玩家 (KICKED)
  assert.throws(
    () => applyChatSend(tx, room1, playerA, '对被踢玩家说话', kickedPlayer),
    (err: unknown) => err instanceof CommandError && err.code === 'NOT_AUTHORIZED',
  );

  // 6. 已退出/过期玩家 (EXPIRED)
  assert.throws(
    () => applyChatSend(tx, room1, playerA, '对过期玩家说话', expiredPlayer),
    (err: unknown) => err instanceof CommandError && err.code === 'NOT_AUTHORIZED',
  );

  // 7. 发送者已被踢/过期
  assert.throws(
    () => applyChatSend(tx, room1, kickedPlayer, '我想说话'),
    (err: unknown) => err instanceof CommandError && err.code === 'NOT_AUTHORIZED',
  );

  // 8. 离线保留成员 (DISCONNECTED_RESERVED) 允许收件
  const okDm = applyChatSend(tx, room1, playerA, '等你回来', offlineReservedPlayer);
  assert.equal(okDm.toPlayerId, offlineReservedPlayer);

  db.close();
});
