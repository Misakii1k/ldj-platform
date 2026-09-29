/**
 * 回归：AI 引擎设置首屏必须直接可见「思考深度（推理强度）」。
 *
 * 背景（2026-09-27）：该控件曾被放在默认折叠的「高级连接与推理设置」里
 * （AiEngineSettings.tsx 的 `advancedOpen && (...)` 分支，advancedOpen 初始 false），
 * 导致用户反馈「找不到推理强度、不能选择」。服务端 reasoning_effort 链路一直是好的。
 *
 * 因此本用例断言的是**可发现性**，不是渲染正确性：
 *   - 打开设置弹层后，不做任何展开操作，`#settings-thinking-depth` 就必须可见；
 *   - 五档选项齐全（off/low/medium/high/max）；
 *   - 展开高级区后，思考深度**不重复出现**（避免回归成两个 id 相同的控件）。
 */
import { test, expect } from '@playwright/test';
import { BASE_URL, skipPcHostConsole } from './helpers/serverEnv.ts';

/** 与服务端 `THINKING_DEPTH_OPTIONS`（packages/shared/src/domain/settings.ts）保持一致的档位 */
const EXPECTED_DEPTH_VALUES = ['off', 'low', 'medium', 'high', 'max'] as const;

test.describe('设置面板 · 思考深度（推理强度）可发现性', () => {
  test('首屏无需展开高级区即可看到并选择思考深度，且五档齐全', async ({ page }) => {
    await skipPcHostConsole(page);
    await page.goto(BASE_URL);

    // 打开设置弹层（首页头部「打开设置」）
    await page.getByRole('button', { name: '打开设置' }).click();
    await expect(page.locator('.settings-panel-content')).toBeVisible({ timeout: 20_000 });

    // 默认落在 AI 引擎分类
    const depth = page.locator('#settings-thinking-depth');
    await expect(depth).toBeVisible({ timeout: 20_000 });

    // 高级区此时应处于折叠状态（未展开），思考深度仍然可见 —— 这就是本次修复的核心
    await expect(page.locator('.ai-advanced-content')).toHaveCount(0);

    // 五档齐全且顺序与共享契约一致
    const values = await depth.locator('option').evaluateAll((nodes) =>
      nodes.map((node) => (node as HTMLOptionElement).value),
    );
    expect(values).toEqual([...EXPECTED_DEPTH_VALUES]);

    // 真的能选：选中 max 后控件值随之变化
    await depth.selectOption('max');
    await expect(depth).toHaveValue('max');

    // 展开高级区后，思考深度不得重复渲染成第二个同 id 控件
    await page.getByRole('button', { name: /高级连接与推理设置/ }).click();
    await expect(page.locator('.ai-advanced-content')).toBeVisible();
    await expect(page.locator('#settings-thinking-depth')).toHaveCount(1);

    // 展开/收起不影响已选值
    await expect(depth).toHaveValue('max');
  });
});
