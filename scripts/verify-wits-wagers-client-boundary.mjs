import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// 专有特征词与题库 sentinel 列表（来自 server/question-bank.zh-CN.ts 内部特有私密事实）
export const QUESTION_BANK_SENTINELS = [
  'ww-geo-001',
  'ww-his-002',
  '奥霍斯-德尔萨拉多山',
  '唐古拉山脉各拉丹冬峰',
  '中国长江三峡集团官方工程公报',
  '各拉丹冬峰',
  'yrcc.gov.cn',
];

export const FORBIDDEN_IMPORT_PATTERNS = [
  /@ldj\/game-wits-wagers\/server/,
  /@ldj\/game-wits-wagers/,
  /packages\/games\/wits-wagers\/server/,
];

/**
 * 检查内存模块依赖图（供单测与插件分析）
 */
export function checkModuleGraph(modules) {
  const violations = [];
  for (const mod of modules) {
    for (const dep of mod.dependencies ?? []) {
      for (const pattern of FORBIDDEN_IMPORT_PATTERNS) {
        if (pattern.test(dep)) {
          violations.push(`模块 ${mod.id} 存在非法服务端依赖: ${dep}`);
          break;
        }
      }
    }
    for (const sentinel of QUESTION_BANK_SENTINELS) {
      if (mod.code && mod.code.includes(sentinel)) {
        violations.push(`模块 ${mod.id} 包含未公开题库内容: ${sentinel}`);
      }
    }
  }
  return violations;
}

/**
 * 扫描客户端产物目录 dist
 */
export function scanClientDist(distDir) {
  const violations = [];
  if (!existsSync(distDir)) {
    violations.push(`dist 目录不存在: ${distDir}`);
    return violations;
  }

  function walk(dir) {
    const files = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) files.push(...walk(full));
      else if (entry.isFile() && (full.endsWith('.js') || full.endsWith('.css') || full.endsWith('.html'))) {
        files.push(full);
      }
    }
    return files;
  }

  const files = walk(distDir);
  for (const file of files) {
    const content = readFileSync(file, 'utf8');
    for (const sentinel of QUESTION_BANK_SENTINELS) {
      if (content.includes(sentinel)) {
        violations.push(`${file}: 命中题库内容泄露 sentinel "${sentinel}"`);
      }
    }
    for (const pattern of FORBIDDEN_IMPORT_PATTERNS) {
      if (pattern.test(content)) {
        violations.push(`${file}: 命中非法服务端引用 "${pattern}"`);
      }
    }
  }
  return violations;
}

/**
 * 扫描客户端源码目录 packages/client/src，断言零游戏包依赖（契约 C01）
 */
export function scanClientSource(clientSrcDir) {
  const violations = [];
  if (!existsSync(clientSrcDir)) {
    violations.push(`client src 目录不存在: ${clientSrcDir}`);
    return violations;
  }

  function walk(dir) {
    const files = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) files.push(...walk(full));
      else if (entry.isFile() && (full.endsWith('.ts') || full.endsWith('.tsx') || full.endsWith('.css'))) {
        files.push(full);
      }
    }
    return files;
  }

  const files = walk(clientSrcDir);
  for (const file of files) {
    const content = readFileSync(file, 'utf8');
    if (content.includes('@ldj/game-wits-wagers')) {
      violations.push(`${file}: 客户端代码直接导入了 @ldj/game-wits-wagers，违反契约 C01 零游戏包依赖原则`);
    }
  }
  return violations;
}

export function runBoundaryVerification(root = '.') {
  const distDir = resolve(root, 'packages/client/dist');
  const srcDir = resolve(root, 'packages/client/src');

  const distViolations = scanClientDist(distDir);
  const srcViolations = scanClientSource(srcDir);
  return [...distViolations, ...srcViolations];
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const root = resolve(process.argv[2] ?? '.');
  const errors = runBoundaryVerification(root);
  if (errors.length > 0) {
    console.error('Wits & Wagers 客户端边界与泄露检查 FAILED:');
    for (const err of errors) console.error(`  - ${err}`);
    process.exitCode = 1;
  } else {
    console.log('Wits & Wagers 客户端边界与泄露检查: PASS (零游戏包依赖，零题库泄露)');
  }
}
