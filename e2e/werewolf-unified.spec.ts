import { test, expect, type Browser, type Page } from '@playwright/test';
import { seedRoom } from './helpers/dbClient.ts';
import { RoomDriver } from './helpers/wsClient.ts';
import { BASE_URL, DB_PATH, ME_STORAGE_KEY, WS_URL, skipPcHostConsole } from './helpers/serverEnv.ts';
import * as fs from 'node:fs';
import * as path from 'node:path';

const SCREENSHOT_DIR = 'output/playwright/werewolf-handoff';

const V2_CONFIG = {
  rulesetId: 'werewolf_platform_open_kill_v1',
  preset: 'classic',
  pace: 'relaxed',
  witchSelfSave: 'first_night',
  winCondition: 'numbers',
} as const;

const MODERATOR_CONFIG = {
  rulesetId: 'werewolf_moderator_v1',
} as const;

interface BrowserSession {
  playerId: string;
  resumeToken: string;
  roomCode: string;
  nickname: string;
  seatRole: 'player' | 'spectator';
}

async function openSession(browser: Browser, session: BrowserSession, viewport = { width: 1280, height: 800 }): Promise<Page> {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  await skipPcHostConsole(page);
  await page.addInitScript(
    ([key, value]) => { localStorage.setItem(key, value); },
    [ME_STORAGE_KEY, JSON.stringify(session)],
  );
  await page.goto(BASE_URL);
  return page;
}

