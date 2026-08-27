/**
 * Durian 印度扑克式翻牌质疑机制 + 纯模拟模式桌面/玩家端设备切换 + 无溢出视口 + 聊天端到端测试与截图。
 */
import { test, expect, type Browser, type Page } from '@playwright/test';
import * as path from 'node:path';
import { seedRoom } from './helpers/dbClient.ts';
import { RoomDriver } from './helpers/wsClient.ts';
import { BASE_URL, DB_PATH, ME_STORAGE_KEY, WS_URL } from './helpers/serverEnv.ts';

const ARTIFACT_DIR = path.resolve('C:/Users/87850/.gemini/antigravity/brain/884af4c7-8e29-45cf-91a8-ec7b2fa16acd');

interface Me {
  playerId: string;
  resumeToken: string;
  roomCode: string;
  nickname: string;
}

async function openBrowser(browser: Browser, me: Me, viewport = { width: 1280, height: 800 }): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.addInitScript(
    ([key, value]) => { localStorage.setItem(key, value); },
    [ME_STORAGE_KEY, JSON.stringify({ ...me, seatRole: 'player' })],
  );
  await page.setViewportSize(viewport);
  await page.goto(BASE_URL);
  await page.locator('.tabletop-shell').waitFor({ timeout: 30_000 });
  return page;
}

