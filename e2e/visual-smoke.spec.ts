/**
 * 批 3 试验：引入 1 个关键帧 toHaveScreenshot 视觉快照，验证 CI 自动化视觉断言可行性。
 */
import { test, expect } from '@playwright/test';
import { BASE_URL, skipPcHostConsole } from './helpers/serverEnv.ts';

test.describe('批 3 视觉快照试验（Visual Snapshot Smoke）', () => {
  test('首页游戏目录关键帧视觉快照', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await skipPcHostConsole(page);
    await page.goto(BASE_URL);
    await expect(page.locator('.game-home-page')).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(600);

    const catalog = page.locator('#game-catalog');
    await expect(catalog).toBeVisible();
    await expect(catalog).toHaveScreenshot('game-catalog-desktop.png', {
      maxDiffPixelRatio: 0.08,
      animations: 'disabled',
    });
  });
});
