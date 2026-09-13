/**
 * 狼人杀「真人主持」模式前端验收（真实 Chromium + 真实 WS 引擎）。
 *
 * 覆盖本次前端重构的验收点：
 * 1. 座位号唯一权威：大厅/玩家端/法官控制台显示同一个房间席位号（房主占 1 号位时，
 *    抽卡玩家必须是 2..7 号，而不是服务端剔除主持人后重编的 1..6 号）。
 * 2. 抽卡仪式只在本局首次播放：洗牌演出自动结束 → 卡牌默认遮挡 → 点击翻开 → 确认；
 *    刷新页面不重播演出、不自动亮牌。
 * 3. 一键出局 + 二次确认：法官席位行一个状态准确的按钮 + 共享确认框，
 *    出局/撤销同步到玩家手机。
 * 4. 终局亮牌：法官结束对局后，玩家端通过共享终局复盘公开全部身份。
 * 5. 观战者不再是死路卡背。
 */
import { test, expect, type Browser, type Page } from '@playwright/test';
import { seedRoom } from './helpers/dbClient.ts';
import { RoomDriver } from './helpers/wsClient.ts';
import { BASE_URL, DB_PATH, ME_STORAGE_KEY, WS_URL } from './helpers/serverEnv.ts';

const MODERATOR_CONFIG = { rulesetId: 'werewolf_moderator_v1' } as const;
const PLAYER_COUNT = 7; // 1 名法官 + 6 名抽卡玩家

interface BrowserSession {
  playerId: string;
  resumeToken: string;
  roomCode: string;
  nickname: string;
  seatRole: 'player' | 'spectator';
}

async function openSession(browser: Browser, session: BrowserSession): Promise<Page> {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  await page.addInitScript(
    ([key, value]) => { localStorage.setItem(key, value); },
    [ME_STORAGE_KEY, JSON.stringify(session)],
  );
  await page.goto(BASE_URL);
  return page;
}

async function startModeratorGame() {
  const seeded = seedRoom(DB_PATH, {
    gameId: 'werewolf',
    count: PLAYER_COUNT,
    ready: true,
    config: MODERATOR_CONFIG,
  });
  const host = await RoomDriver.resume(WS_URL, seeded.roomCode, seeded.hostId, seeded.hostResumeToken);
  const readyAck = await host.ready();
  expect(readyAck.type).toBe('ack');
  const startAck = await host.startGame(MODERATOR_CONFIG);
  expect(
    startAck.type,
    `start_game 应 ack：${String(startAck.payload.code ?? '')} ${String(startAck.payload.message ?? '')}`,
  ).toBe('ack');
  await host.waitGameState((view) => view.isModerator === true, 15_000);
  return { seeded, host };
}

