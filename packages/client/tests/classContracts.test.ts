import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

/**
 * 类名契约：TSX 里用到的共享小游戏类名（.sg-*）必须在 CSS 里真的被定义过。
 *
 * 背景：`.sg-badge` / `.sg-tag` / `.sg-btn` / `.sg-modal-*` 曾在 TSX 中被使用，
 * 但全部 CSS 里没有任何定义——它们只是靠 `.sg-panel__head span` 的后代规则
 * 碰巧获得了字号；一旦元素被移到别的容器（如 ArenaBoard 页脚）就彻底裸奔。
 * 这条断言把「用了但没定义」变成红灯。
 */
const SRC_DIR = fileURLToPath(new URL('../src', import.meta.url));

function collectFiles(dir: string, extensions: readonly string[]): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...collectFiles(full, extensions));
    else if (extensions.some((ext) => full.endsWith(ext))) out.push(full);
  }
  return out;
}

const TSX_FILES = collectFiles(SRC_DIR, ['.tsx']);
const CSS_FILES = collectFiles(SRC_DIR, ['.css']);

const CSS_TEXT = CSS_FILES.map((file) => readFileSync(file, 'utf8')).join('\n');

/** 从 TSX 的 className 字面量中收集 sg-* 类名（含模板串里的静态片段）。 */
function collectUsedSgClasses(): Set<string> {
  const used = new Set<string>();
  for (const file of TSX_FILES) {
    const text = readFileSync(file, 'utf8');
    for (const match of text.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\}|\{'([^']*)'\})/g)) {
      const literal = match[1] ?? match[2] ?? match[3] ?? '';
      for (const cls of literal.matchAll(/\bsg-[a-z0-9-]+/g)) used.add(cls[0]);
    }
  }
  return used;
}

function isDefined(className: string): boolean {
  return CSS_TEXT.includes(`.${className}`);
}

test('类名契约：所有在用的 .sg-* 类名都必须在 CSS 中定义', () => {
  const used = [...collectUsedSgClasses()].sort();
  assert.ok(used.length > 0, '应至少收集到若干 .sg-* 用法');
  const undefinedClasses = used.filter((className) => !isDefined(className));
  assert.deepEqual(
    undefinedClasses,
    [],
    `以下类名在 TSX 中被使用但 CSS 中没有任何定义（会渲染成无样式）：${undefinedClasses.join(', ')}`,
  );
});

test('类名契约：.sg-* 配方必须引用统一设计令牌', () => {
  const gameUiCss = readFileSync(new URL('../src/shared-ui/game-ui.css', import.meta.url), 'utf8');
  const sgSection = gameUiCss.slice(gameUiCss.indexOf('8. 小游戏通用件'));
  assert.ok(sgSection.length > 0, 'game-ui.css 应存在 .sg-* 配方段');
  // 该段内不允许出现裸十六进制色值或裸时长字面量。
  // 例外：纯白 / 纯黑只作为「彩色底上的前景色 / 加深底色」使用，不承载主题语义。
  const ABSOLUTE_ON_COLOR = new Set(['#fff', '#ffffff', '#000', '#000000']);
  const rawHex = (sgSection.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [])
    .filter((value) => !ABSOLUTE_ON_COLOR.has(value.toLowerCase()));
  assert.deepEqual(rawHex, [], `.sg-* 配方段不允许写裸主题色值：${rawHex.join(', ')}`);
  assert.ok(sgSection.includes('var(--gp-'), '.sg-* 配方应引用 --gp-* 令牌');
});
