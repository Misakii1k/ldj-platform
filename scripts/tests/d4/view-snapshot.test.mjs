/**
 * D4-TOOLS：view-snapshot 视角快照工具测试。
 * 逐玩家 + 观战视角快照与字节比对；观战视角不得与任何玩家视角字节相同；
 * 同一输入快照可复现（字节稳定）。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deterministicContext } from '../../../packages/shared/tests/helpers/versionedGameContract.ts';
import { undercoverVersionedModule } from '../../../packages/games/undercover/server/index.ts';

const ROOT = new URL('../../..', import.meta.url);
const PLAYERS = ['uc-p1', 'uc-p2', 'uc-p3', 'uc-p4', 'uc-p5', 'uc-p6'];
const FIXTURE_URL = new URL('../../../packages/games/undercover/tests/fixtures/d1/undercover-classic-v1.json', import.meta.url);

const baseline = JSON.parse(await readFile(fileURLToPath(FIXTURE_URL), 'utf8'));

async function importTool() {
  return import(new URL('scripts/d4/view-snapshot.ts', ROOT).href);
}

function initialState() {
  const ctx = deterministicContext('d4:view-snapshot:initial');
  return undercoverVersionedModule.createInitialState(ctx, [...PLAYERS], undercoverVersionedModule.parseConfig({}));
}

function terminalState() {
  const ctx = deterministicContext(baseline.seed);
  let state = undercoverVersionedModule.createInitialState(ctx, [...baseline.players], undercoverVersionedModule.parseConfig({}));
  for (const step of baseline.actions) {
    const reduced = undercoverVersionedModule.reduce(ctx, globalThis.structuredClone(state), step.actor, step.action);
    if (!reduced.ok) throw new Error(`fixture 动作被拒: ${JSON.stringify(step)}`);
    state = reduced.nextState;
  }
  return state;
}

test('工具必须存在（red 前置）', async () => {
  const tool = await importTool();
  assert.equal(typeof tool.captureSnapshot, 'function');
});

test('初始状态：逐玩家快照齐全，观战视角字节不与任何玩家视角相同', async () => {
  const { captureSnapshot } = await importTool();
  const result = captureSnapshot({ module: undercoverVersionedModule, state: initialState(), players: PLAYERS });
  assert.equal(result.rulesetId, 'undercover_classic_v1');
  assert.equal(result.viewVersion, 1);
  assert.equal(result.snapshots[PLAYERS[0]].bytes > 0, true);
  assert.equal(result.spectator.bytes > 0, true);
  for (const comparison of result.byteComparisons) {
    assert.equal(comparison.equal, false, `观战视角不得与 ${comparison.right} 字节相同`);
  }
  assert.deepEqual(result.leaks, []);
  // 每个玩家视角的 me.playerId 对应自己
  for (const playerId of PLAYERS) {
    const view = JSON.parse(result.snapshots[playerId].json);
    assert.equal(view.me.playerId, playerId);
    assert.equal(view.me.word !== null, true, '初始状态玩家应看到自己的词语');
  }
  const spectator = JSON.parse(result.spectator.json);
  assert.equal(spectator.reveal, null, '初始状态观战视角不得含终局揭示');
});

test('快照可复现：同一输入两次捕获字节一致', async () => {
  const { captureSnapshot } = await importTool();
  const first = captureSnapshot({ module: undercoverVersionedModule, state: initialState(), players: PLAYERS, seed: 'fixed' });
  const second = captureSnapshot({ module: undercoverVersionedModule, state: initialState(), players: PLAYERS, seed: 'fixed' });
  assert.equal(JSON.stringify(first), JSON.stringify(second));
});

test('终局状态：观战视角含揭示后仍不与玩家视角字节相同', async () => {
  const { captureSnapshot } = await importTool();
  const state = terminalState();
  assert.equal(state.phase, 'game_over');
  const result = captureSnapshot({ module: undercoverVersionedModule, state, players: baseline.players });
  for (const comparison of result.byteComparisons) {
    assert.equal(comparison.equal, false, '观战视角不得与玩家视角字节相同（即使终局揭示）');
  }
  assert.deepEqual(result.leaks, []);
});

test('CLI 管道：state 文件 + module 路径 → out JSON 文件', async () => {
  const { runViewSnapshotCli } = await importTool();
  const dir = await mkdtemp(join(tmpdir(), 'd4-view-snapshot-'));
  const statePath = join(dir, 'state.json');
  await writeFile(statePath, JSON.stringify(initialState()));
  const outPath = join(dir, 'snapshot.json');
  await runViewSnapshotCli({
    modulePath: fileURLToPath(new URL('../../../packages/games/undercover/server/index.ts', import.meta.url)),
    // index.ts 并行导出 classic 与 blank 两个 V2 模块：显式指定被快照的规则集模块。
    exportName: 'undercoverVersionedModule',
    statePath,
    outPath,
  });
  const out = JSON.parse(await readFile(outPath, 'utf8'));
  assert.equal(out.schemaVersion, 1);
  assert.ok(Object.keys(out.snapshots).length === PLAYERS.length);
  assert.equal(out.spectator.bytes > 0, true);
  assert.equal((await stat(outPath)).isFile(), true);
});
