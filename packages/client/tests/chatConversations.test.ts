import test from 'node:test';
import assert from 'node:assert/strict';
import type { RoomMemberView } from '@ldj/shared';
import {
  buildPeerTargets,
  calculateAllUnread,
  calculateUnreadCount,
  filterMessagesByConversation,
  resolveDraftAfterAck,
  shouldResetChatState,
  updateSeenCursor,
} from '../src/game/chatConversations.ts';

function createMember(overrides: Partial<RoomMemberView> & { playerId: string; nickname: string }): RoomMemberView {
  return {
    seatRole: 'player',
    seat: 1,
    isHost: false,
    connectionStatus: 'CONNECTED',
    botKind: null,
    ready: false,
    ...overrides,
  };
}

test('buildPeerTargets: 排除自己、排除机器人、排除已离房、保留离线成员、区分重名昵称', () => {
  const members: RoomMemberView[] = [
    createMember({ playerId: 'me', nickname: '我自己', seat: 1 }),
    createMember({ playerId: 'bot_1', nickname: 'AI玩家', botKind: 'llm', seat: 2 }),
    createMember({ playerId: 'offline_p', nickname: '暂离玩家', connectionStatus: 'DISCONNECTED_RESERVED', seat: 3 }),
    createMember({ playerId: 'expired_p', nickname: '已退出玩家', connectionStatus: 'EXPIRED', seat: 7 }),
    createMember({ playerId: 'dup_1', nickname: '双胞胎', seat: 4 }),
    createMember({ playerId: 'dup_2', nickname: '双胞胎', seat: 5 }),
    createMember({ playerId: 'unique_p', nickname: '独行侠', seat: 6 }),
  ];

  const targets = buildPeerTargets(members, 'me');

  // 应排除 me、bot_1、expired_p，剩余 4 人
  assert.equal(targets.length, 4);
  const targetIds = targets.map((t) => t.playerId);
  assert.ok(!targetIds.includes('me'));
  assert.ok(!targetIds.includes('bot_1'));
  assert.ok(!targetIds.includes('expired_p'));

  // 离线保留成员包含且 isOnline 为 false
  const offlineT = targets.find((t) => t.playerId === 'offline_p');
  assert.ok(offlineT);
  assert.equal(offlineT.isOnline, false);

  // 独行侠昵称唯一，无席位号后缀
  const uniqueT = targets.find((t) => t.playerId === 'unique_p');
  assert.ok(uniqueT);
  assert.equal(uniqueT.displayName, '独行侠');

  // 重名双胞胎带席位后缀以辅助区分
  const dup1 = targets.find((t) => t.playerId === 'dup_1');
  const dup2 = targets.find((t) => t.playerId === 'dup_2');
  assert.ok(dup1);
  assert.ok(dup2);
  assert.equal(dup1.displayName, '双胞胎 (4号位)');
  assert.equal(dup2.displayName, '双胞胎 (5号位)');
});

test('isMessageInConversation & filter: 严格区隔 public 与 peer 私聊，拒绝第三方 DM', () => {
  const myId = 'me';
  const peerA = 'peer_a';
  const peerB = 'peer_b';

  const msgs = [
    { cursor: 1, fromPlayerId: 'p_other', toPlayerId: undefined, text: '大厅公共消息', at: 100, kind: 'player' as const },
    { cursor: 2, fromPlayerId: 'me', toPlayerId: undefined, text: '我发的公共消息', at: 200, kind: 'player' as const },
    { cursor: 3, fromPlayerId: 'me', toPlayerId: peerA, text: '我私聊 A', at: 300, kind: 'player' as const },
    { cursor: 4, fromPlayerId: peerA, toPlayerId: 'me', text: 'A 私聊我', at: 400, kind: 'player' as const },
    { cursor: 5, fromPlayerId: peerB, toPlayerId: 'me', text: 'B 私聊我', at: 500, kind: 'player' as const },
    // 假设第三方私聊（绝不应归属 me 与 peerA 的会话）
    { cursor: 6, fromPlayerId: peerA, toPlayerId: peerB, text: 'A 私聊 B', at: 600, kind: 'player' as const },
  ];

  // 公共会话消息
  const publicMsgs = filterMessagesByConversation(msgs, 'public', myId);
  assert.deepEqual(publicMsgs.map((m) => m.cursor), [1, 2]);

  // 与 peerA 的私聊会话
  const peerAMsgs = filterMessagesByConversation(msgs, peerA, myId);
  assert.deepEqual(peerAMsgs.map((m) => m.cursor), [3, 4]);

  // 与 peerB 的私聊会话
  const peerBMsgs = filterMessagesByConversation(msgs, peerB, myId);
  assert.deepEqual(peerBMsgs.map((m) => m.cursor), [5]);
});

