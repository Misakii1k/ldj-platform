/**
 * D3 Task 10：完整局恢复/机器人验收矩阵。
 * 用 fullGameDriver 在文件 SQLite 上跑真实服务端链路：
 * 纯规则机器人完整局、逐动作崩溃恢复矩阵、终局不变量。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { driveFullGameWithCrashMatrix } from './helpers/fullGameDriver.ts';

test('D3 矩阵：UNO 纯规则机器人完整局收束，结果恰写一次且无残留计时器', async () => {
  const result = await driveFullGameWithCrashMatrix({
    gameId: 'uno',
    humanCount: 1,
    botCount: 3,
    crashEveryStep: false,
    maxSteps: 2000,
  });
  assert.equal(result.finished, true, `UNO 机器人局应打完：${JSON.stringify(result)}`);
  assert.equal(result.sessionStatus, 'FINISHED');
  assert.equal(result.resultRows, 1, '终局必须恰有一条正式结果');
  assert.equal(result.pendingTimersAtEnd, 0, '终局不得残留 pending 计时器');
  assert.ok(result.steps > 0);
});

test('D3 矩阵：卧底纯规则机器人完整局收束，结果恰写一次且无残留计时器', async () => {
  const result = await driveFullGameWithCrashMatrix({
    gameId: 'undercover',
    humanCount: 1,
    botCount: 3,
    crashEveryStep: false,
    maxSteps: 2000,
  });
  assert.equal(result.finished, true, `卧底机器人局应打完：${JSON.stringify(result)}`);
  assert.equal(result.sessionStatus, 'FINISHED');
  assert.equal(result.resultRows, 1, '终局必须恰有一条正式结果');
  assert.equal(result.pendingTimersAtEnd, 0, '终局不得残留 pending 计时器');
  assert.ok(result.steps > 0);
});

test('D3 矩阵：UNO 每个 accepted 动作后崩溃恢复，与不中断 oracle 一致并继续收束', async () => {
  const result = await driveFullGameWithCrashMatrix({
    gameId: 'uno',
    humanCount: 1,
    botCount: 3,
    crashEveryStep: true,
    maxSteps: 2000,
  });
  assert.equal(result.finished, true, `UNO 逐动作崩溃后应继续收束：${JSON.stringify(result)}`);
  assert.equal(result.sessionStatus, 'FINISHED');
  assert.equal(result.resultRows, 1);
  assert.equal(result.pendingTimersAtEnd, 0);
  assert.ok(result.steps >= 10, `逐动作崩溃局应有足够步数：${result.steps}`);
});

test('D3 矩阵：卧底每个 accepted 动作后崩溃恢复，与不中断 oracle 一致并继续收束', async () => {
  const result = await driveFullGameWithCrashMatrix({
    gameId: 'undercover',
    humanCount: 1,
    botCount: 3,
    crashEveryStep: true,
    maxSteps: 2000,
  });
  assert.equal(result.finished, true, `卧底逐动作崩溃后应继续收束：${JSON.stringify(result)}`);
  assert.equal(result.sessionStatus, 'FINISHED');
  assert.equal(result.resultRows, 1);
  assert.equal(result.pendingTimersAtEnd, 0);
  assert.ok(result.steps >= 10, `逐动作崩溃局应有足够步数：${result.steps}`);
});
