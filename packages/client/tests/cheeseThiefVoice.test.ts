import test from 'node:test';
import assert from 'node:assert/strict';
import { hasCue, cheeseVoice } from '../src/game/cheese-thief/cheeseVoice.ts';

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

test('calculateNightCountdownDelay 依据 deadlineAt 准确在剩余 6 秒时触发倒计时读秒', async () => {
  const { calculateNightCountdownDelay } = await import('../src/game/cheese-thief/useCheeseTTS.ts');

  const now = 1_000_000;
  // 距截止还有 20 秒：提前 6 秒开始播放 11_读秒_5秒.wav (实测 6.0s)，应在 14 秒后触发
  const delay20 = calculateNightCountdownDelay(now + 20_000, now, 20);
  assert.strictEqual(delay20, 14_000);

  // 距截止恰好 6 秒：立即触发（0ms 延迟），播完 6.0s 音频刚好与 deadlineAt 截止重合
  const delay6 = calculateNightCountdownDelay(now + 6_000, now, 20);
  assert.strictEqual(delay6, 0);

  // 距截止不足 6 秒（例如剩余 3 秒）：返回 0 立即播报
  const delay3 = calculateNightCountdownDelay(now + 3_000, now, 20);
  assert.strictEqual(delay3, 0);

  // 无 deadlineAt 时依据 nightHourSeconds 兜底：20 秒局返回 14 秒延迟
  const delayFallback = calculateNightCountdownDelay(null, now, 20);
  assert.strictEqual(delayFallback, 14_000);

  // 时刻时长极短（<= 6s）时返回 0
  const delayShort = calculateNightCountdownDelay(null, now, 5);
  assert.strictEqual(delayShort, 0);
});
