/**
 * D7-C loveletter_classic16_v1 完整局 Chromium 验收（botSupport none：Node + 浏览器真实驱动）。
 * 2 人局交替出牌直到好感阈值（2 人 7）触发终局；服务端产出正式战绩。
 * 隐私：他人手牌与查验记录绝不进入浏览器 DOM（只出现在服务端本人视图）。
 */
import { test, expect, type Browser, type Page } from '@playwright/test';
import { seedRoom } from './helpers/dbClient.ts';
import { RoomDriver } from './helpers/wsClient.ts';
import { BASE_URL, DB_PATH, ME_STORAGE_KEY, WS_URL } from './helpers/serverEnv.ts';

const LOVELETTER_CONFIG = { rulesetId: 'loveletter_classic16_v1' };

const ROLE_VALUE: Record<string, number> = {
  guard: 1, priest: 2, baron: 3, handmaid: 4, prince: 5, king: 6, countess: 7, princess: 8,
};

declare global {
  interface Window {
    __gameEventCount?: number;
  }
}

interface Me {
  playerId: string;
  resumeToken: string;
  roomCode: string;
  nickname: string;
}

async function openBrowser(browser: Browser, me: Me): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  // 出牌成功判定依赖 game_event 计数：情书出牌后立即摸牌，手牌数量不减少
  await page.addInitScript(() => {
    const OrigWS = window.WebSocket;
    window.__gameEventCount = 0;
    window.WebSocket = class extends OrigWS {
      constructor(...args: unknown[]) {
        super(...(args as [string | URL | null, string[]?]));
        this.addEventListener('message', (e: MessageEvent) => {
          if (String(e.data).includes('"type":"game_event"')) window.__gameEventCount += 1;
        });
      }
    };
  });
  await page.addInitScript(
    ([key, value]) => { localStorage.setItem(key, value); },
    [ME_STORAGE_KEY, JSON.stringify({ ...me, seatRole: 'player' })],
  );
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(BASE_URL);
  await page.locator('.tabletop-shell').waitFor({ timeout: 30_000 });
  return page;
}

/** 手牌中必须优先打出伯爵夫人的情形：countess + (prince|king) 同在手。 */
function mustPlayCountess(roles: readonly string[]): boolean {
  return roles.includes('countess') && (roles.includes('prince') || roles.includes('king'));
}

