/**
 * D4-TOOLS：rule-trace 规则追踪映射表工具测试。
 * 从规则追踪 JSON 生成「条款→实现→测试」映射表，输出
 * docs/superpowers/reports/2026-08-05-d4-<gate>-rule-trace.md；
 * 实现/测试映射优先取 trace 内联映射，否则扫描游戏源码与测试目录。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = fileURLToPath(new URL('../../..', import.meta.url));

function minimalTrace(gameId) {
  return {
    schemaVersion: 1,
    rulesetId: 'sample_platform_v1',
    gameId,
    kind: 'platform_variant',
    releaseStatus: 'internal_prototype',
    sourceDocuments: ['docs/superpowers/specs/2026-08-02-shared-game-engine-design.md'],
    policyVersions: { rulesetPolicy: 'sample-v1' },
    differences: [
      {
        differenceId: 'SAMPLE-DIFF-001',
        classification: 'KEEP_COMPAT',
        baselineRulesetId: 'legacy_sample_v1',
        baselineBehavior: 'legacy baseline behavior.',
        targetBehavior: 'target behavior.',
        relatedClauseIds: ['SAMPLE-CLAUSE-001'],
      },
    ],
    clauses: [
      {
        clauseId: 'SAMPLE-CLAUSE-001',
        sourceSection: 'Sample section (line 1)',
        sourceText: 'The clause must be mapped.',
        transitionIds: ['sample.transition.one', 'sample.transition.unknown'],
        plannedTestIds: ['sample_clause_test', 'sample_missing_test'],
      },
    ],
  };
}

async function fixtureRoot() {
  const root = await mkdtemp(join(tmpdir(), 'd4-rule-trace-'));
  const serverDir = join(root, 'packages', 'games', 'samplegame', 'server');
  const testsDir = join(root, 'packages', 'games', 'samplegame', 'tests');
  await mkdir(serverDir, { recursive: true });
  await mkdir(testsDir, { recursive: true });
  await writeFile(
    join(serverDir, 'module.ts'),
    '// sample.transition.one 被实现于此\n',
  );
  await writeFile(
    join(testsDir, 'sample.test.ts'),
    "import { test } from 'node:test';\ntest('sample_clause_test runs the clause', () => {});\n",
  );
  const tracePath = join(root, 'trace.json');
  await writeFile(tracePath, JSON.stringify(minimalTrace('samplegame')));
  return { root, tracePath, reportPath: join(root, 'report.md') };
}

async function importTool() {
  return import(new URL('../../d4/rule-trace.ts', import.meta.url).href);
}

test('工具必须存在（red 前置）', async () => {
  const tool = await importTool();
  assert.equal(typeof tool.generateRuleTraceReport, 'function');
});

test('映射表：实现按 transitionId 扫描源码，测试按 plannedTestId 扫描测试目录', async () => {
  const { root, tracePath, reportPath } = await fixtureRoot();
  const { generateRuleTraceReport } = await importTool();
  const summary = await generateRuleTraceReport({ tracePath, gate: 'tools', root, reportPath });
  assert.equal(summary.totalClauseCount, 1);
  const clause = summary.clauses[0];
  assert.equal(clause.clauseId, 'SAMPLE-CLAUSE-001');
  assert.match(clause.implementation, /module\.ts#L\d+/);
  assert.match(clause.tests.join(' '), /sample\.test\.ts#sample_clause_test/);
  const report = await readFile(reportPath, 'utf8');
  assert.match(report, /SAMPLE-CLAUSE-001/);
  assert.match(report, /module\.ts#L\d+/);
  assert.match(report, /sample_clause_test/);
});

test('映射表：未知 transitionId 标为 UNMAPPED，条款覆盖统计正确', async () => {
  const { root, tracePath, reportPath } = await fixtureRoot();
  const { generateRuleTraceReport } = await importTool();
  const summary = await generateRuleTraceReport({ tracePath, gate: 'tools', root, reportPath });
  const clause = summary.clauses[0];
  // sample.transition.one 映射到 module.ts；sample.transition.unknown 未实现
  assert.equal(clause.unmappedTransitions.length, 1);
  assert.equal(clause.unmappedTransitions[0], 'sample.transition.unknown');
  assert.ok(summary.mappedImplementationCount >= 1);
  assert.equal(summary.mappedTestCount, 1);
  assert.equal(summary.unmappedTestCount, 1);
});

test('内联映射优先：trace.implementations/trace.tests 直接采用', async () => {
  const { root, tracePath, reportPath } = await fixtureRoot();
  const trace = JSON.parse(await readFile(tracePath, 'utf8'));
  trace.implementations = { 'SAMPLE-CLAUSE-001': ['packages/games/samplegame/server/handler.ts'] };
  trace.tests = { 'SAMPLE-CLAUSE-001': ['packages/games/samplegame/tests/clause.test.ts'] };
  await writeFile(tracePath, JSON.stringify(trace));
  const { generateRuleTraceReport } = await importTool();
  const summary = await generateRuleTraceReport({ tracePath, gate: 'tools', root, reportPath });
  const clause = summary.clauses[0];
  assert.equal(clause.implementation, 'packages/games/samplegame/server/handler.ts');
  assert.deepEqual(clause.tests, ['packages/games/samplegame/tests/clause.test.ts']);
});

test('真实输入：仓库 undercover_blank 追踪生成报告（无实现映射，如实标注 UNMAPPED）', async () => {
  const { generateRuleTraceReport } = await importTool();
  const tracePath = join(ROOT_DIR, 'compliance', 'rules', 'undercover_blank_v1.json');
  const reportPath = join(await mkdtemp(join(tmpdir(), 'd4-rule-trace-real-')), 'report.md');
  const summary = await generateRuleTraceReport({
    tracePath,
    gate: 'tools',
    root: ROOT_DIR,
    reportPath,
  });
  assert.equal(summary.rulesetId, 'undercover_blank_v1');
  assert.ok(summary.totalClauseCount >= 10);
  // blank 规则集未实现：实现映射如实为 UNMAPPED
  assert.equal(summary.mappedImplementationCount, 0);
  const report = await readFile(reportPath, 'utf8');
  assert.match(report, /# D4 tools 规则追踪映射表/);
  assert.match(report, /UNMAPPED/);
});

test('默认报告路径：docs/superpowers/reports/2026-08-05-d4-<gate>-rule-trace.md', async () => {
  const { root, tracePath } = await fixtureRoot();
  const { generateRuleTraceReport } = await importTool();
  const summary = await generateRuleTraceReport({ tracePath, gate: 'tools', root });
  assert.equal(
    resolve(summary.reportPath),
    resolve(join(root, 'docs', 'superpowers', 'reports', '2026-08-05-d4-tools-rule-trace.md')),
  );
});