test.describe('狼人杀·真人主持（法官控制台 / 玩家端）', () => {
  test('座位号一致 + 抽卡仪式不重播 + 一键出局二次确认 + 终局亮牌', async ({ browser }) => {
    test.setTimeout(120_000);
    const { seeded, host } = await startModeratorGame();

    try {
      const cardPlayer = seeded.players[1]!;
      const playerPage = await openSession(browser, {
        playerId: cardPlayer.playerId,
        resumeToken: cardPlayer.resumeToken,
        roomCode: seeded.roomCode,
        nickname: '玩家2',
        seatRole: 'player',
      });

      // —— 抽卡仪式：洗牌演出自动结束，卡牌默认遮挡 ——
      const dealCeremony = playerPage.locator('.mod-deal-ceremony');
      await expect(dealCeremony).toBeVisible({ timeout: 20_000 });
      const card = playerPage.locator('.identity-flip-card');
      await expect(card).toBeVisible({ timeout: 20_000 });
      await expect(dealCeremony).toHaveCount(0, { timeout: 10_000 });
      await expect(card).not.toHaveClass(/is-revealed/);

      await card.click();
      await expect(card).toHaveClass(/is-revealed/);
      await playerPage.getByRole('button', { name: '我已记下，进入对局' }).click();
      await expect(playerPage.getByRole('button', { name: '我已记下，进入对局' })).toHaveCount(0);

      // —— 座位号 = 房间席位（房主占 1 号位 → 抽卡玩家为 2..7 号）——
      const playerSeatLabels = (await playerPage.locator('.seat-chip__seat').allInnerTexts())
        .map((text) => text.trim())
        .sort();
      expect(playerSeatLabels).toEqual(['2 号', '3 号', '4 号', '5 号', '6 号', '7 号']);

      // —— 法官控制台 ——
      const judgePage = await openSession(browser, {
        playerId: seeded.hostId,
        resumeToken: seeded.hostResumeToken,
        roomCode: seeded.roomCode,
        nickname: '房主',
        seatRole: 'player',
      });
      const consoleRoot = judgePage.locator('.mod-console');
      await expect(consoleRoot).toBeVisible({ timeout: 20_000 });
      await expect(consoleRoot).toContainText('席位 1 号');

      const consoleSeatLabels = (await judgePage.locator('.mod-seat__number').allInnerTexts())
        .map((text) => text.trim());
      expect(consoleSeatLabels).toEqual(['2 号', '3 号', '4 号', '5 号', '6 号', '7 号']);
      // 法官视角必须看到真实身份
      await expect(judgePage.locator('.mod-seat__role').first()).not.toHaveText('身份未知');

      // —— 一键出局 + 二次确认 ——
      const targetRow = judgePage.locator(`.mod-seat[data-player-id="${cardPlayer.playerId}"]`);
      await expect(targetRow).toContainText('2 号');
      await targetRow.getByRole('button', { name: '标记出局' }).click();

      const eliminateDialog = judgePage.locator('.confirm-dialog');
      await expect(eliminateDialog).toBeVisible();
      await expect(eliminateDialog).toContainText('标记');
      await eliminateDialog.getByRole('button', { name: '确认标记出局' }).click();

      await expect(targetRow.getByRole('button', { name: '撤销出局' })).toBeVisible({ timeout: 15_000 });
      await expect(targetRow).toContainText('已出局');

      // 玩家手机端同步
      await expect(playerPage.locator('.mod-player-eliminated')).toBeVisible({ timeout: 15_000 });
      await expect(playerPage.locator('.seat-chip.is-out')).toHaveCount(1);

      // —— 撤销出局同步恢复 ——
      await targetRow.getByRole('button', { name: '撤销出局' }).click();
      await judgePage.locator('.confirm-dialog').getByRole('button', { name: '确认撤销出局' }).click();
      await expect(targetRow.getByRole('button', { name: '标记出局' })).toBeVisible({ timeout: 15_000 });
      await expect(playerPage.locator('.mod-player-eliminated')).toHaveCount(0);

      // —— 刷新不重播抽卡演出、不自动亮牌（防窥 + 仪式一次性）——
      await playerPage.reload();
      await expect(playerPage.locator('.identity-flip-card')).toBeVisible({ timeout: 20_000 });
      await expect(playerPage.locator('.mod-deal-ceremony')).toHaveCount(0);
      await expect(playerPage.locator('.identity-flip-card.is-revealed')).toHaveCount(0);

      // —— 结束对局并亮牌 ——
      await judgePage.locator('.mod-console__menu-btn').click();
      await judgePage.getByRole('button', { name: /结束对局并亮牌/ }).click();
      await judgePage.locator('.confirm-dialog').getByRole('button', { name: '确认结束并亮牌' }).click();

      await expect(judgePage.locator('.mod-console__ended')).toContainText('全场身份底牌已公开', { timeout: 15_000 });
      await expect(playerPage.locator('.werewolf-reveal-modal')).toBeVisible({ timeout: 20_000 });
      await expect(playerPage.locator('.seat-chip__role').first()).toBeVisible();

      await playerPage.context().close();
      await judgePage.context().close();
    } finally {
      host.client.close();
    }
  });

  test('观战者进入真人主持对局：只读席位，无死路卡背', async ({ browser }) => {
    test.setTimeout(120_000);
    const { seeded, host } = await startModeratorGame();

    try {
      const spectator = await RoomDriver.join(WS_URL, seeded.roomCode, '观战者', { asSpectator: true });
      try {
        const page = await openSession(browser, {
          playerId: spectator.playerId,
          resumeToken: spectator.resumeToken,
          roomCode: seeded.roomCode,
          nickname: '观战者',
          seatRole: 'spectator',
        });

        await expect(page.locator('.mod-player-spectator')).toBeVisible({ timeout: 20_000 });
        await expect(page.locator('.identity-flip-card')).toHaveCount(0);
        await expect(page.locator('.mod-deal-ceremony')).toHaveCount(0);
        await expect(page.locator('.seat-chip')).toHaveCount(PLAYER_COUNT - 1);
        await page.context().close();
      } finally {
        spectator.client.close();
      }
    } finally {
      host.client.close();
    }
  });
});
