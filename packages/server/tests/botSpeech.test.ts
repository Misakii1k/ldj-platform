import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeBotSpeech } from '../src/core/game/botSpeech.ts';

test('清洗超长文本并挡掉直白报身份', () => {
  assert.equal(sanitizeBotSpeech('先听身份再投票。', '备用'), '先听身份再投票。');
  assert.equal(sanitizeBotSpeech('我是预言家，3 号是狼', '先听大家发言。'), '先听大家发言。');
  assert.equal(sanitizeBotSpeech('   ', '先听大家发言。'), '先听大家发言。');
  assert.equal(sanitizeBotSpeech('a'.repeat(400), '备用').length, 300);
});

for (const speech of [
  '我是预言家，查验2号是狼，我主张投2号。',
  '我的身份是女巫，昨夜我用了解药救3号。',
  '我是守卫，我守的是3号，但平安夜不能直接证明他是好人。',
  '我不是狼，2号的说法前后矛盾。',
  '2号和3号可能是狼队友，我怀疑他们相互保人。',
]) {
  test(`狼人杀保留正常策略发言：${speech}`, () => {
    assert.equal(sanitizeBotSpeech(speech, '备用', 'werewolf'), speech);
  });
}

for (const speech of ['我是狼人，我要投3号。', '我的狼队友是2号。', '我们狼队今晚要刀3号。', '我昨晚刀了3号。']) {
  test(`狼人杀仍拦截直白自曝：${speech}`, () => {
    assert.equal(sanitizeBotSpeech(speech, '备用', 'werewolf'), '备用');
  });
}

test('狼人杀放开发言不影响默认保密策略或长度清洗', () => {
  assert.equal(sanitizeBotSpeech('我是预言家，2号查杀。', '备用'), '备用');
  assert.equal(sanitizeBotSpeech('x'.repeat(400), '备用', 'werewolf').length, 300);
  assert.equal(sanitizeBotSpeech(null, '备用', 'werewolf'), '备用');
});
