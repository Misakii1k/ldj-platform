/**
 * D4-TOOLS：规则追踪映射表工具。
 * 从规则追踪 JSON（compliance/rules/*.json）生成「条款→实现→测试」映射表，
 * 输出 docs/superpowers/reports/2026-08-05-d4-<gate>-rule-trace.md。
 * 实现/测试解析优先级：
 *   1) trace.implementations / trace.tests 内联映射（clauseId → 位置串数组）；
 *   2) 扫描 <root>/packages/games/<gameId>/server 中出现的 transitionId 串 → file#L<行号>；
 *     扫描 <root>/packages/games/<gameId>/tests 中 test('...') 标题包含 plannedTestId → file#<标题>；
 *   3) 找不到则如实标注 UNMAPPED（不臆造覆盖）。
 * 用法：node scripts/d4/rule-trace.ts --trace <trace.json> [--gate <gate>] [--root <dir>] [--report <path>]
 */
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export interface RuleTraceClauseRow {
  clauseId: string;
  sourceSection: string;
  sourceText: string;
  implementation: string;
  tests: string[];
  unmappedTransitions: string[];
  unmappedTestIds: string[];
  covered: boolean;
}

export interface RuleTraceSummary {
  schemaVersion: number;
  rulesetId: string;
  gameId: string;
  kind: string;
  releaseStatus: string;
  sourceDocuments: string[];
  differenceCount: number;
  totalClauseCount: number;
  clauses: RuleTraceClauseRow[];
  mappedImplementationCount: number;
  unmappedImplementationCount: number;
  mappedTestCount: number;
  unmappedTestCount: number;
  reportPath: string;
}

export interface RuleTraceOptions {
  tracePath: string;
  gate?: string;
  root?: string;
  reportPath?: string;
}

async function walk(dir: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const files: string[] = [];
  for (const entry of entries) {
    const child = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walk(child));
    if (entry.isFile()) files.push(child);
  }
  return files;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

/** 扫描源码目录，返回 transitionId 出现位置列表 */
async function scanTransitions(root: string, gameId: string, transitionId: string): Promise<string[]> {
  const serverDir = resolve(root, 'packages', 'games', gameId, 'server');
  const files = (await walk(serverDir)).filter((file) => file.endsWith('.ts'));
  const hits: string[] = [];
  for (const file of files) {
    const source = await readFile(file, 'utf8');
    const lines = source.split('\n');
    for (let index = 0; index < lines.length; index += 1) {
      if (lines[index]!.includes(transitionId)) {
        hits.push(`${relative(root, file).split('\\').join('/')}#L${index + 1}`);
      }
    }
  }
  return [...new Set(hits)];
}

