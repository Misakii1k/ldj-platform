import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeBotSpeech } from '../src/core/game/botSpeech.ts';

test('清洗超长文本并挡掉直白报身份', () => {
  assert.equal(sanitizeBotSpeech('先听身份再投票。', '备用'), '先听身份再投票。');
  assert.equal(sanitizeBotSpeech('我是预言家，3 号是狼', '先听大家发言。'), '先听大家发言。');
  assert.equal(sanitizeBotSpeech('   ', '先听大家发言。'), '先听大家发言。');
  assert.equal(sanitizeBotSpeech('a'.repeat(400), '备用').length, 300);
});
