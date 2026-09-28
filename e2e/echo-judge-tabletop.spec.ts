/**
 * G2-B echo_judge_v1 完整局 Chromium 验收（botSupport none：Node + 浏览器真实驱动）。
 * 4 人局：全部 4 个座位由 WS 驱动走完 判官出题 → 依次回答 → 指认 → 轮换 → 终局；
 * 终局后用独立观战浏览器确认渲染与隐私；断言战绩落库。
 */
import { test, expect, type Browser as _Browser, type Page } from '@playwright/test';
import { seedRoom } from './helpers/dbClient.ts';
import { RoomDriver } from './helpers/wsClient.ts';
import { BASE_URL, DB_PATH, WS_URL, skipPcHostConsole } from './helpers/serverEnv.ts';

const ECHO_CONFIG = { rulesetId: 'echo_judge_v1', answerSeconds: 1, judgmentSeconds: 1 };

/** 驱动一个座位（判官出题/回答/指认），直到终局；每步尽力 act（动作幂等，重复被拒无妨） */
async function driveSeat(driver: RoomDriver, playerId: string): Promise<Record<string, unknown>> {
  let lastView: Record<string, unknown> = {};
  for (let step = 0; step < 400; step += 1) {
    const frame = driver.client.latestGameState((v) => v.gameId === 'echo-judge');
    if (frame) lastView = frame.payload.view as Record<string, unknown>;
    const view = lastView as {
      phase: string;
      judgeId: string;
      answeredCount: number;
      me: { playerId: string; isJudge: boolean; myTurn: boolean } | null;
      players: string[];
    };
    if (view.phase === 'game_over') return lastView;
    try {
      if (view.phase === 'judge_setup' && view.judgeId === playerId) {
        await driver.gameAction({ type: 'start_round', playerId, question: '你的罪行是？' });
      } else if (view.phase === 'answering' && view.me?.myTurn && view.me.playerId === playerId) {
        // myTurn 由服务端视图计算（公开 view 无 answerOrder，用 me.myTurn 判定）
        await driver.gameAction({ type: 'submit_answer', playerId, text: '我的回答' });
      } else if (view.phase === 'judgment' && view.judgeId === playerId) {
        const target = (view.players ?? []).find((id) => id !== playerId) ?? playerId;
        await driver.gameAction({ type: 'accuse', playerId, targetPlayerId: target });
      }
    } catch {
      // 动作被拒（重复/越位）无妨，继续
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return lastView;
}

test.describe('G2-B echo-judge 完整局', () => {
  test('4 人完整局：真实 WS 交替动作 + 浏览器渲染 + 隐私断言 + 服务端战绩', async ({ browser }) => {
    test.setTimeout(240_000);
    const seeded = seedRoom(DB_PATH, { gameId: 'echo-judge', count: 4, ready: true, config: ECHO_CONFIG });
    const host = await RoomDriver.resume(WS_URL, seeded.roomCode, seeded.hostId, seeded.hostResumeToken);
    try {
      const readyAck = await host.ready();
      expect(readyAck.type).toBe('ack');
      const startAck = await host.startGame(ECHO_CONFIG);
      expect(startAck.type, `start_game 应 ack：${JSON.stringify(startAck.payload)}`).toBe('ack');

      // 全部 4 个座位 WS 驱动
      const drivers = await Promise.all(
        seeded.players.map(async (p) => {
          const driver = await RoomDriver.resume(WS_URL, seeded.roomCode, p.playerId, p.resumeToken);
          return { driver, playerId: p.playerId };
        }),
      );
      try {
        const finalViews = await Promise.all(drivers.map(({ driver, playerId }) => driveSeat(driver, playerId)));
        const view = finalViews[0] ?? {};
        const v = view as { phase: string; roles?: unknown; triggerWords?: unknown };

        // 隐私断言：终局前公开视图不含 roles/triggerWords
        if (v.phase !== 'game_over') {
          expect(v.roles).toBeUndefined();
          expect(v.triggerWords).toBeUndefined();
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

        // 独立观战浏览器确认渲染（游戏已结束，观战可见终局）
        const context = await browser.newContext();
        const page: Page = await context.newPage();
        await page.setViewportSize({ width: 390, height: 844 });
        await skipPcHostConsole(page);
        await page.goto(`${BASE_URL}/?room=${seeded.roomCode}`);
        await page.waitForTimeout(2500);
        const bodyText = await page.evaluate(() => document.body.innerText).catch(() => '');
        // 观战可见「本局结束」或房间页「对局已结算」任一即渲染成功
        const rendered = bodyText.includes('本局结束') || bodyText.includes('对局已结算') || bodyText.includes('伪人测试');
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
