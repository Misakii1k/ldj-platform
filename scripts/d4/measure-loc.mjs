/**
 * D4-TOOLS：固定版本度量脚本。
 * 按 compliance/d4/third-game-baseline.json 的 measurementRules/excludedContent/comparisonUnit：
 *   - unit: effective non-test TypeScript lines
 *   - excluded: test files / generated files / blank lines /
 *     pure type declarations (import type, interface blocks, type aliases) /
 *     static word banks (如 ROLE_NAMES 展示名映射)
 *   - comparisonUnit: 同一功能清单在旧实现与目标实现上的有效非测试 TS LOC
 *   - reductionFormula: ((baseline - target) / baseline) * 100, pass >= 40
 * 固定脚本必须原样运行（不因目标变更改脚本本身；目标清单通过 --target 传入）。
 * 用法：node scripts/d4/measure-loc.mjs [--root <dir>] [--target <target-list.json>] [--json]
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const STR_VALUE = /^[\w"'#][^:]*:\s*('[^']*'|"[^"]*"|\[[^\]]*\]|`[^`]*`)\s*,?\s*$/;

function countBraces(line) {
  let depth = 0;
  for (const char of line) {
    if (char === '{') depth += 1;
    else if (char === '}') depth -= 1;
  }
  return depth;
}

/** rawLineCountRule：非空文件按 LF 字节计行，末字节非 LF 加一；空文件为 0。 */
export function countLines(source) {
  if (source.length === 0) return { lineCount: 0 };
  const parts = source.split('\n');
  const lineCount = parts.length - (source.endsWith('\n') ? 1 : 0);
  return { lineCount };
}

/**
 * 有效非测试 TS LOC：
 * 排除空行、import type 语句、interface 块、type alias（直到 `;` 且括号归零）、
 * 静态题库（const 数据映射，全部值为字符串/字符串数组字面量）。
 * 注释行计入（除非整行空白）；测试文件有效非测试 LOC 恒为 0。
 */
