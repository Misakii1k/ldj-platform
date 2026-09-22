/**
 * D4-U-UI：uno_platform_house_v1 主舞台真实 Chromium 验收。
 *
 * 平台状态（真实服务器检测）：
 * - uno availability = blocked_rights → create_room 平台建房仍被准入真实拒绝（ACTION_NOT_ALLOWED），
 *   故对局流沿用已确立的 seed + resume 模式（wsClient.ts 顶部说明），start_game 走真实规则集路由。
 * - start_game({ rulesetId: 'uno_platform_house_v1', mode, roundCount }) 经真实服务器成功开局
 *   （D4 平台 ruleset 路由修复后 house/blank 均按 (moduleId, rulesetId) 解析）。
 *
 * 验证内容（真实 Chromium 断言，非源码 grep）：
 * - 渲染：标题/阶段/玩家区/弃牌堆/手牌按钮/操作按钮真实可见。
 * - 私有性：其他玩家只显示手牌张数，手牌卡按钮只属于本人。
 * - 动作：浏览器真实点击抽牌/出牌 → 服务端 game_state 显示手牌数变化与弃牌堆 +1。
 * - viewport：1280×800（操作流）与 390×844（渲染/私有性/无水平溢出）各一次。
 */
import { test, expect, type Browser, type Page } from '@playwright/test';
import { seedRoom } from './helpers/dbClient.ts';
import { RoomDriver, WsClient } from './helpers/wsClient.ts';
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
  // 每个浏览器玩家都要跳过 PC 主机控制台，否则停在大屏入口页进不了对局。
  // 放在工厂里统一处理，避免各用例各自调用时漏掉。
  await skipPcHostConsole(page);
  await page.addInitScript(
    ([key, value]) => { localStorage.setItem(key, value); },
    [ME_STORAGE_KEY, JSON.stringify({ ...me, seatRole: 'player' })],
  );
  return page;
}

/** house 视角帧的类型化视图访问 */
interface HouseFrameView {
  rulesetId?: string;
  phase?: string;
  currentPlayerId?: string;
  discardCount?: number;
  players?: { playerId: string; handCount: number }[];
  me?: {
    playerId?: string;
    hand?: { id: string; kind: string }[];
    playableCardIds?: string[];
    hasDrawnThisTurn?: boolean;
    isCurrentPlayer?: boolean;
  } | null;
}

const HOUSE_CONFIG = { mode: 'individual', roundCount: 1 } as const;

/** 房主 resume + ready + start_game（真实规则集路由），返回 ack 供断言 */
async function startHouseGame(seeded: ReturnType<typeof seedRoom>): Promise<{ host: RoomDriver; startAck: import('./helpers/wsClient.ts').Envelope }> {
  const host = await RoomDriver.resume(WS_URL, seeded.roomCode, seeded.hostId, seeded.hostResumeToken);
  const readyAck = await host.ready();
  expect(readyAck.type, `ready 应 ack，收到：${readyAck.type} ${readyAck.payload.code ?? ''}`).toBe('ack');
  const startAck = await host.startGame({ rulesetId: 'uno_platform_house_v1', ...HOUSE_CONFIG });
  return { host, startAck };
}

