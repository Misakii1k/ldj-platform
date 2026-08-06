/**
 * D4-TOOLS：generate-module 模块生成器测试。
 * 生成标准模块骨架（manifest/reducer/初始状态）+ 契约测试占位，不生成伪业务逻辑；
 * 产物可被真实契约套件验证（identity/initial/pure/被拒动作不推进/视角 Schema）。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { versionedContractAssertions, deterministicContext } from '../../../packages/shared/tests/helpers/versionedGameContract.ts';

const ROOT = new URL('../../..', import.meta.url);

async function generateInto(outDir) {
  const { runGenerateCli } = await import(new URL('scripts/d4/generate-module.ts', ROOT).href);
  const summary = await runGenerateCli({
    out: outDir,
    gameId: 'sample',
    rulesetId: 'sample_platform_v1',
    displayName: '示例游戏',
    minPlayers: 2,
    maxPlayers: 6,
  });
  return summary;
}

test('生成器必须存在（red 前置）', async () => {
  const { runGenerateCli } = await import(new URL('scripts/d4/generate-module.ts', ROOT).href);
  assert.equal(typeof runGenerateCli, 'function');
});

test('生成标准四件套骨架：manifest/reducer/初始状态/契约测试占位', async () => {
  const outDir = await mkdtemp(join(tmpdir(), 'd4-generate-'));
  const summary = await generateInto(outDir);
  assert.ok(summary.files.length >= 4, '应生成 manifest/module/index/contract.test 四个文件');
  for (const rel of ['shared/manifest.ts', 'server/module.ts', 'server/index.ts', 'tests/contract.test.ts']) {
    const p = join(outDir, rel);
    assert.equal((await stat(p)).isFile(), true, `${rel} 应存在`);
  }
  const manifest = await readFile(join(outDir, 'shared/manifest.ts'), 'utf8');
  assert.match(manifest, /id:\s*'sample'/);
  assert.match(manifest, /displayName:\s*'示例游戏'/);
  assert.match(manifest, /minPlayers:\s*2/);
  assert.match(manifest, /maxPlayers:\s*6/);
  const module = await readFile(join(outDir, 'server/module.ts'), 'utf8');
  assert.match(module, /engineContractVersion:\s*2/);
  assert.match(module, /rulesetId:\s*'sample_platform_v1'/);
  assert.match(module, /viewVersion:\s*1/);
  assert.match(module, /NOT_IMPLEMENTED/);
  const contractTest = await readFile(join(outDir, 'tests/contract.test.ts'), 'utf8');
  assert.match(contractTest, /versionedContractAssertions/);
  assert.match(contractTest, /\.\.\/\.\.\/\.\.\/shared\/tests\/helpers\/versionedGameContract\.ts/);
});

test('生成器不生成伪业务逻辑：无运行时随机/时钟/IO 语句', async () => {
  const outDir = await mkdtemp(join(tmpdir(), 'd4-generate-'));
  await generateInto(outDir);
  const module = await readFile(join(outDir, 'server/module.ts'), 'utf8');
  for (const forbidden of ['Math.random', 'Date.now', 'fetch(', 'import(', 'setTimeout']) {
    assert.equal(module.includes(forbidden), false, `module.ts 不应包含 ${forbidden}`);
  }
});

test('生成器可复现：两次生成产物字节一致', async () => {
  const dirA = await mkdtemp(join(tmpdir(), 'd4-generate-a-'));
  const dirB = await mkdtemp(join(tmpdir(), 'd4-generate-b-'));
  await generateInto(dirA);
  await generateInto(dirB);
  for (const rel of ['shared/manifest.ts', 'server/module.ts', 'server/index.ts', 'tests/contract.test.ts']) {
    const a = await readFile(join(dirA, rel), 'utf8');
    const b = await readFile(join(dirB, rel), 'utf8');
    assert.equal(a, b, `${rel} 两次生成应字节一致`);
  }
});

test('生成器产物通过真实契约套件（identity/initial/pure/被拒动作不推进/视角 Schema）', async () => {
  const outDir = await mkdtemp(join(tmpdir(), 'd4-generate-'));
  await generateInto(outDir);
  const moduleUrl = pathToFileURL(join(outDir, 'server/module.ts')).href;
  const { skeletonModule } = await import(moduleUrl);
  const ctx = deterministicContext('d4:generate:contract');
  versionedContractAssertions.identity(skeletonModule);
  const players = ['p1', 'p2', 'p3', 'p4'];
  versionedContractAssertions.initial(skeletonModule, ctx, players, { rulesetId: 'sample_platform_v1' });
  const state = skeletonModule.createInitialState(ctx, players, skeletonModule.parseConfig({}));
  // reduce 一律拒绝 → 被拒动作不推进
  versionedContractAssertions.rejectedDoesNotAdvance(
    skeletonModule,
    ctx,
    state,
    { kind: 'player', playerId: 'p1' },
    { type: 'noop' },
  );
  versionedContractAssertions.viewSchemas(skeletonModule, state, players);
});

test('生成器拒绝非法参数：玩家数量越界抛错', async () => {
  const outDir = await mkdtemp(join(tmpdir(), 'd4-generate-'));
  await generateInto(outDir);
  const { skeletonModule } = await import(pathToFileURL(join(outDir, 'server/module.ts')).href);
  const ctx = deterministicContext('d4:generate:range');
  assert.throws(
    () => skeletonModule.createInitialState(ctx, ['only-one'], skeletonModule.parseConfig({})),
    /玩家数量|minPlayers|超出/,
  );
  assert.throws(
    () => skeletonModule.createInitialState(ctx, ['p1', 'p1'], skeletonModule.parseConfig({})),
    /重复/,
  );
});

test('清理：生成目录下的测试占位可被 node 原生读取', async () => {
  const outDir = await mkdtemp(join(tmpdir(), 'd4-generate-'));
  await generateInto(outDir);
  const files = await readdir(join(outDir, 'tests'));
  assert.ok(files.includes('contract.test.ts'));
  // 占位测试自身引用 node:test（未来在 packages/games/<id>/tests 下可跑）
  const content = await readFile(join(outDir, 'tests/contract.test.ts'), 'utf8');
  assert.match(content, /node:test/);
  assert.equal(typeof dirname, 'function');
});