export function effectiveNonTestLoc(filePath, { isTest }) {
  const source = readFileSync(filePath, 'utf8');
  const { lineCount } = countLines(source);
  if (isTest) return { lineCount, effectiveNonTestLineCount: 0 };
  const lines = source.split('\n');
  const excludedLines = new Set();
  let inInterface = false;
  let interfaceDepth = 0;
  let inTypeAlias = false;
  let typeDepth = 0;

  for (let index = 0; index < lineCount; index += 1) {
    const raw = lines[index];
    const trimmed = raw.trim();
    if (inInterface) {
      excludedLines.add(index);
      interfaceDepth += countBraces(raw);
      if (interfaceDepth <= 0) inInterface = false;
      continue;
    }
    if (inTypeAlias) {
      excludedLines.add(index);
      typeDepth += countBraces(raw);
      if (typeDepth <= 0 && /;\s*$/.test(raw)) inTypeAlias = false;
      continue;
    }
    if (trimmed === '') {
      excludedLines.add(index);
      continue;
    }
    if (/^import\s+type\s/.test(trimmed)) {
      excludedLines.add(index);
      continue;
    }
    let match = trimmed.match(/^(export\s+|declare\s+)*(default\s+)?interface\s+\w+/);
    if (match) {
      excludedLines.add(index);
      interfaceDepth = countBraces(raw);
      if (interfaceDepth > 0) inInterface = true;
      continue;
    }
    match = trimmed.match(/^(export\s+|declare\s+)*type\s+\w+/);
    if (match) {
      excludedLines.add(index);
      typeDepth = countBraces(raw);
      if (!/;\s*$/.test(raw) || typeDepth > 0) inTypeAlias = true;
      continue;
    }
    // 静态题库：const X [: annot] = { ... 全部值为字符串/字符串数组字面量 ... };
    match = raw.match(/^const\s+\w+\s*(:\s*[^{}]+)?=\s*\{\s*$/);
    if (match) {
      let depth = 0;
      let end = index;
      for (; end < lineCount; end += 1) {
        depth += countBraces(lines[end]);
        if (end > index && depth <= 0) break;
      }
      if (end < lineCount) {
        let allStrings = true;
        for (let inner = index + 1; inner < end; inner += 1) {
          const innerTrimmed = lines[inner].trim();
          if (innerTrimmed === '') continue;
          if (!STR_VALUE.test(innerTrimmed)) {
            allStrings = false;
            break;
          }
        }
        if (allStrings) {
          for (let line = index; line <= end; line += 1) excludedLines.add(line);
          continue;
        }
      }
    }
  }
  return { lineCount, effectiveNonTestLineCount: lineCount - excludedLines.size };
}

function isTestFile(relativePath) {
  const normalized = relativePath.split(sep).join('/');
  return normalized.includes('/tests/') || normalized.endsWith('.test.ts');
}

async function measureOne(root, entry) {
  const filePath = resolve(root, entry.path);
  const source = await readFile(filePath, 'utf8');
  const { lineCount } = countLines(source);
  const { effectiveNonTestLineCount } = effectiveNonTestLoc(filePath, { isTest: isTestFile(entry.path) });
  const sha256 = createHash('sha256').update(source, 'utf8').digest('hex');
  return {
    path: entry.path,
    role: entry.role,
    sha256,
    lineCount,
    effectiveNonTestLineCount,
    baselineHash: entry.sha256,
    baselineLineCount: entry.lineCount,
    baselineEffective: entry.effectiveNonTestLineCount,
    hashMatch: sha256 === entry.sha256,
    lineCountMatch: lineCount === entry.lineCount,
    effectiveMatch: effectiveNonTestLineCount === entry.effectiveNonTestLineCount,
  };
}

/** 已知样例锁定：对 baseline.sourceFiles 逐文件度量并与 third-game-baseline.json 比对 */
export async function measureSourceFiles(root) {
  const baseline = JSON.parse(await readFile(resolve(root, 'compliance/d4/third-game-baseline.json'), 'utf8'));
  const sourceFiles = [];
  let baselineTotal = 0;
  for (const entry of baseline.sourceFiles) {
    const measured = await measureOne(root, entry);
    sourceFiles.push(measured);
    baselineTotal += measured.effectiveNonTestLineCount;
  }
  const allMatch = sourceFiles.every(
    (entry) => entry.hashMatch && entry.lineCountMatch && entry.effectiveMatch,
  );
  return { sourceFiles, baselineTotal, allMatch };
}

/** reductionFormula：((baseline - target) / baseline) * 100 */
export function computeReductionPercent(baselineTotal, targetTotal) {
  if (baselineTotal <= 0) return 0;
  return Math.round(((baselineTotal - targetTotal) / baselineTotal) * 10000) / 100;
}

export async function runMeasurement(root, options = {}) {
  const { sourceFiles, baselineTotal, allMatch } = await measureSourceFiles(root);
  const targetSourceFiles = options.targetSourceFiles ?? [];
  const targetEntries = [];
  let targetTotal = 0;
  for (const entry of targetSourceFiles) {
    const filePath = resolve(root, entry.path);
    const source = await readFile(filePath, 'utf8');
    const { lineCount } = countLines(source);
    const { effectiveNonTestLineCount } = effectiveNonTestLoc(filePath, { isTest: isTestFile(entry.path) });
    targetEntries.push({ path: entry.path, role: entry.role, lineCount, effectiveNonTestLineCount });
    targetTotal += effectiveNonTestLineCount;
  }
  const provisional = targetSourceFiles.length === 0;
  if (provisional) targetTotal = baselineTotal;
  const reductionPercent = computeReductionPercent(baselineTotal, targetTotal);
  return {
    baselineSourceFiles: sourceFiles,
    baselineAllMatch: allMatch,
    baselineTotal,
    targetSourceFiles: targetEntries,
    targetTotal,
    reductionPercent,
    requiredReductionPercent: 40,
    pass: reductionPercent >= 40,
    provisional,
  };
}

export function cliMessage(result) {
  if (!result.baselineAllMatch) return 'measure-loc: FAIL 基线源集合与 third-game-baseline.json 不一致';
  if (result.provisional) {
    return `measure-loc: 基线锁定 OK（${result.baselineSourceFiles.length} 文件哈希一致） ` +
      `reduction=${result.reductionPercent}% 未提供目标实现（content-hash provisional，权威 commit 对比 DEFERRED）`;
  }
  const passText = result.pass ? 'PASS' : 'FAIL';
  return `measure-loc: ${passText} reduction=${result.reductionPercent}% (baseline=${result.baselineTotal}, target=${result.targetTotal}, required>=${result.requiredReductionPercent}%)`;
}

const invoked = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) {
  const args = process.argv.slice(2);
  const root = resolve(args[args.indexOf('--root') + 1] ?? '.');
  let targetSourceFiles = [];
  const targetIndex = args.indexOf('--target');
  if (targetIndex !== -1) {
    const targetPath = resolve(args[targetIndex + 1]);
    const targetJson = JSON.parse(await readFile(targetPath, 'utf8'));
    targetSourceFiles = Array.isArray(targetJson) ? targetJson : targetJson.targetSourceFiles ?? [];
  }
  const result = await runMeasurement(root, { targetSourceFiles });
  if (args.includes('--json')) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(cliMessage(result));
  }
  if (!result.baselineAllMatch || (!result.provisional && !result.pass)) process.exitCode = 1;
}
