/** D6：landlord_platform_v1 默认规则集与严格客户端牌桌 Chromium 验收。 */
import { test, expect, type Browser, type Page } from '@playwright/test';
import { seedRoom } from './helpers/dbClient.ts';
import { RoomDriver } from './helpers/wsClient.ts';
import { BASE_URL, DB_PATH, ME_STORAGE_KEY, WS_URL } from './helpers/serverEnv.ts';

interface BrowserMe {
  playerId: string;
  resumeToken: string;
  roomCode: string;
  nickname: string;
}

interface LandlordFrameView {
  rulesetId?: string;
  schemaVersion?: number;
  phase?: string;
  players?: { playerId: string; handCount: number }[];
  bottomCards?: { id: string; rank: string; suit?: string }[];
  currentBidderId?: string | null;
  landlordId?: string | null;
  currentPlayerId?: string | null;
  currentTrick?: { playerId: string } | null;
  me?: { playerId: string; hand: { id: string }[] } | null;
}

async function prepareBrowser(browser: Browser, me: BrowserMe, viewport: { width: number; height: number }): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.addInitScript(
    ([key, value]) => { localStorage.setItem(key, value); },
    [ME_STORAGE_KEY, JSON.stringify({ ...me, seatRole: 'player' })],
  );
  await page.setViewportSize(viewport);
  return page;
}

async function prepareHost(seeded: ReturnType<typeof seedRoom>): Promise<RoomDriver> {
  const host = await RoomDriver.resume(WS_URL, seeded.roomCode, seeded.hostId, seeded.hostResumeToken);
  const readyAck = await host.ready();
  expect(readyAck.type).toBe('ack');
  return host;
}

async function startPlatformGame(host: RoomDriver, useCatalogDefault = false): Promise<void> {
  const startAck = await host.startGame(
    useCatalogDefault ? undefined : { rulesetId: 'landlord_platform_v1', variant: 'standard' },
  );
  expect(startAck.type, `${startAck.payload.code ?? ''} ${startAck.payload.message ?? ''}`).toBe('ack');
}

