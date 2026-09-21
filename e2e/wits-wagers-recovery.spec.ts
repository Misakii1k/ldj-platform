import { test, expect } from '@playwright/test';
import { seedRoom } from './helpers/dbClient.ts';
import { RoomDriver } from './helpers/wsClient.ts';
import { BASE_URL, DB_PATH, WS_URL, seedBrowserSession } from './helpers/serverEnv.ts';
import type { WitsWagersPlayerView } from '../packages/client/src/game/wits-wagers/types.ts';

const WITS_CONFIG = {
  rulesetId: 'wits_wagers_platform_v1',
  answerSeconds: 30,
  betSeconds: 30,
  // 钉住最短的展示时长，避免演出节奏拉长 E2E 等待
  arrangingSeconds: 3,
  settlementSeconds: 8,
};

test.describe('一智千金 T09 恢复与刷新 E2E 验证', () => {
  test('浏览器页面刷新 (reload) 保持对局身份与已提交作答，断线重连恢复', async ({ page }) => {
    test.setTimeout(120_000);

    // 1. 初始化 3 人房间
    const seeded = seedRoom(DB_PATH, { gameId: 'wits-wagers', count: 3, ready: true, config: WITS_CONFIG });
    const hostNode = await RoomDriver.resume(WS_URL, seeded.roomCode, seeded.hostId, seeded.hostResumeToken);
    let p2Node = await RoomDriver.resume(WS_URL, seeded.roomCode, seeded.players[1]!.playerId, seeded.players[1]!.resumeToken);
    const p3Node = await RoomDriver.resume(WS_URL, seeded.roomCode, seeded.players[2]!.playerId, seeded.players[2]!.resumeToken);

    try {
      await hostNode.ready(true);
      await p2Node.ready(true);
      await p3Node.ready(true);

      const startAck = await hostNode.startGame(WITS_CONFIG);
      expect(startAck.type).toBe('ack');

      const hostFrame = await hostNode.waitGameState((v) => v.phase === 'answering');
      const hostView = hostFrame.payload.view as WitsWagersPlayerView;
      const roundToken = hostView.roundToken;

      // 关闭 hostNode，由真实浏览器接管 host
      hostNode.client.close();

      await seedBrowserSession(page, {
        roomId: seeded.roomId,
        roomCode: seeded.roomCode,
        playerId: seeded.hostId,
        resumeToken: seeded.hostResumeToken,
        nickname: '房主',
      });
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.goto(BASE_URL);

      await expect(page.locator('.ww-game')).toBeVisible({ timeout: 15_000 });
      const input = page.locator('#ww-guess-input');
      await input.fill('6300');
      const submitBtn = page.locator('button[type="submit"]');
      await submitBtn.click();

      await expect(page.locator('.ww-guess-panel__submitted-alert')).toBeVisible();
      await expect(page.locator('.ww-guess-panel__submitted-alert')).toContainText('6,300');

      // 2. 刷新页面（page.reload），验证 localStorage 会话自动 resume 并恢复已提交的作答
      await page.reload();

      await expect(page.locator('.ww-game')).toBeVisible({ timeout: 15_000 });
      await expect(page.locator('.ww-guess-panel__submitted-alert')).toBeVisible();
      await expect(page.locator('.ww-guess-panel__submitted-alert')).toContainText('6,300');

      // 3. 模拟 p2 掉线并重新连接恢复
      p2Node.client.close();
      await new Promise((r) => setTimeout(r, 200));

      // p2 重新建立 WebSocket 连接并 resume_room
      p2Node = await RoomDriver.resume(WS_URL, seeded.roomCode, seeded.players[1]!.playerId, seeded.players[1]!.resumeToken);
      const p2ResumedFrame = await p2Node.waitGameState((v) => v.phase === 'answering');
      const p2ResumedView = p2ResumedFrame.payload.view as WitsWagersPlayerView;
      expect(p2ResumedView.phase).toBe('answering');
      expect(p2ResumedView.round).toBe(1);

      // p2 提交作答
      await p2Node.gameAction({
        type: 'submit_guess',
        roundToken,
        expectedRevision: 0,
        value: 5000,
      });

      // p3 提交作答，全员答齐
      await p3Node.gameAction({
        type: 'submit_guess',
        roundToken,
        expectedRevision: 0,
        value: 4000,
      });

      // 浏览器端自动进入 arranging 阶段展示版图
      await expect(page.locator('.ww-board')).toBeVisible({ timeout: 15_000 });
      await expect(page.locator('.ww-target-card')).toHaveCount(5);
    } finally {
      p2Node.client.close();
      p3Node.client.close();
    }
  });
});
