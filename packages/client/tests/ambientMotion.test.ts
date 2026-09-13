import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  AMBIENT_MOTION_SELECTORS,
  ESSENTIAL_FEEDBACK_SELECTORS,
  MOTION_DURATION_TOKENS,
} from '../src/motion/ambientMotion.ts';

const GAME_UI_CSS = readFileSync(new URL('../src/shared-ui/game-ui.css', import.meta.url), 'utf8');
const STYLES_CSS = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');

/** 从 game-ui.css 的 reduced 门控块里抽出 :is(...) 中的选择器清单。 */
function extractReducedGateSelectors(css: string): string[] {
  const match = /html\[data-motion-level="reduced"\]\s*:is\(([\s\S]*?)\)\s*\{/.exec(css);
  assert.ok(match, 'game-ui.css 应存在 html[data-motion-level="reduced"] :is(...) 门控块');
  return match![1]
    .split(',')
    .map((entry) => entry.replace(/\/\*[\s\S]*?\*\//g, '').trim())
    .filter((entry) => entry.length > 0);
}

test('动效清单：CSS 门控块与 ambientMotion.ts 完全一致', () => {
  const fromCss = extractReducedGateSelectors(GAME_UI_CSS);
  assert.deepEqual(
    fromCss,
    [...AMBIENT_MOTION_SELECTORS],
    'game-ui.css 的 reduced 环境动效清单与 src/motion/ambientMotion.ts 不一致：新增/删除装饰循环时必须同时改两处',
  );
});

test('动效清单：每条环境动效选择器都真实存在于 styles.css', () => {
  const missing = AMBIENT_MOTION_SELECTORS.filter((selector) => {
    const bare = selector.replace(/::?[a-z-]+\(?[^)]*\)?$/i, '');
    return !STYLES_CSS.includes(bare);
  });
  assert.deepEqual(missing, [], `环境动效清单存在已失效的选择器：${missing.join(', ')}`);
});

test('动效清单：必要反馈不得出现在环境动效门控清单中', () => {
  const ambient = new Set<string>(AMBIENT_MOTION_SELECTORS);
  for (const selector of ESSENTIAL_FEEDBACK_SELECTORS) {
    assert.equal(
      ambient.has(selector),
      false,
      `${selector} 承载回合/紧迫信息，不能作为装饰循环在 reduced 档位被关闭`,
    );
  }
});

test('动效令牌：时长档位齐全且单调递增', () => {
  const rootBlock = /:root\s*\{([\s\S]*?)\n\}/.exec(GAME_UI_CSS);
  assert.ok(rootBlock, 'game-ui.css 应存在 :root 令牌块');
  const durations = MOTION_DURATION_TOKENS.map((token) => {
    const match = new RegExp(`${token}:\\s*(\\d+)ms`).exec(rootBlock![1]);
    assert.ok(match, `:root 缺少动效时长令牌 ${token}`);
    return { token, ms: Number(match![1]) };
  });
  for (let index = 1; index < durations.length; index += 1) {
    assert.ok(
      durations[index]!.ms > durations[index - 1]!.ms,
      `动效时长档位必须单调递增：${durations[index - 1]!.token}=${durations[index - 1]!.ms}ms 不应 >= ${durations[index]!.token}=${durations[index]!.ms}ms`,
    );
  }
});

test('动效令牌：兼容别名指向统一档位，不再各自写死数值', () => {
  assert.match(GAME_UI_CSS, /--gp-motion:\s*var\(--gp-dur-fast\)/);
  assert.match(GAME_UI_CSS, /--game-motion-fast-duration:\s*var\(--gp-dur-fast\)/);
  assert.match(GAME_UI_CSS, /--game-motion-standard-duration:\s*var\(--gp-dur-standard\)/);
  assert.match(GAME_UI_CSS, /--game-motion-phase-duration:\s*var\(--gp-dur-phase\)/);
  assert.match(GAME_UI_CSS, /--home-motion-duration:\s*var\(--gp-dur-slow\)/);
  assert.match(GAME_UI_CSS, /--home-motion-distance:\s*var\(--gp-dist-lg\)/);
});

test('无障碍：系统动效偏好压制块位于 styles.css 末尾且特异性高于 minimal 档', () => {
  const gateIndex = STYLES_CSS.indexOf('html[data-motion-level] *,');
  const minimalIndex = STYLES_CSS.indexOf('html[data-motion-level="minimal"] *,');
  assert.ok(gateIndex > 0, 'styles.css 末尾应存在 html[data-motion-level] * 的 OS 动效偏好压制块');
  assert.ok(minimalIndex > 0, 'styles.css 应存在 minimal 档全局压制块');
  assert.ok(
    gateIndex > minimalIndex,
    'OS 动效偏好压制块必须位于 minimal 档压制块之后，否则会被 140ms 的规则覆盖',
  );
  assert.match(
    STYLES_CSS,
    /@media \(prefers-reduced-motion: reduce\) \{\s*html\[data-motion-level\] \*,[\s\S]*?animation-duration: 0\.01ms !important;/,
  );
});