test.describe('D4-U-UI uno_platform_house_v1', () => {
  test('平台准入：uno 为 playable，create_room 经真实准入成功', async () => {
    const client = await WsClient.connect(WS_URL);
    try {
      const ack = await client.request('create_room', {
        gameId: 'uno',
        nickname: '房主',
        gameConfig: { rulesetId: 'uno_platform_house_v1' },
      });
      expect(ack.type).toBe('ack');
    } finally {
      client.close();
    }
  });

  test('start_game 对 uno_platform_house_v1 成功开局（平台 ruleset 路由成功链）', async () => {
    const seeded = seedRoom(DB_PATH, {
      gameId: 'uno',
      count: 2,
      ready: true,
      config: { rulesetId: 'uno_platform_house_v1' },
    });
    const { host, startAck } = await startHouseGame(seeded);
    try {
      expect(
        startAck.type,
        `start_game 应 ack：${startAck.payload.code ?? ''} ${startAck.payload.message ?? ''}`,
      ).toBe('ack');
      // 房主视角确认版本化判别符与 house 视图（唯一权威来源）
      const hostState = await host.waitGameState(
        (v) => v.rulesetId === 'uno_platform_house_v1' && v.phase === 'round_playing',
      );
      expect(hostState.payload.role).toBe('player');
      expect(hostState.payload.moduleId).toBe('uno');
      expect(hostState.payload.engineContractVersion).toBe(2);
      const view = hostState.payload.view as HouseFrameView;
      expect(view.rulesetId).toBe('uno_platform_house_v1');
      expect(view.me?.hand?.length).toBe(7);
    } finally {
      host.client.close();
    }
  });

  test('宽视口 1280×800：渲染 + 私有性 + 浏览器真实抽牌/出牌 game_action', async ({ browser }) => {
    const seeded = seedRoom(DB_PATH, {
      gameId: 'uno',
      count: 2,
      ready: true,
      config: { rulesetId: 'uno_platform_house_v1' },
    });
    const { host, startAck } = await startHouseGame(seeded);
    try {
      expect(startAck.type, `start_game 应 ack：${startAck.payload.code ?? ''}`).toBe('ack');

      // 浏览器玩家加入（本地会话 → 真实 resume）
      const browserPlayer = seeded.players[1]!;
      const browserId = browserPlayer.playerId;
      const page = await prepareBrowser(browser, {
        playerId: browserPlayer.playerId,
        resumeToken: browserPlayer.resumeToken,
        roomCode: seeded.roomCode,
        nickname: '玩家2',
      });
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.goto(BASE_URL);

      // —— 渲染证据 ——
      await expect(page.getByText('UNO 房规模式').first()).toBeVisible({ timeout: 20_000 });
      await expect(page.getByText(/对局中|局/).first()).toBeVisible();
      // 席位条已由环形站位取代（hideSeats）：对手数 = 总人数 - 自己
      await expect(page.locator('.tabletop-seats-bar')).toHaveCount(0);
      await expect(page.locator('.uno-opponent-station')).toHaveCount(1);
      await expect(page.locator('.uno-house-discard')).toBeVisible();
      await expect(page.locator('.uno-house-center__meta')).toBeVisible();
      await expect(page.locator('.card-fan-item')).toHaveCount(7);
      await expect(page.getByText('玩家2').first()).toBeVisible();

      // —— 私有性证据 ——
      // 对手只暴露张数徽章，手牌实体仅本人可见
      await expect(page.locator('.uno-opponent-cards-tag')).toHaveCount(1);
      await expect(page.locator('.card-fan-item')).toHaveCount(7);

      // —— 驱动对局：浏览器真实操作抽牌/出牌，产生真实 game_action ——
      let browserActed = false;
      const deadline = Date.now() + 100_000;
      while (Date.now() < deadline && !browserActed) {
        const frame = await host.waitGameState(
          (v) => v.rulesetId === 'uno_platform_house_v1' && v.phase === 'round_playing',
          30_000,
        );
        const view = frame.payload.view as HouseFrameView;
        const currentId = view.currentPlayerId;
        const prevDiscardCount = Number(view.discardCount);

        if (currentId === browserId) {
          // 浏览器回合：先抽牌
          const drawBtn = page.locator('.uno-floating-controls').getByRole('button', { name: '摸牌' });
          await drawBtn.waitFor({ state: 'visible', timeout: 15_000 });
          // 以摸牌前的真实手牌数为基准：循环可能在后续轮次才进入本分支，
          // 此时手牌已不是开局的 7 张，硬编码 7→8 会误判。
          const handBefore = (view.players ?? []).find((p) => p.playerId === browserId)?.handCount ?? 7;
          await drawBtn.click();

          // 服务端状态证据：浏览器玩家手牌 +1
          await host.waitGameState(
            (v) => (v.players as HouseFrameView['players'] ?? []).some(
              (p) => p.playerId === browserId && p.handCount === handBefore + 1,
            ),
          );
          await expect(page.locator('.card-fan-item')).toHaveCount(handBefore + 1);

          // 出牌：优先出任意可出牌（万能需选色）；摸后仍无可出则结束回合等下一轮
          await page.waitForTimeout(500);
          const enabled = page.locator('.card-fan-item:not(.card-fan-item--disabled)');
          const enabledCount = await enabled.count();
          if (enabledCount > 0) {
            const first = enabled.first();
            await expect(first).toBeEnabled({ timeout: 5_000 });
            const cls = (await first.getAttribute('class')) ?? '';
            const isWild = cls.includes('card-fan-item--wild') || cls.includes('color-wild');
            // 扇形手牌有持续动画，Playwright 的稳定性检查等不到静止，
            // 故用 dispatchEvent 直接派发点击（React 合成事件仍能收到）。
            await first.dispatchEvent('click');
            // UNO 舞台传了 hidePlayButton，出牌走浮动控制条的「出牌」按钮，
            // 而不是 CardFanEngine 自带的 .card-fan-play-btn（在 UNO 中永不渲染）。
            const playBtn = page.locator('.uno-floating-controls')
              .getByRole('button', { name: '出牌' });
            await playBtn.waitFor({ state: 'visible', timeout: 5_000 });
            await playBtn.click();
            // 手上剩 2 张时会先弹预喊确认框，这里选择静默出牌以保持原有断言语义
            const silentBtn = page.locator('.uno-precall-btn--silent');
            if (await silentBtn.isVisible().catch(() => false)) {
              await silentBtn.click();
            }
            if (isWild) {
              const redBtn = page.locator('.uno-color-wheel-grid button.color-red');
              await redBtn.waitFor({ state: 'visible', timeout: 5_000 });
              await redBtn.click();
            }
            // 服务端状态证据：手牌回到摸牌前张数且弃牌堆 +1（出牌被真实模块受理）
            await host.waitGameState(
              (v) =>
                (v.players as HouseFrameView['players'] ?? []).some(
                  (p) => p.playerId === browserId && p.handCount === handBefore,
                )
                && Number(v.discardCount) === prevDiscardCount + 1,
            );
            await expect(page.locator('.card-fan-item')).toHaveCount(handBefore);
            browserActed = true;
          } else {
            await page.getByRole('button', { name: '过牌结束' }).click();
            await host.waitGameState((v) => v.currentPlayerId !== browserId);
            // 不置 browserActed：下一轮再试（摸后仍无合法牌的概率极低）
          }
        } else if (currentId === host.playerId) {
          // host 回合：只出安全牌（避免对浏览器开罚牌窗口）；否则摸牌/结束
          const me = view.me;
          const playable = me?.playableCardIds ?? [];
          const hand = me?.hand ?? [];
          const legalCards = playable
            .map((id) => hand.find((c) => c.id === id))
            .filter((c): c is { id: string; kind: string } => Boolean(c));
          const safe = legalCards.filter((c) => c.kind !== 'draw2' && c.kind !== 'wild4');
          const chosen = safe[0] ?? null;
          if (chosen) {
            const isWild = chosen.kind === 'wild' || chosen.kind === 'wild4';
            await host.gameAction(
              isWild
                ? { type: 'play_card', cardId: chosen.id, declaredColor: 'blue' }
                : { type: 'play_card', cardId: chosen.id },
            );
          } else if (!me?.hasDrawnThisTurn) {
            await host.gameAction({ type: 'draw_card' });
          } else {
            await host.gameAction({ type: 'pass_after_draw' });
          }
        }
        // 其他情况：等待下一帧（15s 回合计时器自动推进）
      }
      expect(browserActed, '浏览器玩家应在限时内完成真实抽牌/出牌动作').toBe(true);

      await page.context().close();
    } finally {
      host.client.close();
    }
  });

  test('窄视口 390×844：4 人局渲染、私有性、无水平溢出', async ({ browser }) => {
    const seeded = seedRoom(DB_PATH, {
      gameId: 'uno',
      count: 4,
      ready: true,
      config: { rulesetId: 'uno_platform_house_v1' },
    });
    const { host, startAck } = await startHouseGame(seeded);
    try {
      expect(startAck.type, `start_game 应 ack：${startAck.payload.code ?? ''}`).toBe('ack');
      const hostState = await host.waitGameState(
        (v) => v.rulesetId === 'uno_platform_house_v1' && v.phase === 'round_playing',
      );
      expect(hostState.payload.role).toBe('player');

      const browserPlayer = seeded.players[1]!;
      const page = await prepareBrowser(browser, {
        playerId: browserPlayer.playerId,
        resumeToken: browserPlayer.resumeToken,
        roomCode: seeded.roomCode,
        nickname: '玩家2',
      });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(BASE_URL);

      await expect(page.getByText('UNO 房规模式').first()).toBeVisible({ timeout: 20_000 });
      await expect(page.locator('.tabletop-seats-bar')).toHaveCount(0);
      await expect(page.locator('.uno-opponent-station')).toHaveCount(3);
      await expect(page.locator('.uno-house-discard')).toBeVisible();
      await expect(page.locator('.card-fan-item')).toHaveCount(7);
      // 私有性：手牌卡按钮只属于本人（7 个），其他玩家行只显示张数
      await expect(page.locator('.uno-opponent-cards-tag')).toHaveCount(3);

      // 几何：窄视口无根页面水平溢出
      const overflow = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);

      await page.context().close();
    } finally {
      host.client.close();
    }
  });
});
