import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

/**
 * 断点契约：响应式断点必须收敛到统一集合，禁止继续扩散。
 *
 * 规范集合（计划已批准）：
 *   宽度 380 / 480 / 640 / 768 / 1024 / 1280
 *   高度 520 / 620（横屏矮视口）
 *   方向 orientation、动效偏好 prefers-reduced-motion、指针 hover/pointer
 *
 * 历史遗留断点（350/360/420/430/440/520/560/600/620/680/720/760/860/900/980/1023/1025/1600…）
 * 已全部迁移到规范集合，LEGACY_ALLOWLIST 现为空，**禁止再新增任何非规范断点**。
 */
const SRC_DIR = fileURLToPath(new URL('../src', import.meta.url));

const CANONICAL_WIDTHS = new Set([380, 480, 640, 768, 1024, 1280]);
const CANONICAL_HEIGHTS = new Set([520, 620]);
const ALLOWED_FEATURES = new Set([
  'max-width',
  'min-width',
  'max-height',
  'orientation',
  'prefers-reduced-motion',
  'hover',
  'pointer',
]);

/** 既有非规范断点已于 2026-09 全部迁移到规范集合；此清单应保持为空，禁止再加入条目。 */
const LEGACY_ALLOWLIST = new Set<string>([]);

function collectCssFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...collectCssFiles(full));
    else if (full.endsWith('.css')) out.push(full);
  }
  return out;
}

interface MediaQuery {
  file: string;
  condition: string;
}

function collectMediaQueries(): MediaQuery[] {
  const queries: MediaQuery[] = [];
  for (const file of collectCssFiles(SRC_DIR)) {
    const text = readFileSync(file, 'utf8');
    for (const match of text.matchAll(/@media\s*([^{]+)\{/g)) {
      // 保留完整条件串（含逗号分隔的多组），与 LEGACY_ALLOWLIST 一一对应。
      const condition = `(${match[1]!.trim().replace(/\s+/g, ' ').replace(/^\(|\)$/g, '')})`;
      queries.push({ file, condition });
    }
  }
  return queries;
}

/** 抽出条件里所有 feature 名与数值，判断是否落在规范集合内。 */
function violations(condition: string): string[] {
  const problems: string[] = [];
  for (const feature of condition.matchAll(/\(([a-z-]+)\s*:\s*([^)]+)\)/g)) {
    const name = feature[1]!;
    const rawValue = feature[2]!.trim();
    if (!ALLOWED_FEATURES.has(name)) {
      problems.push(`未允许的媒体特性 ${name}`);
      continue;
    }
    const px = /^(\d+)px$/.exec(rawValue);
    if (!px) continue;
    const value = Number(px[1]);
    if (name === 'max-width' || name === 'min-width') {
      if (!CANONICAL_WIDTHS.has(value)) problems.push(`宽度断点 ${value}px 不在规范集合`);
    } else if (name === 'max-height' || name === 'min-height') {
      if (!CANONICAL_HEIGHTS.has(value)) problems.push(`高度断点 ${value}px 不在规范集合`);
    }
  }
  return problems;
}

test('断点契约：不得新增非规范断点（既有遗留已冻结）', () => {
  const queries = collectMediaQueries();
  assert.ok(queries.length > 20, `应解析到足量 @media（实际 ${queries.length}）`);

  const unexpected: string[] = [];
  for (const query of queries) {
    const problems = violations(query.condition);
    if (problems.length === 0) continue;
    if (LEGACY_ALLOWLIST.has(query.condition)) continue;
    unexpected.push(`${query.condition}  ← ${query.file.replace(SRC_DIR, 'src')}（${problems.join('；')}）`);
  }

  assert.deepEqual(
    [...new Set(unexpected)].sort(),
    [],
    `发现新的非规范断点（请改用 380/480/640/768/1024/1280 + max-height 520/620）：\n${[...new Set(unexpected)].join('\n')}`,
  );
});

test('断点契约：遗留清单必须保持为空（禁止重新引入豁免）', () => {
  assert.equal(LEGACY_ALLOWLIST.size, 0, '不得向 LEGACY_ALLOWLIST 新增条目，请直接使用规范断点');
});

test('断点契约：规范集合本身必须是可用的（自检）', () => {
  assert.deepEqual([...CANONICAL_WIDTHS].sort((a, b) => a - b), [380, 480, 640, 768, 1024, 1280]);
  assert.deepEqual([...CANONICAL_HEIGHTS].sort((a, b) => a - b), [520, 620]);
});