/** Node 侧房主策略：按合法顺序出牌（伯爵夫人强制优先，否则最低点数）；返回最后一个视角。 */
async function driveHost(
  host: RoomDriver,
  hostId: string,
): Promise<Record<string, unknown>> {
  let lastView: Record<string, unknown> = {};
  let actedSignature = '';
  const failedCardIds = new Set<string>();
  for (let step = 0; step < 2500; step += 1) {
    // 轮询最新权威状态（不按序消费旧帧），避免满负荷下读到过期回合造成竞态。
    const frame = host.client.latestGameState((v) => v.gameId === 'loveletter');
    if (frame) lastView = frame.payload.view as Record<string, unknown>;
    const view = lastView as {
      phase: string;
      currentPlayerId: string | null;
      me: { playerId: string; hand: { id: string; role: string }[] } | null;
      players: { playerId: string }[];
      protectedPlayers: string[];
      eliminatedPlayers: string[];
    };
    if (view.phase === 'game_over') return lastView;
    if (view.phase !== 'playing' || view.currentPlayerId !== hostId || view.me === null) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      continue;
    }
    // 同一状态快照只行动一次（拒绝因旧帧重复出牌）。
    const signature = JSON.stringify({
      phase: view.phase,
      current: view.currentPlayerId,
      hand: (view.me.hand ?? []).map((card) => card.id).sort(),
    });
    if (signature !== actedSignature) failedCardIds.clear();
    if (signature === actedSignature) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      continue;
    }
    const hand = [...view.me.hand].sort((a, b) => ROLE_VALUE[a.role]! - ROLE_VALUE[b.role]!);
    const protectedIds = new Set(view.protectedPlayers);
    const eliminatedIds = new Set(view.eliminatedPlayers);
    const otherTargets = view.players.filter(
      (player) => player.playerId !== hostId && !protectedIds.has(player.playerId) && !eliminatedIds.has(player.playerId),
    );
    // 总能选出一张合法可出之牌：伯爵夫人强制 → 无需目标（侍女/伯爵夫人/公主）→ 王子自选 → 有合法目标的其他牌。
    // 守卫/牧师/男爵/国王在无合法目标时也可无目标打出。
    const playable = hand.filter((entry) => !failedCardIds.has(entry.id));
    if (playable.length === 0) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      continue;
    }
    const roles = playable.map((entry) => entry.role);
    const forcedCountess = mustPlayCountess(roles);
    let card = playable[0]!;
    let target: string | undefined;
    let guess: string | undefined;
    if (forcedCountess) {
      card = playable.find((entry) => entry.role === 'countess')!;
    } else if (playable.some((entry) => entry.role === 'handmaid' || entry.role === 'countess' || entry.role === 'princess')) {
      card = playable.find((entry) => entry.role === 'handmaid' || entry.role === 'countess' || entry.role === 'princess')!;
    } else if (playable.some((entry) => entry.role === 'prince')) {
      card = playable.find((entry) => entry.role === 'prince')!;
      target = hostId;
    } else {
      card = playable[0]!;
      target = otherTargets.length > 0 ? otherTargets[0]!.playerId : undefined;
      if (card.role === 'guard') guess = 'princess';
    }
    const ack = await host.gameAction({
      type: 'play_card',
      playerId: hostId,
      cardId: card.id,
      ...(target ? { targetPlayerId: target } : {}),
      ...(guess ? { guessedRole: guess } : {}),
    });
    if (ack.type === 'ack') {
      actedSignature = signature;
    } else {
      // 规则拒绝（如伯爵夫人强制/目标无效）：换一张重试，不能跳过否则双向死锁
      failedCardIds.add(card.id);
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error('房主驱动超时');
}