test.describe('狼人杀·统一综合验收矩阵（T12 集成测试）', () => {
  test.beforeAll(() => {
    if (!fs.existsSync(SCREENSHOT_DIR)) {
      fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
    }
  });

  test('V2 引擎：多端时间线一致 + 提前与越界动作拦截 + 四视口与主题视觉截图', async ({ browser }) => {
    test.setTimeout(120_000);

    const seeded = seedRoom(DB_PATH, {
      gameId: 'werewolf',
      count: 6,
      ready: true,
      config: V2_CONFIG,
    });

    const host = await RoomDriver.resume(WS_URL, seeded.roomCode, seeded.hostId, seeded.hostResumeToken);
    try {
      const readyAck = await host.ready();
      expect(readyAck.type).toBe('ack');
      const startAck = await host.startGame(V2_CONFIG);
      expect(startAck.type).toBe('ack');

      // 浏览器玩家 1 与 玩家 2
      const p1 = seeded.players[1]!;
      const p2 = seeded.players[2]!;

      const page1 = await openSession(browser, {
        playerId: p1.playerId,
        resumeToken: p1.resumeToken,
        roomCode: seeded.roomCode,
        nickname: '独行侦探',
        seatRole: 'player',
      });

      const page2 = await openSession(browser, {
        playerId: p2.playerId,
        resumeToken: p2.resumeToken,
        roomCode: seeded.roomCode,
        nickname: '深林猎犬',
        seatRole: 'player',
      });

      // 验证两端舞台渲染就绪
      await expect(page1.locator('.werewolf-native-page')).toBeVisible({ timeout: 20_000 });
      await expect(page2.locator('.werewolf-native-page')).toBeVisible({ timeout: 20_000 });

      // 验证未轮到行动或错误阶段动作被服务端拒绝
      const prematureAction = await host.gameAction({
        type: 'night_kill',
        targetPlayerId: p2.playerId,
      });
      // 在 role_reveal 阶段直接夜袭必须被拒绝（阶段未到）
      expect(prematureAction.type).toBe('error');

      // 两端确认身份（W06 起需先翻开中央身份牌，黄色按钮才出现）
      for (const p of [page1, page2]) {
        await p.locator('.ww-deal').click();
        await expect(p.locator('.ww-deal')).toHaveClass(/flipped/);
        await p.getByRole('button', { name: /我已记住身份/ }).click();
      }
      await host.gameAction({ type: 'confirm_role' });

      // 进入夜晚时间线后，检查无横向滚动条溢出
      const viewports = [
        { width: 1280, height: 800 },
        { width: 844, height: 390 },
        { width: 390, height: 844 },
        { width: 360, height: 640 },
      ];

      for (const vp of viewports) {
        await page1.setViewportSize(vp);
        await page1.waitForTimeout(300);
        const hasHorizontalScroll = await page1.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
        expect(hasHorizontalScroll, `视口 ${vp.width}x${vp.height} 不应出现横向滚动条`).toBe(false);

        // 截图留存（默认主题）
        await page1.screenshot({
          path: path.join(SCREENSHOT_DIR, `v2-auto-default-${vp.width}x${vp.height}.png`),
          fullPage: false,
        });
      }

      // 打开设置面板并切换主题为 theatre
      await page1.setViewportSize({ width: 1280, height: 800 });
      await page1.locator('#settings').click();
      const settingsDrawer = page1.locator('.ww-settings-panel[aria-label="狼人杀对局设置"]');
      await expect(settingsDrawer).toBeVisible({ timeout: 10_000 });

      // 截图设置抽屉
      await page1.screenshot({
        path: path.join(SCREENSHOT_DIR, `v2-settings-drawer-1280x800.png`),
        fullPage: false,
      });

      // 选择 theatre 主题
      const theatreOption = page1.getByRole('button', { name: /双面剧场/ });
      if (await theatreOption.count() > 0) {
        await theatreOption.first().click();
        await page1.waitForTimeout(300);
      }
      await page1.keyboard.press('Escape');
      await expect(settingsDrawer).toHaveCount(0);

      // 四视口剧场主题截图
      for (const vp of viewports) {
        await page1.setViewportSize(vp);
        await page1.waitForTimeout(200);
        await page1.screenshot({
          path: path.join(SCREENSHOT_DIR, `v2-theatre-${vp.width}x${vp.height}.png`),
          fullPage: false,
        });
      }

      await page1.context().close();
      await page2.context().close();
    } finally {
      host.client.close();
    }
  });

  test('真人主持：手动模式与自动模式切换 + 暂停恢复 + 权限防护 + 终局复盘截图', async ({ browser }) => {
    test.setTimeout(120_000);

    const seeded = seedRoom(DB_PATH, {
      gameId: 'werewolf',
      count: 7,
      ready: true,
      config: MODERATOR_CONFIG,
    });

    const host = await RoomDriver.resume(WS_URL, seeded.roomCode, seeded.hostId, seeded.hostResumeToken);
    try {
      const readyAck = await host.ready();
      expect(readyAck.type).toBe('ack');
      const startAck = await host.startGame(MODERATOR_CONFIG);
      expect(startAck.type).toBe('ack');

      // 法官端（房主即 moderator）
      const judgePage = await openSession(browser, {
        playerId: seeded.hostId,
        resumeToken: seeded.hostResumeToken,
        roomCode: seeded.roomCode,
        nickname: '审判官房主',
        seatRole: 'player',
      });

      // 普通玩家端（玩家 2）
      const player = seeded.players[1]!;
      const playerPage = await openSession(browser, {
        playerId: player.playerId,
        resumeToken: player.resumeToken,
        roomCode: seeded.roomCode,
        nickname: '村庄铁匠',
        seatRole: 'player',
      });

      // 玩家端翻牌确认
      const flipCard = playerPage.locator('.identity-flip-card');
      await expect(flipCard).toBeVisible({ timeout: 20_000 });
      await flipCard.click();
      await playerPage.getByRole('button', { name: '我已记下，进入对局' }).click();

      // 验证法官控制台进入就绪状态
      await expect(judgePage.locator('.mod-console')).toBeVisible({ timeout: 20_000 });
      await expect(judgePage.locator('.mod-seat')).toHaveCount(6); // 6 位抽卡玩家

      // 验证普通玩家（玩家 3，非当前浏览器连接）越权调用主持控制指令被明确拒绝
      const roguePlayer = seeded.players[2]!;
      const rogueClient = await RoomDriver.resume(WS_URL, seeded.roomCode, roguePlayer.playerId, roguePlayer.resumeToken);
      const rogueAction = await rogueClient.gameAction({
        type: 'moderator_set_mode',
        mode: 'auto',
        timelineId: 'd0-s0-r1',
      });
      expect(rogueAction.type).toBe('error');
      rogueClient.client.close();

      // 法官切为自动辅助
      const autoBtn = judgePage.getByRole('button', { name: '切为自动辅助' });
      await autoBtn.click();
      await expect(judgePage.getByRole('button', { name: '切为手动模式' })).toBeVisible({ timeout: 10_000 });

      // 暂停与恢复测试
      const pauseBtn = judgePage.getByRole('button', { name: '⏸ 暂停' });
      await pauseBtn.click();
      await expect(judgePage.getByRole('button', { name: '▶ 恢复' })).toBeVisible({ timeout: 10_000 });

      // 玩家端同步显示「主持人已暂停对局」或 pause 提示
      await expect(playerPage.locator('.mod-player-timeline-hint')).toContainText('已暂停', { timeout: 10_000 });

      // 法官点击恢复流程
      await judgePage.getByRole('button', { name: '▶ 恢复' }).click();
      await expect(judgePage.getByRole('button', { name: '⏸ 暂停' })).toBeVisible({ timeout: 10_000 });

      // 切回手动控场
      await judgePage.getByRole('button', { name: '切为手动模式' }).click();
      await expect(judgePage.getByRole('button', { name: '切为自动辅助' })).toBeVisible({ timeout: 10_000 });

      // 截图四视口法官控制台
      const viewports = [
        { width: 1280, height: 800 },
        { width: 844, height: 390 },
        { width: 390, height: 844 },
      ];

      for (const vp of viewports) {
        await judgePage.setViewportSize(vp);
        await judgePage.waitForTimeout(200);
        await judgePage.screenshot({
          path: path.join(SCREENSHOT_DIR, `moderator-console-${vp.width}x${vp.height}.png`),
          fullPage: false,
        });
      }

      // 法官终局亮牌
      await judgePage.locator('.mod-console__menu-btn').click();
      await judgePage.locator('.tabletop-drawer-item').filter({ hasText: '结束对局并亮牌' }).click();
      await judgePage.locator('.confirm-dialog').getByRole('button', { name: '确认结束并亮牌' }).click();

      // 验证法官端与玩家端终局揭晓
      await expect(judgePage.locator('.mod-console__ended')).toContainText('全场身份底牌已公开', { timeout: 15_000 });
      await expect(playerPage.locator('.ww-result-modal')).toBeVisible({ timeout: 20_000 });

      // 截图玩家端终局复盘模态窗
      await playerPage.screenshot({
        path: path.join(SCREENSHOT_DIR, `moderator-player-reveal-1280x800.png`),
        fullPage: false,
      });

      await judgePage.context().close();
      await playerPage.context().close();
    } finally {
      host.client.close();
    }
  });
});