test.describe('Durian 界面视觉、无溢出视口、设备端切换与聊天 E2E 验收', () => {
  test('标准模式：完整桌面渲染、高对比度文字、无纵向滚动条、聊天抽屉打开与关闭', async ({ browser }) => {
    test.setTimeout(60_000);
    const seeded = seedRoom(DB_PATH, {
      gameId: 'durian',
      count: 3,
      ready: true,
      config: { rulesetId: 'durian_orchard_v1', mode: 'standard' },
    });
    const host = await RoomDriver.resume(WS_URL, seeded.roomCode, seeded.hostId, seeded.hostResumeToken);
    try {
      const startAck = await host.startGame({ rulesetId: 'durian_orchard_v1', mode: 'standard' });
      expect(startAck.type).toBe('ack');

      const browserPlayer = seeded.players[1]!;
      const page = await openBrowser(browser, {
        playerId: browserPlayer.playerId,
        resumeToken: browserPlayer.resumeToken,
        roomCode: seeded.roomCode,
        nickname: '玩家2',
      }, { width: 1280, height: 800 });

      // 1. 验证关键元素渲染且文字清晰，不向玩家暴露自动统计结果
      await expect(page.locator('.durian-forehead-bar')).toBeVisible();
      await expect(page.locator('.durian-center-board')).toBeVisible();
      await expect(page.locator('.durian-board-title')).toContainText('桌面已放置卡牌');

      // 2. 验证视口无纵向溢出（无全屏垂直滚动条）
      const overflowInfo = await page.evaluate(() => {
        const doc = document.documentElement;
        return {
          scrollHeight: doc.scrollHeight,
          clientHeight: doc.clientHeight,
        };
      });
      expect(overflowInfo.scrollHeight).toBeLessThanOrEqual(overflowInfo.clientHeight + 4);

      // 截图存档
      const screenshotPath = path.join(ARTIFACT_DIR, 'durian_standard_mode.png');
      await page.screenshot({ path: screenshotPath, fullPage: false });

      // 3. 验证聊天按钮在标准模式下可见，点击后成功打开聊天抽屉
      const chatTrigger = page.locator('.game-chat-trigger');
      await expect(chatTrigger).toBeVisible();
      await chatTrigger.click();

      const chatDrawer = page.locator('.game-chat-drawer');
      await expect(chatDrawer).toBeVisible();
      await expect(page.locator('#game-chat-title')).toHaveText('对局聊天');

      // 关闭聊天抽屉
      await page.locator('.game-chat-close').click();
      await expect(chatDrawer).not.toBeVisible();

      await page.context().close();
    } finally {
      host.client.close();
    }
  });

  test('纯模拟模式：桌面端与玩家端设备用途切换、隐藏聊天按钮、大按铃展示', async ({ browser }) => {
    test.setTimeout(60_000);
    const seeded = seedRoom(DB_PATH, {
      gameId: 'durian',
      count: 3,
      ready: true,
      config: { rulesetId: 'durian_orchard_v1', mode: 'simulator' },
    });
    const host = await RoomDriver.resume(WS_URL, seeded.roomCode, seeded.hostId, seeded.hostResumeToken);
    try {
      const startAck = await host.startGame({ rulesetId: 'durian_orchard_v1', mode: 'simulator' });
      expect(startAck.type).toBe('ack');

      const browserPlayer = seeded.players[1]!;
      const page = await openBrowser(browser, {
        playerId: browserPlayer.playerId,
        resumeToken: browserPlayer.resumeToken,
        roomCode: seeded.roomCode,
        nickname: '玩家2',
      }, { width: 1280, height: 800 });

      // 1. 验证纯模拟模式下不展示聊天按钮
      await expect(page.locator('.game-chat-trigger')).not.toBeVisible();

      // 2. 验证设备角色切换胶囊可见
      const roleSwitch = page.locator('.durian-role-switch');
      await expect(roleSwitch).toBeVisible();

      // 默认处于玩家端
      await expect(page.getByRole('button', { name: '📱 玩家端' })).toHaveClass(/is-active/);

      // 切换到桌面端
      await page.getByRole('button', { name: '🖥️ 桌面端' }).click();
      await expect(page.getByRole('button', { name: '🖥️ 桌面端' })).toHaveClass(/is-active/);

      // 桌面端应展示中央质疑按铃与生效看板、对号错号中央板
      await expect(page.locator('.durian-sim-bell-btn-compact')).toBeVisible();
      await expect(page.locator('.durian-table-center-board')).toBeVisible();
      await expect(page.locator('.durian-table-counter--left')).toBeVisible();
      await expect(page.locator('.durian-table-counter--right')).toBeVisible();

      // 桌面端截图存档
      const tableScreenshotPath = path.join(ARTIFACT_DIR, 'durian_simulator_table_mode.png');
      await page.screenshot({ path: tableScreenshotPath, fullPage: false });

      // 切换回玩家端
      await page.getByRole('button', { name: '📱 玩家端' }).click();
      await expect(page.locator('.durian-sim-bell-btn-compact')).not.toBeVisible();
      await expect(page.locator('.durian-player-card-container')).toBeVisible();

      // 玩家端截图存档
      const playerScreenshotPath = path.join(ARTIFACT_DIR, 'durian_simulator_player_mode.png');
      await page.screenshot({ path: playerScreenshotPath, fullPage: false });

      // 验证无滚动条溢出
      const overflowInfo = await page.evaluate(() => {
        const doc = document.documentElement;
        return {
          scrollHeight: doc.scrollHeight,
          clientHeight: doc.clientHeight,
        };
      });
      expect(overflowInfo.scrollHeight).toBeLessThanOrEqual(overflowInfo.clientHeight + 4);

      await page.context().close();
    } finally {
      host.client.close();
    }
  });

  test('质疑结算阶段：展示自己的暗牌卡牌，并进行 3 秒倒计时自动进入下一轮', async ({ browser }) => {
    test.setTimeout(60_000);
    const seeded = seedRoom(DB_PATH, {
      gameId: 'durian',
      count: 2,
      ready: true,
      config: { rulesetId: 'durian_orchard_v1', mode: 'standard' },
    });
    const host = await RoomDriver.resume(WS_URL, seeded.roomCode, seeded.hostId, seeded.hostResumeToken);
    try {
      const startAck = await host.startGame({ rulesetId: 'durian_orchard_v1', mode: 'standard' });
      expect(startAck.type).toBe('ack');

      const browserPlayer = seeded.players[1]!;
      const page = await openBrowser(browser, {
        playerId: browserPlayer.playerId,
        resumeToken: browserPlayer.resumeToken,
        roomCode: seeded.roomCode,
        nickname: '玩家2',
      }, { width: 1280, height: 800 });

      // 回合开始：房主摸牌并放置
      await host.gameAction({ type: 'draw_card', playerId: seeded.hostId });
      await host.gameAction({ type: 'place_fruit', playerId: seeded.hostId, checkHalf: 'left' });

      // 轮到玩家2：此时自己头顶牌仍是暗牌
      await expect(page.getByText('我的头顶暗牌（他人可见）')).toBeVisible();

      // 玩家2发起质疑
      await page.getByRole('button', { name: /质疑上家/ }).click();

      // 质疑结算阶段：验证自己的卡牌已被揭示，不再显示「我的头顶暗牌」
      await expect(page.getByText('暗牌已揭示')).toBeVisible();
      await expect(page.getByText('我的头顶暗牌（他人可见）')).not.toBeVisible();
      await expect(page.locator('.durian-verdict-overlay')).toBeVisible();

      // 截图结算与卡牌揭示
      const revealScreenshotPath = path.join(ARTIFACT_DIR, 'durian_challenge_reveal_own_card.png');
      await page.screenshot({ path: revealScreenshotPath, fullPage: false });

      // 验证 3 秒倒计时自动进入第 2 轮
      await expect(page.getByText('第 2/7 轮')).toBeVisible({ timeout: 10_000 });

      await page.context().close();
    } finally {
      host.client.close();
    }
  });
});