/** 扫描测试目录，返回标题包含 plannedTestId 的用例位置列表 */
async function scanTests(root: string, gameId: string, plannedTestId: string): Promise<string[]> {
  const testsDir = resolve(root, 'packages', 'games', gameId, 'tests');
  const files = (await walk(testsDir)).filter((file) => file.endsWith('.test.ts'));
  const hits: string[] = [];
  const titlePattern = /test\(\s*(['"`])(.*?)\1/g;
  for (const file of files) {
    const source = await readFile(file, 'utf8');
    for (const match of source.matchAll(titlePattern)) {
      const title = match[2] ?? '';
      if (title.includes(plannedTestId)) {
        hits.push(`${relative(root, file).split('\\').join('/')}#${title}`);
      }
    }
  }
  return [...new Set(hits)];
}

export async function generateRuleTraceReport(options: RuleTraceOptions): Promise<RuleTraceSummary> {
  const gate = options.gate ?? 'tools';
  const root = resolve(options.root ?? '.');
  const trace = JSON.parse(await readFile(resolve(options.tracePath), 'utf8')) as Record<string, unknown>;
  const clauses = Array.isArray(trace.clauses) ? trace.clauses as Record<string, unknown>[] : [];
  const differences = Array.isArray(trace.differences) ? trace.differences : [];
  const inlineImplementations = (trace.implementations ?? {}) as Record<string, unknown>;
  const inlineTests = (trace.tests ?? {}) as Record<string, unknown>;
  const gameId = isNonEmptyString(trace.gameId) ? trace.gameId : 'unknown';

  const rows: RuleTraceClauseRow[] = [];
  let mappedImplementationCount = 0;
  let unmappedImplementationCount = 0;
  let mappedTestCount = 0;
  let unmappedTestCount = 0;

  for (const clause of clauses) {
    const clauseId = isNonEmptyString(clause.clauseId) ? clause.clauseId : '?';
    const sourceSection = isNonEmptyString(clause.sourceSection) ? clause.sourceSection : '';
    const sourceText = isNonEmptyString(clause.sourceText) ? clause.sourceText : '';
    const transitionIds = Array.isArray(clause.transitionIds)
      ? clause.transitionIds.filter(isNonEmptyString)
      : [];
    const plannedTestIds = Array.isArray(clause.plannedTestIds)
      ? clause.plannedTestIds.filter(isNonEmptyString)
      : [];

    // 实现解析
    let implementation: string;
    const mappedTransitions = new Set<string>();
    const inlineImpl = inlineImplementations[clauseId];
    if (Array.isArray(inlineImpl) && inlineImpl.length > 0) {
      implementation = inlineImpl.map(String).join(', ');
      // 内联映射视为已映射全部 transitionId（映射表明确列出即视为有实现落点）
      for (const transitionId of transitionIds) mappedTransitions.add(transitionId);
    } else {
      const hits = new Set<string>();
      for (const transitionId of transitionIds) {
        const transitionHits = await scanTransitions(root, gameId, transitionId);
        if (transitionHits.length > 0) {
          mappedTransitions.add(transitionId);
          for (const hit of transitionHits) hits.add(hit);
        }
      }
      implementation = hits.size > 0 ? [...hits].sort().join(', ') : 'UNMAPPED';
    }
    if (implementation === 'UNMAPPED') unmappedImplementationCount += 1;
    else mappedImplementationCount += 1;

    // 测试解析
    const tests: string[] = [];
    const unmappedTestIds: string[] = [];
    const inlineTest = inlineTests[clauseId];
    if (Array.isArray(inlineTest) && inlineTest.length > 0) {
      tests.push(...inlineTest.map(String));
    } else {
      for (const plannedTestId of plannedTestIds) {
        const hits = await scanTests(root, gameId, plannedTestId);
        if (hits.length > 0) tests.push(...hits);
        else unmappedTestIds.push(plannedTestId);
      }
    }
    mappedTestCount += tests.length;
    unmappedTestCount += unmappedTestIds.length;

    const unmappedTransitions = transitionIds.filter((transitionId) => !mappedTransitions.has(transitionId));
    rows.push({
      clauseId,
      sourceSection,
      sourceText,
      implementation,
      tests: [...new Set(tests)].sort(),
      unmappedTransitions,
      unmappedTestIds,
      covered: implementation !== 'UNMAPPED' && tests.length > 0 && unmappedTestIds.length === 0,
    });
  }

  const reportPath = options.reportPath
    ? resolve(options.reportPath)
    : resolve(root, 'docs', 'superpowers', 'reports', `2026-08-05-d4-${gate}-rule-trace.md`);
  await mkdir(join(reportPath, '..'), { recursive: true });

  const lines: string[] = [];
  lines.push(`# D4 ${gate} 规则追踪映射表`);
  lines.push('');
  lines.push(`- rulesetId：${trace.rulesetId ?? ''}`);
  lines.push(`- gameId：${gameId}`);
  lines.push(`- kind：${trace.kind ?? ''} / releaseStatus：${trace.releaseStatus ?? ''}`);
  lines.push(`- sourceDocuments：${(Array.isArray(trace.sourceDocuments) ? trace.sourceDocuments : []).join('；')}`);
  lines.push(`- 条款总数：${rows.length} / 差异总数：${differences.length}`);
  lines.push(`- 汇总：已映射实现 ${mappedImplementationCount}/${rows.length}，已映射测试 ${mappedTestCount}/${mappedTestCount + unmappedTestCount}`);
  lines.push('');
  lines.push('## 条款 → 实现 → 测试');
  lines.push('');
  lines.push('| 条款 | 来源 | 实现 | 测试 | 覆盖 |');
  lines.push('| --- | --- | --- | --- | --- |');
  for (const row of rows) {
    const tests = row.tests.length > 0
      ? row.tests.join('<br>')
      : (row.unmappedTestIds.length > 0 ? `UNMAPPED（${row.unmappedTestIds.join(', ')}）` : 'UNMAPPED');
    lines.push(`| ${row.clauseId} | ${row.sourceSection} | ${row.implementation} | ${tests} | ${row.covered ? '是' : '否'} |`);
  }
  lines.push('');
  lines.push('> 说明：UNMAPPED 表示未在 `packages/games/{gameId}/server` 源码或 `tests` 目录解析到对应实现/用例；内联 `implementations`/`tests` 映射优先。');
  lines.push('');
  await writeFile(reportPath, `${lines.join('\n')}\n`, 'utf8');
  console.log(
    `rule-trace:OK gate=${gate} rulesetId=${trace.rulesetId ?? ''} clauses=${rows.length} ` +
    `impl=${mappedImplementationCount}/${rows.length} tests=${mappedTestCount}/${mappedTestCount + unmappedTestCount} out=${reportPath}`,
  );
  return {
    schemaVersion: typeof trace.schemaVersion === 'number' ? trace.schemaVersion : 0,
    rulesetId: isNonEmptyString(trace.rulesetId) ? trace.rulesetId : '',
    gameId,
    kind: isNonEmptyString(trace.kind) ? trace.kind : '',
    releaseStatus: isNonEmptyString(trace.releaseStatus) ? trace.releaseStatus : '',
    sourceDocuments: Array.isArray(trace.sourceDocuments) ? trace.sourceDocuments.map(String) : [],
    differenceCount: differences.length,
    totalClauseCount: rows.length,
    clauses: rows,
    mappedImplementationCount,
    unmappedImplementationCount,
    mappedTestCount,
    unmappedTestCount,
    reportPath,
  };
}

const invokedDirectly = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href === import.meta.url
  : false;
if (invokedDirectly) {
  const args = process.argv.slice(2);
  const read = (flag: string): string | undefined => {
    const index = args.indexOf(flag);
    return index === -1 ? undefined : args[index + 1];
  };
  await generateRuleTraceReport({
    tracePath: read('--trace') ?? '',
    gate: read('--gate') ?? 'tools',
    root: read('--root'),
    reportPath: read('--report'),
  });
}
