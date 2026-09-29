/**
 * D4-TOOLS：measure-loc 固定版本度量脚本测试。
 * 按 compliance/d4/third-game-baseline.json 的 measurementRules/excludedContent/comparisonUnit：
 * 有效非测试 TS LOC；排除生成文件、空行、纯类型声明（import type/interface/type alias）、
 * 静态题库（ROLE_NAMES 展示名映射）；reductionPercent >= 40。
 * 「已知样例锁定」：对冻结源集合逐文件比对 sha256/lineCount/effectiveNonTestLineCount。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  countLines,
  effectiveNonTestLoc,
  measureSourceFiles,
  computeReductionPercent,
  runMeasurement,
  cliMessage,
} from '../../d4/measure-loc.mjs';

const ROOT_DIR = fileURLToPath(new URL('../../..', import.meta.url));

test('工具必须存在（red 前置）', () => {
  assert.equal(typeof measureSourceFiles, 'function');
  assert.equal(typeof computeReductionPercent, 'function');
});

test('lineCount 规则：非空文件按 LF 字节计行，末字节非 LF 加一', () => {
  assert.equal(countLines('').lineCount, 0);
  assert.equal(countLines('a\nb\n').lineCount, 2);
  assert.equal(countLines('a\nb').lineCount, 2);
  assert.equal(countLines('x').lineCount, 1);
});

test('已知样例锁定：冻结源集合 9 文件全部哈希/行数/有效 LOC 与 baseline 一致', async () => {
  const result = await measureSourceFiles(ROOT_DIR);
  assert.equal(result.sourceFiles.length, 9);
  assert.equal(result.allMatch, true, '冻结源集合必须与 third-game-baseline.json 逐文件一致');
  const moduleEntry = result.sourceFiles.find((f) => f.path.endsWith('server/module.ts'));
  assert.equal(moduleEntry.sha256, 'a41555b9ab23ad0bdc57619c1664540d393b08c8562d693628e1fe02035d0bf8');
  assert.equal(moduleEntry.lineCount, 1872);
  assert.equal(moduleEntry.effectiveNonTestLineCount, 1510);
  assert.equal(result.baselineTotal, 1777, '基线有效非测试 TS LOC 合计 = 1510+80+175+12');
});

test('测试文件有效非测试 LOC 为 0', () => {
  const file = ROOT_DIR + '/packages/games/werewolf/tests/module.test.ts';
  const { effectiveNonTestLineCount } = effectiveNonTestLoc(file, { isTest: true });
  assert.equal(effectiveNonTestLineCount, 0);
});

test('排除规则：空行/import type/interface/type alias/静态题库 不计数', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'd4-measure-loc-'));
  const file = join(dir, 'sample.ts');
  const source = [
    "import type { X } from 'pkg';",
    '',
    'export interface Shape {',
    '  kind: string;',
    '}',
    'export type Alias = { a: number } | null;',
    '',
    'const ROLE_NAMES: Record<string, string> = {',
    "  wolf: '狼人',",
    "  villager: '村民',",
    '};',
    '',
    'export function runtime(): number {',
    '  return 1;',
    '}',
    '',
  ].join('\n');
  await writeFile(file, source);
  const { lineCount, effectiveNonTestLineCount } = effectiveNonTestLoc(file, { isTest: false });
  assert.equal(lineCount, 15);
  // 排除：import type(1) + 空行(3) + interface 块(3) + type alias(1) + ROLE_NAMES 题库(4) = 12 → 有效 3
  assert.equal(effectiveNonTestLineCount, 3);
});

test('reductionPercent 公式与 pass 条件（>= 40）', () => {
  assert.equal(computeReductionPercent(1500, 600), 60);
  assert.equal(computeReductionPercent(1500, 900), 40);
  assert.equal(computeReductionPercent(1500, 1500), 0);
  assert.equal(computeReductionPercent(1500, 1200), 20);
});

test('runMeasurement：target 为同一功能清单的削减实现时 reductionPercent 达标', async () => {
  const result = await runMeasurement(ROOT_DIR, {
    targetSourceFiles: [{ path: 'packages/games/werewolf/shared/manifest.ts', role: 'target' }],
  });
  assert.equal(result.baselineTotal, 1777);
  assert.equal(result.targetTotal, 12);
  assert.ok(result.reductionPercent > 99);
  assert.equal(result.pass, true);
});

test('runMeasurement：未提供目标实现时为 content-hash provisional（reduction 0，pass false）', async () => {
  const result = await runMeasurement(ROOT_DIR, {});
  assert.equal(result.provisional, true);
  assert.equal(result.reductionPercent, 0);
  assert.equal(result.pass, false);
  assert.match(cliMessage(result), /provisional|未提供|DEFERRED/i);
});
