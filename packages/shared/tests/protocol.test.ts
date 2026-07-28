import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  clientEnvelopeSchema,
  PROTOCOL_VERSION,
  ERROR_CODES,
  ERROR_META,
  makeErrorPayload,
  normalizeNickname,
  nicknameSchema,
  createRoomPayloadSchema,
  chatTextSchema,
} from '@ldj/shared';

test('clientEnvelopeSchema：合法 envelope 通过', () => {
  const result = clientEnvelopeSchema.safeParse({
    v: PROTOCOL_VERSION,
    type: 'create_room',
    requestId: 'req-1',
    payload: { nickname: '阿明' },
  });
  assert.equal(result.success, true);
});

test('clientEnvelopeSchema：非法输入被拒绝', () => {
  const cases: unknown[] = [
    null,
    {},
    { v: 2, type: 'create_room', requestId: 'r', payload: {} }, // 版本不符
    { v: 1, type: 'unknown_type', requestId: 'r', payload: {} }, // 未知类型
    { v: 1, type: 'create_room', requestId: '', payload: {} }, // requestId 为空
    { v: 1, type: 'create_room', requestId: 'r'.repeat(65), payload: {} }, // 超长
    { v: 1, type: 'create_room', requestId: 'r', expectedSeq: -1, payload: {} }, // 负序号
    { v: 1, type: 'create_room', requestId: 'r', payload: {}, extra: 1 }, // 未知键
  ];
  for (const c of cases) {
    assert.equal(clientEnvelopeSchema.safeParse(c).success, false, JSON.stringify(c));
  }
});

test('错误码表：附录 A 全部 17 个错误码有元数据', () => {
  assert.equal(ERROR_CODES.length, 17);
  for (const code of ERROR_CODES) {
    const meta = ERROR_META[code];
    assert.ok(meta.userMessage.length > 0, code);
    assert.equal(typeof meta.recoverable, 'boolean', code);
  }
});

test('makeErrorPayload：默认与覆盖', () => {
  const p1 = makeErrorPayload('RATE_LIMITED', { retryAfterMs: 2000 });
  assert.equal(p1.code, 'RATE_LIMITED');
  assert.equal(p1.recoverable, true);
  assert.equal(p1.retryAfterMs, 2000);

  const p2 = makeErrorPayload('STALE_CLIENT_STATE', { currentSeq: 42 });
  assert.equal(p2.currentSeq, 42);
});

test('normalizeNickname：规范化与边界', () => {
  assert.equal(normalizeNickname('  阿明  '), '阿明');
  assert.equal(normalizeNickname(''), null);
  assert.equal(normalizeNickname('   '), null);
  assert.equal(normalizeNickname('a'.repeat(17)), null);
  assert.equal(normalizeNickname('a'.repeat(16)), 'a'.repeat(16));
  assert.equal(normalizeNickname('bad\u0000name'), null);
  // NFC：组合字符规范化后等价
  assert.equal(normalizeNickname('e\u0301'), '\u00e9');
});

test('createRoomPayloadSchema：密码长度校验', () => {
  assert.equal(
    createRoomPayloadSchema.safeParse({ nickname: '阿明', password: '123' }).success,
    false,
  );
  assert.equal(
    createRoomPayloadSchema.safeParse({ nickname: '阿明', password: '1234' }).success,
    true,
  );
  assert.equal(createRoomPayloadSchema.safeParse({ nickname: '阿明' }).success, true);
});

test('nicknameSchema：transform 输出规范化结果', () => {
  const r = nicknameSchema.safeParse(' 小 红 ');
  assert.equal(r.success, true);
  if (r.success) assert.equal(r.data, '小 红');
});

test('chatTextSchema：1–300 边界', () => {
  assert.equal(chatTextSchema.safeParse('').success, false);
  assert.equal(chatTextSchema.safeParse('  ').success, false);
  assert.equal(chatTextSchema.safeParse('好').success, true);
  assert.equal(chatTextSchema.safeParse('好'.repeat(300)).success, true);
  assert.equal(chatTextSchema.safeParse('好'.repeat(301)).success, false);
});
