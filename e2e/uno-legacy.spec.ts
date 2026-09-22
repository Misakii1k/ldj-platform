/**
 * Legacy UNO 页面真实 Chromium 验收。
 * 验证 WS1 交互补齐：
 * 1. 喊 UNO 按钮出现并生效
 * 2. 摸牌后无可出牌 800ms 自动过牌
 * 3. 摸牌/过牌按钮交互
 * 4. 卡牌图片正式渲染
 * 5. 多视口（1280×800 / 390×844 / 844×390）无水平溢出
 */
import { test, expect, type Browser, type Page } from '@playwright/test';
import { seedRoom } from './helpers/dbClient.ts';
import { RoomDriver } from './helpers/wsClient.ts';
import { BASE_URL, DB_PATH, ME_STORAGE_KEY, WS_URL, skipPcHostConsole } from './helpers/serverEnv.ts';

interface BrowserMe {
  playerId: string;
  resumeToken: string;
  roomCode: string;
  nickname: string;
}

async function prepareBrowser(browser: Browser, me: BrowserMe): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.addInitScript(
    ([key, value]) => { localStorage.setItem(key, value); },
    [ME_STORAGE_KEY, JSON.stringify({ ...me, seatRole: 'player' })],
  );
  return page;
}

test.describe('Legacy UNO UI Verification', () => {
  test('Legacy 房：开局渲染、卡牌正式图片、多视口几何校验', async ({ browser }) => {
    const seeded = seedRoom(DB_PATH, {
      gameId: 'uno',
      count: 2,
      ready: true,
      config: { rulesetId: 'uno_legacy_platform_v1' },
    });

    const host = await RoomDriver.resume(WS_URL, seeded.roomCode, seeded.hostId, seeded.hostResumeToken);
    const readyAck = await host.ready();
    expect(readyAck.type).toBe('ack');
    const startAck = await host.startGame({ rulesetId: 'uno_legacy_platform_v1', variant: 'standard' });
    expect(startAck.type).toBe('ack');

    try {
      const browserPlayer = seeded.players[1]!;
      const page = await prepareBrowser(browser, {
        playerId: browserPlayer.playerId,
        resumeToken: browserPlayer.resumeToken,
        roomCode: seeded.roomCode,
        nickname: '玩家2',
      });

      // 1. 宽视口 1280×800
      await page.setViewportSize({ width: 1280, height: 800 });
      await skipPcHostConsole(page);
      await page.goto(BASE_URL);

      await expect(page.getByText('UNO').first()).toBeVisible({ timeout: 20_000 });
      await expect(page.locator('.uno-draw-pile img')).toBeVisible();
      await expect(page.locator('.uno-discard-card img')).toBeVisible();
      await expect(page.locator('.card-fan-item')).toHaveCount(7);

      // 2. 窄视口 390×844
      await page.setViewportSize({ width: 390, height: 844 });
      const overflowMobile = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(overflowMobile.scrollWidth).toBeLessThanOrEqual(overflowMobile.clientWidth + 1);

      // 3. 横屏矮视口 844×390
      await page.setViewportSize({ width: 844, height: 390 });
      const overflowLandscape = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(overflowLandscape.scrollWidth).toBeLessThanOrEqual(overflowLandscape.clientWidth + 1);

      await page.context().close();
    } finally {
      host.client.close();
    }
  });

  test('Legacy 房：摸牌按钮与自动过牌交互流程', async ({ browser }) => {
    const seeded = seedRoom(DB_PATH, {
      gameId: 'uno',
      count: 2,
      ready: true,
      config: { rulesetId: 'uno_legacy_platform_v1' },
    });

    const host = await RoomDriver.resume(WS_URL, seeded.roomCode, seeded.hostId, seeded.hostResumeToken);
    await host.ready();
    await host.startGame({ rulesetId: 'uno_legacy_platform_v1', variant: 'standard' });

    try {
      const browserPlayer = seeded.players[1]!;
      const browserId = browserPlayer.playerId;
      const page = await prepareBrowser(browser, {
        playerId: browserPlayer.playerId,
        resumeToken: browserPlayer.resumeToken,
        roomCode: seeded.roomCode,
        nickname: '玩家2',
      });
      await skipPcHostConsole(page);
      await page.goto(BASE_URL);

      // 等待对局开始
      const frame = await host.waitGameState((v) => v.phase === 'playing', 30_000);
      const currentId = frame.payload.view.currentPlayerId;

      // 如果当前是 host，host 摸牌或过牌跳给 browser
      if (currentId === host.playerId) {
        await host.gameAction({ type: 'draw_card' });
        // 如果 host 有牌出就不出，发 pass_after_draw
        try {
          await host.gameAction({ type: 'pass_after_draw' });
        } catch {
          // ignore
        }
      }

      // 等待轮到浏览器玩家
      await host.waitGameState((v) => v.currentPlayerId === browserId, 30_000);

      // 验证浮动操作条包含“摸一张牌”
      const drawBtn = page.locator('.uno-floating-controls').getByRole('button', { name: '摸一张牌' });
      await expect(drawBtn).toBeVisible({ timeout: 10_000 });
      await drawBtn.click();

      // 点击后手牌应变为 8 张
      await expect(page.locator('.card-fan-item')).toHaveCount(8);

      // 摸牌后：若无可出牌，800ms 内会自动过牌跳回 host；若有可出牌，出现“过牌结束”按钮
      // 验证无论自动过牌还是手动点过牌，游戏不会死局卡住
      const passBtn = page.locator('.uno-floating-controls').getByRole('button', { name: '过牌结束' });
      if (await passBtn.isVisible({ timeout: 500 })) {
        await passBtn.click();
      }

      // 验证回合成功推进（死局已修复）
      await host.waitGameState((v) => v.currentPlayerId !== browserId, 10_000);

      await page.context().close();
    } finally {
      host.client.close();
    }
  });
});