test('calculateUnread & updateSeen: 独立未读计数、排除自己发出的消息、推进已读游标', () => {
  const myId = 'me';
  const peerA = 'peer_a';

  const msgs = [
    { cursor: 10, fromPlayerId: 'p1', toPlayerId: undefined, text: 'public 1' },
    { cursor: 11, fromPlayerId: 'me', toPlayerId: undefined, text: 'public 2 by me' },
    { cursor: 12, fromPlayerId: 'p2', toPlayerId: undefined, text: 'public 3' },
    { cursor: 13, fromPlayerId: peerA, toPlayerId: 'me', text: 'dm 1 from a' },
    { cursor: 14, fromPlayerId: 'me', toPlayerId: peerA, text: 'dm 2 from me' },
  ];

  // 1. public 会话，初始 lastSeen=0：他人发了 2 条（10, 12），自己发了 1 条（11）-> 未读为 2
  assert.equal(calculateUnreadCount(msgs, 'public', myId, 0), 2);
  // 当 lastSeen=10 -> 未读为 1 (cursor 12)
  assert.equal(calculateUnreadCount(msgs, 'public', myId, 10), 1);

  // 2. peerA 私聊，初始 lastSeen=0：他人发了 1 条（13），自己发了 1 条（14）-> 未读为 1
  assert.equal(calculateUnreadCount(msgs, peerA, myId, 0), 1);

  // 3. calculateAllUnread 汇总
  const allUnread = calculateAllUnread(msgs, ['public', peerA], myId, { public: 10, [peerA]: 0 });
  assert.equal(allUnread.byConversation['public'], 1);
  assert.equal(allUnread.byConversation[peerA], 1);
  assert.equal(allUnread.totalUnread, 2);

  // 4. 更新已读游标
  const nextSeenPublic = updateSeenCursor(msgs, 'public', myId, 10);
  assert.equal(nextSeenPublic, 12);
  const nextSeenA = updateSeenCursor(msgs, peerA, myId, 0);
  assert.equal(nextSeenA, 14);
});

test('resolveDraftAfterAck: 发送绑定 snapshot，ACK 安全清理且保护输入期间的新文本', () => {
  // 1. 发送成功，期间用户未输入新文本 -> 安全清空
  assert.equal(resolveDraftAfterAck('你好，我是预言家', '你好，我是预言家'), '');

  // 2. 发送成功，期间用户继续键入了新内容 -> 仅截断已发出的前缀，保留新输入
  assert.equal(
    resolveDraftAfterAck('你好，我是预言家 昨晚查了3号是好人', '你好，我是预言家'),
    '昨晚查了3号是好人',
  );

  // 3. 发送期间用户彻底清空重写了别的内容 -> 保留当前内容，不误清
  assert.equal(
    resolveDraftAfterAck('等等，我看错了', '你好，我是预言家'),
    '等等，我看错了',
  );
});

test('shouldResetChatState: 跨房或用户身份变化时必须重置本地会话状态', () => {
  assert.equal(shouldResetChatState('ROOM1', 'ROOM2', 'p1', 'p1'), true);
  assert.equal(shouldResetChatState('ROOM1', 'ROOM1', 'p1', 'p2'), true);
  assert.equal(shouldResetChatState('ROOM1', 'ROOM1', 'p1', 'p1'), false);
});
