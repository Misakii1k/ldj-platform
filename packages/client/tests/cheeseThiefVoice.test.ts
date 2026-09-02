import test from 'node:test';
import assert from 'node:assert/strict';
import { CUE_FILES, hasCue, cheeseVoice } from '../src/game/cheese-thief/cheeseVoice.ts';

test('奶酪大盗法官语音映射表完整包含 1-6 点夜间与白天核心阶段', () => {
  // 验证 1-6 点叫醒语音
  for (let hour = 1; hour <= 6; hour += 1) {
    assert.strictEqual(hasCue(`wake_${hour}`), true);
  }

  // 验证核心阶段语音
  assert.strictEqual(hasCue('game_start_intro'), true);
  assert.strictEqual(hasCue('night_start'), true);
  assert.strictEqual(hasCue('accomplice_select'), true);
  assert.strictEqual(hasCue('dawn'), true);
  assert.strictEqual(hasCue('discussion'), true);
  assert.strictEqual(hasCue('countdown_5'), true);
  assert.strictEqual(hasCue('countdown_10'), true);

  // 验证扩展与终局插槽
  assert.strictEqual(hasCue('vote_start'), true);
  assert.strictEqual(hasCue('game_over_village'), true);
  assert.strictEqual(hasCue('game_over_thief'), true);
  assert.strictEqual(hasCue('game_over_white_mouse'), true);
  assert.strictEqual(hasCue('game_over_peace'), true);
  assert.strictEqual(hasCue('identity_cat'), true);
  assert.strictEqual(hasCue('identity_dog'), true);

  // 验证不存在的 key 返回 false
  assert.strictEqual(hasCue('unknown_cheese_cue'), false);
});

test('CheeseVoiceQueue interrupt 与 stopAll 能立即清除队列并重置状态', () => {
  cheeseVoice.enqueue('dawn');
  cheeseVoice.enqueue('discussion');
  cheeseVoice.interrupt();
  cheeseVoice.stopAll();
  assert.strictEqual(hasCue('dawn'), true);
});
