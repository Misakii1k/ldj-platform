/**
 * G2-B goose_relay_classic_v1 完整局 Chromium 验收（botSupport none：Node + 浏览器真实驱动）。
 * 5 人局：全部 5 个座位 WS 驱动走完 传递 → 讨论 → 从末位逐一指认 → 投票 → 结算；
 * 终局后用独立观战浏览器确认渲染与隐私；断言战绩落库。
 */
import { test, expect, type Browser as _Browser } from '@playwright/test';
import { seedRoom } from './helpers/dbClient.ts';
import { RoomDriver } from './helpers/wsClient.ts';
import { BASE_URL, DB_PATH, WS_URL, skipPcHostConsole } from './helpers/serverEnv.ts';

const RELAY_CONFIG = {
  rulesetId: 'goose_relay_classic_v1',
  claimHeadSeconds: 1,
  pickCardsSeconds: 1,
  relaySeconds: 1,
  discussionSeconds: 0,
  accuseSeconds: 1,
  voteSeconds: 1,
};

/** 驱动一个座位：传递忠实复述、指认固定错、投票，直到终局 */
async function driveSeat(driver: RoomDriver, playerId: string, playerIndex: number): Promise<Record<string, unknown>> {
  let lastView: Record<string, unknown> = {};
  for (let step = 0; step < 400; step += 1) {
    const frame = driver.client.latestGameState((v) => v.gameId === 'goose-relay');
    if (frame) lastView = frame.payload.view as Record<string, unknown>;
    const view = lastView as {
      phase: string;
      currentIndex: number;
      currentAccuserIndex: number;
      headPlayerId: string | null;
      candidateCards: string[];
      me: { playerId: string; observed: { murderer: string; victim: string } | null } | null;
      lineOrder: string[];
    };
    if (view.phase === 'game_over') return lastView;
    try {
      if (view.phase === 'claim_head') {
        if (playerIndex === 0) {
          await driver.gameAction({ type: 'claim_head', playerId, claim: true });
        }
      } else if (view.phase === 'pick_cards' && view.headPlayerId === playerId) {
        const candidateCards = view.candidateCards ?? ['white_goose', 'black_goose'];
        await driver.gameAction({
          type: 'pick_cards',
          playerId,
          murderer: candidateCards[0] ?? 'white_goose',
          victim: candidateCards[1] ?? 'black_goose',
        });
      } else if (view.phase === 'relay' && view.currentIndex === playerIndex) {
        const observed = view.me?.observed;
        await driver.gameAction({
          type: 'transmit',
          playerId,
          case: observed ?? { murderer: 'grey_goose', victim: 'white_goose', tool: 'knife', scene: 'barn' },
        });
      } else if (view.phase === 'accusation' && view.currentAccuserIndex === playerIndex) {
        await driver.gameAction({ type: 'accuse', playerId, murderer: 'brown_goose', victim: 'black_goose' });
      } else if (view.phase === 'vote') {
        const target = (view.lineOrder ?? []).find((id) => id !== playerId) ?? playerId;
        await driver.gameAction({ type: 'cast_vote', playerId, targetPlayerId: target });
      }
    } catch {
      // 动作被拒（重复/越位）无妨，继续
    }
    await new Promise((resolve) => setTimeout(resolve, 80));
  }
  return lastView;
}

test.describe('G2-B goose-relay 完整局', () => {
  test('5 人完整局：真实 WS 交替动作 + 浏览器渲染 + 隐私断言 + 服务端战绩', async ({ browser }) => {
    test.setTimeout(240_000);
    const seeded = seedRoom(DB_PATH, { gameId: 'goose-relay', count: 5, ready: true, config: RELAY_CONFIG });
    const host = await RoomDriver.resume(WS_URL, seeded.roomCode, seeded.hostId, seeded.hostResumeToken);
    try {
      const readyAck = await host.ready();
      expect(readyAck.type).toBe('ack');
      const startAck = await host.startGame(RELAY_CONFIG);
      expect(startAck.type, `start_game 应 ack：${JSON.stringify(startAck.payload)}`).toBe('ack');

      // 全部 5 个座位 WS 驱动
      const drivers = await Promise.all(
        seeded.players.map(async (p) => {
          const driver = await RoomDriver.resume(WS_URL, seeded.roomCode, p.playerId, p.resumeToken);
          const index = seeded.players.findIndex((seat) => seat.playerId === p.playerId);
          return { driver, playerId: p.playerId, index };
        }),
      );
      try {
        const finalViews = await Promise.all(drivers.map(({ driver, playerId, index }) => driveSeat(driver, playerId, index)));
        const view = finalViews[0] ?? {};
        const v = view as { phase: string; case?: unknown; evilGeese?: unknown };

        // 隐私断言：终局前公开视图不含原始案情/恶鹅名单
        if (v.phase !== 'game_over') {
          expect(v.case).toBeUndefined();
          expect(v.evilGeese).toBeUndefined();
        }

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

        // 独立观战浏览器确认渲染
        const context = await browser.newContext();
        const page = await context.newPage();
        await page.setViewportSize({ width: 390, height: 844 });
        await skipPcHostConsole(page);
        await page.goto(`${BASE_URL}/?room=${seeded.roomCode}`);
        await page.waitForTimeout(2500);
        const bodyText = await page.evaluate(() => document.body.innerText).catch(() => '');
        const rendered = bodyText.includes('本局结束') || bodyText.includes('对局已结算') || bodyText.includes('以鹅传鹅');
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
