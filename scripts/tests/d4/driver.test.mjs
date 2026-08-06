/**
 * D4-TOOLS：fullGameDriver 扩展验证。
 * 最大步数 + 最大虚拟时间上限，超限即失败；对稳定基线模块（undercover/landlord/werewolf，
 * 只读引用）验证真实完整局可收束且上限不误伤正常局。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { driveFullGameWithCrashMatrix } from '../../../packages/server/tests/helpers/fullGameDriver.ts';

const GENEROUS_VIRTUAL_MS = 24 * 60 * 60 * 1000; // 24h 虚拟时间

test('driver：undercover 完整局在步数/虚拟时间上限内收束，结果恰写一次', async () => {
  const result = await driveFullGameWithCrashMatrix({
    gameId: 'undercover',
    humanCount: 1,
    botCount: 3,
    crashEveryStep: false,
    maxSteps: 2000,
    maxVirtualTimeMs: GENEROUS_VIRTUAL_MS,
  });
  assert.equal(result.finished, true);
  assert.equal(result.sessionStatus, 'FINISHED');
  assert.equal(result.resultRows, 1);
  assert.ok(result.virtualTimeMs > 0, '驱动必须记录虚拟时间');
});

test('driver：landlord 稳定基线模块完整局可收束', async () => {
  const result = await driveFullGameWithCrashMatrix({
    gameId: 'landlord',
    humanCount: 1,
    botCount: 2,
    crashEveryStep: false,
    maxSteps: 800,
    maxVirtualTimeMs: GENEROUS_VIRTUAL_MS,
  });
  assert.equal(result.finished, true);
  assert.equal(result.resultRows, 1);
});

test('driver：werewolf 稳定基线模块完整局可收束', async () => {
  const result = await driveFullGameWithCrashMatrix({
    gameId: 'werewolf',
    humanCount: 1,
    botCount: 5,
    crashEveryStep: false,
    maxSteps: 800,
    maxVirtualTimeMs: GENEROUS_VIRTUAL_MS,
  });
  assert.equal(result.finished, true);
  assert.equal(result.resultRows, 1);
});

test('driver：超出最大步数即失败', async () => {
  await assert.rejects(
    () => driveFullGameWithCrashMatrix({
      gameId: 'undercover',
      humanCount: 1,
      botCount: 3,
      crashEveryStep: false,
      maxSteps: 1,
      maxVirtualTimeMs: GENEROUS_VIRTUAL_MS,
    }),
    /最大步数|超出步数|maxSteps/,
  );
});

test('driver：超出最大虚拟时间上限即失败', async () => {
  await assert.rejects(
    () => driveFullGameWithCrashMatrix({
      gameId: 'undercover',
      humanCount: 1,
      botCount: 3,
      crashEveryStep: false,
      maxSteps: 2000,
      maxVirtualTimeMs: 100,
    }),
    /虚拟时间|virtualTime|maxVirtualTimeMs/,
  );
});

test('driver：逐动作崩溃恢复矩阵在双上限内仍然收束', async () => {
  const result = await driveFullGameWithCrashMatrix({
    gameId: 'undercover',
    humanCount: 1,
    botCount: 3,
    crashEveryStep: true,
    maxSteps: 2000,
    maxVirtualTimeMs: GENEROUS_VIRTUAL_MS,
  });
  assert.equal(result.finished, true);
  assert.equal(result.sessionStatus, 'FINISHED');
  assert.equal(result.resultRows, 1);
});
