import test from 'node:test';
import assert from 'node:assert/strict';
import { getDefaultSeatAvatar, resolveMemberAvatar } from '../src/user/avatar.ts';

test('getDefaultSeatAvatar: 席位号确定性映射 Notion 头像', () => {
  // 1-based 席位（大厅 RoomMemberView 1..12）
  assert.strictEqual(getDefaultSeatAvatar(1), 'notion_01');
  assert.strictEqual(getDefaultSeatAvatar(2), 'notion_02');
  assert.strictEqual(getDefaultSeatAvatar(3), 'notion_03');
  assert.strictEqual(getDefaultSeatAvatar(6), 'notion_06');
  assert.strictEqual(getDefaultSeatAvatar(12), 'notion_12');
  assert.strictEqual(getDefaultSeatAvatar(64), 'notion_64');
  assert.strictEqual(getDefaultSeatAvatar(65), 'notion_01'); // 环回测试

  // 0-based 席位（局内 player.seat 0..11）
  assert.strictEqual(getDefaultSeatAvatar(0), 'notion_01');
  assert.strictEqual(getDefaultSeatAvatar(0, null, true), 'notion_01');
  assert.strictEqual(getDefaultSeatAvatar(1, null, true), 'notion_02');
  assert.strictEqual(getDefaultSeatAvatar(2, null, true), 'notion_03');
  assert.strictEqual(getDefaultSeatAvatar(5, null, true), 'notion_06');
});

test('getDefaultSeatAvatar: 无席位时根据 playerId 稳定哈希', () => {
  const avatarA = getDefaultSeatAvatar(null, 'player-bot-123');
  const avatarB = getDefaultSeatAvatar(null, 'player-bot-123');
  assert.strictEqual(avatarA, avatarB);
  assert.match(avatarA, /^notion_\d{2}$/);
});

test('resolveMemberAvatar: 本地玩家优先使用本地个人资料设置', () => {
  const avatar = resolveMemberAvatar(
    { playerId: 'me-1', seat: 1, avatar: null },
    { isMe: true, myAvatar: 'preset:wolf' },
  );
  assert.strictEqual(avatar, 'preset:wolf');
});

test('resolveMemberAvatar: 本地玩家无自定义时可回退到 myAvatar 或 preset:fox', () => {
  const avatar = resolveMemberAvatar(
    { playerId: 'me-1', seat: 1 },
    { isMe: true, myAvatar: 'preset:fox' },
  );
  assert.strictEqual(avatar, 'preset:fox');
});

test('resolveMemberAvatar: AI 机器人和席位成员根据席位确定专属 Notion 头像', () => {
  // 大厅/结算坞中的 1-based member：
  // 机器人1（Seat 2）-> notion_02
  const ai1MemberAvatar = resolveMemberAvatar(
    { playerId: 'bot-1', nickname: 'AI1', seat: 2, botKind: 'rule' },
    { isMe: false },
  );
  assert.strictEqual(ai1MemberAvatar, 'notion_02');

  // 机器人2（Seat 3）-> notion_03
  const ai2MemberAvatar = resolveMemberAvatar(
    { playerId: 'bot-2', nickname: 'AI2', seat: 3, botKind: 'rule' },
    { isMe: false },
  );
  assert.strictEqual(ai2MemberAvatar, 'notion_03');

  // 局内 0-based player.seat：
  // 2 号玩家 机器人1 (seat 1) -> notion_02 (与大厅/结算坞完全一致！)
  const ai1GameAvatar = resolveMemberAvatar(
    { playerId: 'bot-1', nickname: 'AI1', botKind: 'rule' },
    { isMe: false, seat: 1, isZeroBased: true },
  );
  assert.strictEqual(ai1GameAvatar, 'notion_02');
  assert.strictEqual(ai1GameAvatar, ai1MemberAvatar);

  // AI 机器人即使被误设为 'preset:fox' 占位，也能正确纠正为对应席位 Notion 头像
  const aiFixedAvatar = resolveMemberAvatar(
    { playerId: 'bot-3', nickname: 'AI3', seat: 4, botKind: 'llm', avatar: 'preset:fox' },
    { isMe: false },
  );
  assert.strictEqual(aiFixedAvatar, 'notion_04');
});

test('resolveMemberAvatar: 真人其他玩家若有显式自定义头像则保留', () => {
  const customAvatar = resolveMemberAvatar(
    { playerId: 'p2', nickname: '好友', seat: 2, avatar: 'preset:dog' },
    { isMe: false },
  );
  assert.strictEqual(customAvatar, 'preset:dog');
});
