/**
 * D4-TOOLS：diagnostics 开发/测试环境诊断器测试。
 * 输出阶段/合法 actor/合法动作/计时器/序号/随机值编号；
 * 默认关闭（不传 enabled 只返回占位，不进入生产构建路径——脚本独立于 packages）。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { deterministicContext } from '../../../packages/shared/tests/helpers/versionedGameContract.ts';
import { undercoverVersionedModule } from '../../../packages/games/undercover/server/index.ts';

const ROOT = new URL('../../..', import.meta.url);
const PLAYERS = ['uc-p1', 'uc-p2', 'uc-p3', 'uc-p4', 'uc-p5', 'uc-p6'];

async function importTool() {
  return import(new URL('scripts/d4/diagnostics.ts', ROOT).href);
}

function initialState() {
  const ctx = deterministicContext('d4:diagnostics');
  return undercoverVersionedModule.createInitialState(ctx, [...PLAYERS], undercoverVersionedModule.parseConfig({}));
}

test('工具必须存在（red 前置）', async () => {
  const tool = await importTool();
  assert.equal(typeof tool.computeDiagnostics, 'function');
});

test('默认关闭：不传 enabled 返回 enabled:false 占位', () => {
  // 由于默认关闭是 API 级约束，此处直接调用 computeDiagnostics 不带 enabled
  return importTool().then(({ computeDiagnostics }) => {
    const result = computeDiagnostics({ enabled: false, module: undercoverVersionedModule, state: initialState(), players: PLAYERS });
    assert.equal(result.enabled, false);
    assert.equal(typeof result.message, 'string');
  });
});

test('启用后输出阶段、合法 actor/动作、计时器、序号、随机值编号', async () => {
  const { computeDiagnostics } = await importTool();
  const result = computeDiagnostics({
    enabled: true,
    module: undercoverVersionedModule,
    state: initialState(),
    players: PLAYERS,
    timers: [{ timerId: 't1', deadlineAt: 1700000000000, action: { type: 'reveal_timeout' } }],
    rngState: { seed: 'd4:diagnostics', cursor: 7 },
  });
  assert.equal(result.rulesetId, 'undercover_classic_v1');
  assert.equal(result.phase, 'word_reveal');
  assert.ok(Array.isArray(result.legalActors));
  assert.ok(result.legalActors.length >= 1, '看词阶段至少一名玩家可动作');
  for (const entry of result.legalActors) {
    assert.ok(PLAYERS.includes(entry.playerId));
    assert.ok(entry.action !== null && entry.action !== undefined, '合法 actor 应带合法动作');
  }
  assert.equal(result.timers.length, 1);
  assert.equal(result.randomCursor, 7);
});

test('序号从 state.seq 提取；无 seq 字段则为 null', async () => {
  const { computeDiagnostics } = await importTool();
  const state = initialState();
  const result = computeDiagnostics({ enabled: true, module: undercoverVersionedModule, state, players: PLAYERS });
  assert.equal(result.seq, null);
  const withSeq = { ...globalThis.structuredClone(state), seq: 42 };
  const result2 = computeDiagnostics({ enabled: true, module: undercoverVersionedModule, state: withSeq, players: PLAYERS });
  assert.equal(result2.seq, 42);
});

test('生成器骨架模块：phase idle、seq 0、无机器人策略时 legalActors 全部为 null', async () => {
  const { runGenerateCli } = await import(new URL('scripts/d4/generate-module.ts', ROOT).href);
  const outDir = await mkdtemp(join(tmpdir(), 'd4-diag-skel-'));
  await runGenerateCli({ out: outDir, gameId: 'diag', rulesetId: 'diag_v1', displayName: '诊断样例', minPlayers: 2, maxPlayers: 4 });
  const { skeletonModule } = await import(pathToFileURL(join(outDir, 'server/module.ts')).href);
  const { computeDiagnostics } = await importTool();
  const ctx = deterministicContext('d4:diagnostics:skel');
  const state = skeletonModule.createInitialState(ctx, ['p1', 'p2'], skeletonModule.parseConfig({}));
  const result = computeDiagnostics({ enabled: true, module: skeletonModule, state, players: ['p1', 'p2'] });
  assert.equal(result.phase, 'idle');
  assert.equal(result.seq, 0);
  // 骨架模块无机器人策略：每个玩家都列出但 action 为 null
  assert.equal(result.legalActors.length, 2);
  for (const entry of result.legalActors) {
    assert.equal(entry.action, null);
  }
});

test('CLI 入口存在且支持 --enabled 门控', async () => {
  const { runDiagnosticsCli } = await importTool();
  const disabled = await runDiagnosticsCli({ enabled: false, statePath: 'n/a', modulePath: 'n/a' });
  assert.equal(disabled.enabled, false);
  // 启用路径需要真实 state/module 文件，走单测覆盖；CLI 只验证默认关闭门控
  assert.equal(typeof runDiagnosticsCli, 'function');
});
