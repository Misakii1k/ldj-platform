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

test.describe('一智千金 T08 真实对局与私密性 E2E 验证', () => {
  test('人数校验、3人+观战真实开局、作答隐私、浏览器渲染与流程验证', async ({ page }) => {
    test.setTimeout(120_000);

    // 1. 人数下限拦截验证（2 人开局应被拒绝，最低 3 人）
    const seed2 = seedRoom(DB_PATH, { gameId: 'wits-wagers', count: 2, ready: true, config: WITS_CONFIG });
    const host2 = await RoomDriver.resume(WS_URL, seed2.roomCode, seed2.hostId, seed2.hostResumeToken);
    try {
      await host2.ready(true);
      const startDeny = await host2.startGame(WITS_CONFIG);
      expect(startDeny.type).toBe('error');
      expect(String(startDeny.payload.message)).toContain('在线玩家需为 3–7 人');
    } finally {
      host2.client.close();
    }

    // 2. 正常 3 玩家 + 1 观战者开局
    const seeded = seedRoom(DB_PATH, { gameId: 'wits-wagers', count: 3, ready: true, config: WITS_CONFIG });
    const hostNode = await RoomDriver.resume(WS_URL, seeded.roomCode, seeded.hostId, seeded.hostResumeToken);
    const p2 = await RoomDriver.resume(WS_URL, seeded.roomCode, seeded.players[1]!.playerId, seeded.players[1]!.resumeToken);
    const p3 = await RoomDriver.resume(WS_URL, seeded.roomCode, seeded.players[2]!.playerId, seeded.players[2]!.resumeToken);
    const spectator = await RoomDriver.join(WS_URL, seeded.roomCode, '围观群众', { asSpectator: true });

    let roundToken = '';

    try {
      await hostNode.ready(true);
      await p2.ready(true);
      await p3.ready(true);

      const startAck = await hostNode.startGame(WITS_CONFIG);
      expect(startAck.type).toBe('ack');

      // 3. 全员收到 game_state，进入 answering 阶段
      const hostFrame = await hostNode.waitGameState((v) => v.phase === 'answering');
      const p2Frame = await p2.waitGameState((v) => v.phase === 'answering');
      const specFrame = await spectator.waitGameState((v) => v.phase === 'answering');

      const hostView = hostFrame.payload.view as WitsWagersPlayerView;
      const _p2View = p2Frame.payload.view as WitsWagersPlayerView;
      const specView = specFrame.payload.view as Record<string, unknown>;

      expect(hostView.phase).toBe('answering');
      expect(hostView.round).toBe(1);
      expect(hostView.totalRounds).toBe(7);
      expect(hostView.me?.playerId).toBe(seeded.hostId);

      // 观战者严格无 me 属性
      expect(specView.me).toBeUndefined();

      // 题目存在但绝无答案与来源泄漏
      expect(hostView.question?.prompt).toBeTruthy();
      expect(hostView.question?.unit).toBeTruthy();
      expect((hostView.question as Record<string, unknown>).answer).toBeUndefined();
      expect((hostView.question as Record<string, unknown>).sourceUrl).toBeUndefined();

      roundToken = hostView.roundToken;

      // 4. 关闭 hostNode 连接，让浏览器接管 host 身份
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

      // 验证浏览器页面渲染出一智千金界面
      await expect(page.locator('.ww-game')).toBeVisible({ timeout: 15_000 });
      await expect(page.locator('.ww-question__prompt')).toBeVisible();

      // 5. 浏览器中由 host 填写 1000 并提交
      const input = page.locator('#ww-guess-input');
      await input.fill('1000');
      const submitBtn = page.locator('button[type="submit"]');
      await submitBtn.click();

      // 提交成功后提示显示
      await expect(page.locator('.ww-guess-panel__submitted-alert')).toBeVisible();
      await expect(page.locator('.ww-guess-panel__submitted-alert')).toContainText('1,000');

      // 6. 检查 p2 视角：只能看到 host 已提交，不能看到 1000 数值
      const p2MidFrame = await p2.waitGameState(
        (v) => (v.players as Array<{ playerId: string; hasSubmitted: boolean }>).some((p) => p.playerId === seeded.hostId && p.hasSubmitted),
      );
      const p2MidView = p2MidFrame.payload.view as WitsWagersPlayerView;
      expect(JSON.stringify(p2MidView).includes('1000')).toBe(false);

      // 7. p2 和 p3 提交作答，触发全员答齐提前翻牌
      await p2.gameAction({
        type: 'submit_guess',
        roundToken,
        expectedRevision: 0,
        value: 2000,
      });

      await p3.gameAction({
        type: 'submit_guess',
        roundToken,
        expectedRevision: 0,
        value: 3000,
      });

      // 8. 验证浏览器端自动接收到新状态并显示版图
      await expect(page.locator('.ww-board')).toBeVisible({ timeout: 15_000 });
      await expect(page.locator('.ww-target-card')).toHaveCount(4); // lower + 3 values
    } finally {
      p2.client.close();
      p3.client.close();
      spectator.client.close();
    }
  });
});