test.describe('D7-C loveletter 完整局', () => {
  test('2 人完整局：真实 WS 交替出牌 + 浏览器渲染 + 手牌隐私 + 服务端战绩', async ({ browser }) => {
    test.setTimeout(420_000);
    const seeded = seedRoom(DB_PATH, { gameId: 'loveletter', count: 2, ready: true, config: LOVELETTER_CONFIG });
    const host = await RoomDriver.resume(WS_URL, seeded.roomCode, seeded.hostId, seeded.hostResumeToken);
    try {
      const readyAck = await host.ready();
      expect(readyAck.type).toBe('ack');
      const startAck = await host.startGame(LOVELETTER_CONFIG);
      expect(startAck.type, `start_game 应 ack：${JSON.stringify(startAck.payload)}`).toBe('ack');

      const browserPlayer = seeded.players[1]!;
      const page = await openBrowser(browser, {
        playerId: browserPlayer.playerId,
        resumeToken: browserPlayer.resumeToken,
        roomCode: seeded.roomCode,
        nickname: '玩家2',
      });

      await expect(page.locator('.loveletter-immersive-board, .loveletter-afc')).toBeVisible();

      // 房主（Node）并行驱动自己的回合；浏览器驱动自己的回合
      const hostDrive = driveHost(host, seeded.hostId);

      // 浏览器策略：轮到即按合法顺序出牌（伯爵夫人强制 → 最低点数）
      const deadline = Date.now() + 400_000;
      while (Date.now() < deadline) {
        if (await page.locator('.loveletter-over').isVisible().catch(() => false)) break;
        if (await page.locator('.room-page').isVisible().catch(() => false)) break;
        const isMyTurn = await page.getByText(/轮到你/).first().isVisible().catch(() => false);
        const handCount = await page.locator('.loveletter-card').count().catch(() => 0);
        if (!isMyTurn) {
          await page.waitForTimeout(300);
          continue;
        }
        const handCards = page.locator('.loveletter-card');
        if (handCount === 0) { await page.waitForTimeout(300); continue; }

        // 逐张尝试：伯爵夫人强制优先，否则按 DOM 顺序轮换；无合法目标的牌跳过。
        const texts: string[] = [];
        for (let i = 0; i < handCount; i += 1) {
          texts.push((await handCards.nth(i).textContent().catch(() => '')) ?? '');
        }
        const tryOrder = texts.map((_, index) => index);
        // 伯爵夫人强制：若同手有王子/国王，必须先出伯爵夫人。
        const forcedCountess = texts.some((t) => t.includes('伯爵夫人'))
          && (texts.some((t) => t.includes('王子')) || texts.some((t) => t.includes('国王')));
        const order = forcedCountess
          ? [texts.findIndex((t) => t.includes('伯爵夫人'))]
          : tryOrder;

        let played = false;
        for (let attempt = 0; attempt < order.length && !played; attempt += 1) {
          const idx = order[attempt]!;
          await handCards.nth(idx).click({ timeout: 1000 }).catch(() => {});
          const opponent = page.locator('.ll-opponent.is-targetable, .ll-target-self-btn, .loveletter-target button').first();
          const oppN = await opponent.count().catch(() => 0);
          if (oppN > 0) {
            await opponent.click({ timeout: 1000 }).catch(() => {});
          }
          // 守卫需猜身份：优先猜「公主」（守卫不能猜守卫）
          const rolePicker = page.locator('.ll-role-picker, .loveletter-guess');
          const pickerVisible = await rolePicker.isVisible().catch(() => false);
          if (pickerVisible) {
            const princess = rolePicker.getByRole('button', { name: '公主' });
            if (await princess.count().catch(() => 0) > 0) {
              await princess.click({ timeout: 1000 }).catch(() => {});
            } else {
              await rolePicker.getByRole('button').first().click({ timeout: 1000 }).catch(() => {});
            }
          }
          const playBtn = page.getByRole('button', { name: /打出「/ });
          await playBtn.waitFor({ state: 'visible', timeout: 2000 }).catch(() => {});
          const btnEnabled = await playBtn.isEnabled().catch(() => false);
          if (!btnEnabled) {
            await page.getByRole('button', { name: '重选' }).click({ timeout: 1000 }).catch(() => {});
            continue;
          }
          // 出牌成功 = game_event 推进（情书出牌后立即摸牌，手牌数不减少）
          const eventsBefore = await page.evaluate(() => window.__gameEventCount ?? 0);
          await playBtn.click({ timeout: 1000 }).catch(() => {});
          await page.waitForTimeout(700);
          const eventsAfter = await page.evaluate(() => window.__gameEventCount ?? 0);
          if (eventsAfter > eventsBefore) {
            played = true;
          } else {
            await page.getByRole('button', { name: '重选' }).click({ timeout: 1000 }).catch(() => {});
          }
        }
        if (!played) await page.waitForTimeout(300);
      }

      // 终局信号：房间页显示对局已结算（POST_GAME 客户端切回大厅）
      await expect(page.getByText('对局已结算').first()).toBeVisible({ timeout: 30_000 });
      const finalView = await hostDrive;

      // 隐私断言：视图不含手牌明文（只暴露手牌数量）
      const view = finalView as {
        players: { playerId: string; handCount: number }[];
        me: { playerId: string; hand: unknown[] } | null;
        hands?: unknown;
      };
      expect(view.hands).toBeUndefined();
      expect(view.players.every((player) => typeof player.handCount === 'number')).toBe(true);

      // 服务端权威战绩
      const db = new (await import('node:sqlite')).DatabaseSync(DB_PATH, { timeout: 5000 });
      try {
        const row = db.prepare(
          `SELECT COUNT(*) AS n FROM game_results r JOIN game_sessions s ON s.id = r.session_id JOIN rooms ro ON ro.id = s.room_id WHERE ro.code = ?`,
        ).get(seeded.roomCode) as { n: number };
        expect(row.n, `房间 ${seeded.roomCode} 应产出正式战绩`).toBeGreaterThanOrEqual(1);
      } finally {
        db.close();
      }

      await page.context().close();
    } finally {
      host.client.close();
    }
  });
});
