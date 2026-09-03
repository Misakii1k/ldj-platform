import test from 'node:test';
import assert from 'node:assert/strict';
import { formatSystemMessage } from '../src/shared-ui/ChatMessageList.tsx';

test('formatSystemMessage：将玩家内部 UUID 替换为真实昵称', () => {
  const memberNames = new Map([
    ['p_7d777f6f-0518-4f93-ad6c-f07cd955dda3', '麦田捕手'],
    ['p_bot_1', '机器人1'],
  ]);

  const raw1 = '玩家 p_7d777f6f-0518-4f93-ad6c-f07cd955dda3 拍铃抢答！';
  const formatted1 = formatSystemMessage(raw1, memberNames, 'p_other');
  assert.equal(formatted1, '麦田捕手 拍铃抢答！');

  const raw2 = '玩家 p_7d777f6f-0518-4f93-ad6c-f07cd955dda3 拍铃成功！打出短语卡并接管回合！';
  const formatted2 = formatSystemMessage(raw2, memberNames, 'p_7d777f6f-0518-4f93-ad6c-f07cd955dda3');
  assert.equal(formatted2, '麦田捕手 (我) 拍铃成功！打出短语卡并接管回合！');

  const raw3 = '玩家 p_bot_1 错误拍铃（无同色短语卡），罚摸 1 张！';
  const formatted3 = formatSystemMessage(raw3, memberNames, null);
  assert.equal(formatted3, '机器人1 错误拍铃（无同色短语卡），罚摸 1 张！');
});

test('formatSystemMessage：未在成员表中的未知 UUID 兜底为优雅文案', () => {
  const memberNames = new Map<string, string>();
  const raw = '玩家 p_11111111-2222-3333-4444-555555555555 拍铃抢答！';
  const formatted = formatSystemMessage(raw, memberNames, null);
  assert.equal(formatted, '玩家 某位玩家 拍铃抢答！');
});