test.describe('D6 landlord_platform_v1 客户端产品闭环', () => {
  test('宽视口：严格判别、浏览器叫 3 分成为地主、底牌隐私与真实出牌', async ({ browser }) => {
    const seeded = seedRoom(DB_PATH, {
      gameId: 'landlord',
      count: 3,
      ready: true,
      config: { rulesetId: 'landlord_platform_v1', variant: 'standard' },
    });
    const host = await prepareHost(seeded);
    const browserPlayer = seeded.players[1]!;
    const page = await prepareBrowser(browser, {
      playerId: browserPlayer.playerId,
      resumeToken: browserPlayer.resumeToken,
      roomCode: seeded.roomCode,
      nickname: '玩家2',
    }, { width: 1280, height: 800 });

    try {
      await page.goto(BASE_URL);
      await expect(page.locator('.room-page')).toBeVisible({ timeout: 30_000 });
      await page.getByRole('button', { name: '准备', exact: true }).click();
      await startPlatformGame(host);
      const first = await host.waitGameState((view) => view.rulesetId === 'landlord_platform_v1');
      expect(first.payload.engineContractVersion).toBe(2);
      expect(first.payload.viewVersion).toBe(1);
      expect(first.payload.rulesetId).toBe('landlord_platform_v1');
      expect((first.payload.view as LandlordFrameView).schemaVersion).toBe(1);

      const table = page.locator('.landlord-table');
      await expect(table).toBeVisible({ timeout: 30_000 });
      await expect(table).toHaveAttribute('data-ruleset-id', 'landlord_platform_v1');
      await expect(table).toHaveAttribute('data-schema-version', '1');
      await expect(page.locator('.landlord-hand__card')).toHaveCount(17);
      await expect(page.locator('.landlord-players .new-player-chip')).toHaveCount(3);

      // 聊天入口只允许一个，且必须解析到游戏调色板令牌（防止挂载在 .game-page 外退化为裸文字）。
      const chatTrigger = page.locator('.game-chat-trigger');
      await expect(chatTrigger).toHaveCount(1);
      const chatStyle = await chatTrigger.evaluate((el) => {
        const style = getComputedStyle(el);
        return { background: style.backgroundColor, borderWidth: style.borderTopWidth };
      });
      expect(chatStyle.background).toBe('rgb(239, 81, 61)');
      expect(chatStyle.borderWidth).toBe('3px');

      // 房主不叫，叫分权转给浏览器玩家；浏览器真实点击 3 分。
      const hostBid = await host.gameAction({ type: 'bid_score', score: 0 });
      expect(hostBid.type).toBe('ack');
      await expect(page.getByRole('button', { name: '3 分' })).toBeEnabled({ timeout: 15_000 });
      await page.getByRole('button', { name: '3 分' }).click();

      const playing = await host.waitGameState(
        (view) => view.phase === 'playing' && view.landlordId === browserPlayer.playerId,
        15_000,
      );
      const farmerView = playing.payload.view as LandlordFrameView;
      expect(farmerView.me?.playerId).toBe(seeded.hostId);
      expect(farmerView.me?.hand.length).toBe(17);
      expect(farmerView.bottomCards).toEqual([]);
      expect(farmerView.players?.some((player) => 'hand' in player)).toBe(false);

      // 地主浏览器看到 3 张底牌并持有 20 张牌；只展示本人手牌，不生成他人手牌 DOM。
      await expect(table).toHaveClass(/phase-playing/);
      await expect(page.getByText('我的手牌 · 20 张')).toBeVisible();
      await expect(page.locator('.bottom-card-row .card-face-static')).toHaveCount(3);
      await expect(page.locator('.landlord-hand__card')).toHaveCount(20);
      await expect(page.locator('.landlord-hand')).toHaveCount(1);

      // 键盘聚焦并真实出一张牌，服务端权威视图确认 20 → 19。
      const firstCard = page.locator('.landlord-hand__card').first();
      await firstCard.focus();
      await expect(firstCard).toBeFocused();
      await firstCard.press('Enter');
      await expect(page.getByRole('button', { name: '出牌', exact: true })).toBeEnabled();
      await page.getByRole('button', { name: '出牌', exact: true }).click();
      await host.waitGameState(
        (view) => view.phase === 'playing'
          && view.currentTrick !== null
          && (view.players as LandlordFrameView['players'])?.some(
            (player) => player.playerId === browserPlayer.playerId && player.handCount === 19,
          ) === true,
        15_000,
      );
      await expect(page.locator('.landlord-hand__card')).toHaveCount(19);
    } finally {
      host.client.close();
      await page.context().close();
    }
  });

  test('窄视口：平台牌桌可滚动且无页面级水平溢出', async ({ browser }) => {
    const seeded = seedRoom(DB_PATH, {
      gameId: 'landlord',
      count: 3,
      ready: true,
      config: { rulesetId: 'landlord_platform_v1', variant: 'standard' },
    });
    const host = await prepareHost(seeded);
    const browserPlayer = seeded.players[1]!;
    const page = await prepareBrowser(browser, {
      playerId: browserPlayer.playerId,
      resumeToken: browserPlayer.resumeToken,
      roomCode: seeded.roomCode,
      nickname: '玩家2',
    }, { width: 390, height: 844 });

    try {
      await page.goto(BASE_URL);
      await expect(page.locator('.room-page')).toBeVisible({ timeout: 30_000 });
      await page.getByRole('button', { name: '准备', exact: true }).click();
      await startPlatformGame(host, true);
      await expect(page.locator('.landlord-table')).toHaveAttribute('data-ruleset-id', 'landlord_platform_v1', { timeout: 30_000 });
      await expect(page.locator('.landlord-hand__card')).toHaveCount(17);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(1);
    } finally {
      host.client.close();
      await page.context().close();
    }
  });
});
