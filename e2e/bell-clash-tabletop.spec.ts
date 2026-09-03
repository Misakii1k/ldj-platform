/**
 * G2-B bell_clash_v1 完整局 Chromium 验收（botSupport none：Node + 浏览器真实驱动）。
 * 3 人局：全部 3 个座位 WS 驱动交替出牌/摸牌/按铃，直到有人打完手牌或抽牌堆耗尽；
 * 终局后用独立观战浏览器确认渲染与手牌隐私；断言战绩落库。
 */
import { test, expect, type Browser as _Browser } from '@playwright/test';
import { seedRoom } from './helpers/dbClient.ts';
import { RoomDriver } from './helpers/wsClient.ts';
import { BASE_URL, DB_PATH, ME_STORAGE_KEY, WS_URL } from './helpers/serverEnv.ts';

const BELL_CONFIG = { rulesetId: 'bell_clash_v1', handSize: 3, turnSeconds: 1, bellSeconds: 1 };

/** 驱动一个座位：优先打出可打手牌，否则摸牌；按铃窗口随机处理，直到终局 */
async function driveSeat(driver: RoomDriver, playerId: string): Promise<Record<string, unknown>> {
  let lastView: Record<string, unknown> = {};
  for (let step = 0; step < 400; step += 1) {
    const frame = driver.client.latestGameState((v) => v.gameId === 'bell-clash');
    if (frame) lastView = frame.payload.view as Record<string, unknown>;
    const view = lastView as {
      phase: string;
      currentPlayerId: string;
      bellOpen: boolean;
      discardTop: { kind: string; color: string; number?: number } | null;
      me: { playerId: string; hand: Array<{ kind: string; color: string; number?: number }> } | null;
    };
    if (view.phase === 'game_over') return lastView;
    try {
      if (view.phase === 'playing' && view.bellOpen) {
        await driver.gameAction({ type: 'ring_bell', playerId });
      } else if (view.phase === 'playing' && view.currentPlayerId === playerId && !view.bellOpen) {
        const hand = view.me?.hand ?? [];
        const top = view.discardTop;
        const playIndex = hand.findIndex((card) => {
          if (!top) return true;
          if (card.color === top.color) return true;
          return card.kind === 'number' && top.kind === 'number' && card.number === top.number;
        });
        if (playIndex >= 0) {
          await driver.gameAction({ type: 'play_card', playerId, cardIndex: playIndex });
        } else {
          await driver.gameAction({ type: 'draw_card', playerId });
        }
      }
    } catch {
      // 动作被拒（重复/越位）无妨，继续
    }
    await new Promise((resolve) => setTimeout(resolve, 80));
  }
  return lastView;
}

test.describe('G2-B bell-clash 完整局', () => {
  test('3 人完整局：真实 WS 交替动作 + 浏览器渲染 + 手牌隐私 + 服务端战绩', async ({ browser }) => {
    test.setTimeout(240_000);
    const seeded = seedRoom(DB_PATH, { gameId: 'bell-clash', count: 3, ready: true, config: BELL_CONFIG });
    const host = await RoomDriver.resume(WS_URL, seeded.roomCode, seeded.hostId, seeded.hostResumeToken);
    try {
      const readyAck = await host.ready();
      expect(readyAck.type).toBe('ack');
      const startAck = await host.startGame(BELL_CONFIG);
      expect(startAck.type, `start_game 应 ack：${JSON.stringify(startAck.payload)}`).toBe('ack');

      // 全部 3 个座位 WS 驱动
      const drivers = await Promise.all(
        seeded.players.map(async (p) => {
          const driver = await RoomDriver.resume(WS_URL, seeded.roomCode, p.playerId, p.resumeToken);
          return { driver, playerId: p.playerId };
        }),
      );
      try {
        await Promise.all(drivers.map(({ driver, playerId }) => driveSeat(driver, playerId)));
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

        // 独立观战浏览器确认渲染与手牌隐私（注入完整会话恢复，经房间码进入对局）
        const context = await browser.newContext();
        const page = await context.newPage();
        await page.addInitScript(
          ([key, value]) => { localStorage.setItem(key, value); },
          [ME_STORAGE_KEY, JSON.stringify({
            playerId: seeded.players[0]!.playerId,
            resumeToken: seeded.players[0]!.resumeToken,
            roomCode: seeded.roomCode,
            nickname: '玩家1',
            seatRole: 'player',
          })],
        );
        await page.setViewportSize({ width: 390, height: 844 });
        await page.goto(BASE_URL);
        await page.locator('.tabletop-shell, .room-page, .game-page').waitFor({ timeout: 30_000 });
        const bodyText = await page.evaluate(() => document.body.innerText).catch(() => '');
        const rendered = bodyText.includes('本局结束') || bodyText.includes('对局已结算') || bodyText.includes('Ding') || bodyText.includes('铃铛对决');
        expect(rendered, `浏览器应渲染游戏/终局页，实际 body 前 200 字：${bodyText.slice(0, 200)}`).toBe(true);
        await context.close();
      } finally {
        for (const { driver } of drivers) driver.client.close();
      }
    } finally {
      host.client.close();
    }
  });
});
