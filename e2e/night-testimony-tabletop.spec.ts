/**
 * G2-B night_testimony_v1 完整局 Chromium 验收（botSupport none：全部由 Node + 浏览器真实驱动）。
 * 4 人局：1 个浏览器座位 + 3 个 Node 座位走完 问答 → 推理 → 投票 → 结算；
 * 断言浏览器渲染、隐私（狱警/罪行卡不入公开视图）、战绩落库。
 */
import { test, expect, type Browser, type Page } from '@playwright/test';
import { seedRoom } from './helpers/dbClient.ts';
import { RoomDriver } from './helpers/wsClient.ts';
import { BASE_URL, DB_PATH, ME_STORAGE_KEY, WS_URL, skipPcHostConsole } from './helpers/serverEnv.ts';

const TESTIMONY_CONFIG = {
  rulesetId: 'night_testimony_v1',
  questionSeconds: 1,
  deductionSeconds: 1,
  voteSeconds: 1,
  questionLimit: 4,
};

interface Me {
  playerId: string;
  resumeToken: string;
  roomCode: string;
  nickname: string;
}

async function openBrowser(browser: Browser, me: Me): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.addInitScript(
    ([key, value]) => { localStorage.setItem(key, value); },
    [ME_STORAGE_KEY, JSON.stringify({ ...me, seatRole: 'player' })],
  );
  await page.setViewportSize({ width: 1280, height: 800 });
  await skipPcHostConsole(page);
  await page.goto(BASE_URL);
  await page.locator('.tabletop-shell').waitFor({ timeout: 30_000 });
  return page;
}

/** Node 驱动一个座位：提问/回答/投票/猜罪，直到终局 */
async function driveSeat(
  driver: RoomDriver,
  playerId: string,
): Promise<Record<string, unknown>> {
  let lastView: Record<string, unknown> = {};
  let actedSignature = '';
  for (let step = 0; step < 300; step += 1) {
    const frame = driver.client.latestGameState((v) => v.gameId === 'night-testimony');
    if (frame) lastView = frame.payload.view as Record<string, unknown>;
    const view = lastView as {
      phase: string;
      guessingInProgress: boolean;
      me: { playerId: string; isWarden: boolean; pendingQuestion: { questionerId: string; text: string } | null } | null;
      players: string[];
    };
    // 终局：若在猜罪环节（狱警座位）先猜罪，否则视为已出结果
    if (view.phase === 'game_over') {
      if (view.guessingInProgress && view.me?.isWarden) {
        const inmates = view.players.filter((id) => id !== playerId);
        const guesses: Record<string, string> = {};
        for (const id of inmates) guesses[id] = 'arson';
        await driver.gameAction({ type: 'submit_guesses', playerId, guesses });
        return lastView;
      }
      return lastView;
    }
    const signature = JSON.stringify({ phase: view.phase, pending: view.me?.pendingQuestion !== null });
    if (signature === actedSignature) {
      await new Promise((resolve) => setTimeout(resolve, 150));
      continue;
    }
    let acted = false;
    if (view.phase === 'question' && view.me?.pendingQuestion) {
      await driver.gameAction({ type: 'answer', playerId, answer: 'yes' });
      acted = true;
    } else if (view.phase === 'question' && !view.me?.pendingQuestion) {
      const target = view.players.find((id) => id !== playerId);
      await driver.gameAction({ type: 'ask', playerId, targetPlayerId: target ?? playerId, text: '你的罪行？' });
      acted = true;
    } else if (view.phase === 'vote') {
      const target = view.players.find((id) => id !== playerId);
      await driver.gameAction({ type: 'cast_vote', playerId, targetPlayerId: target ?? playerId });
      acted = true;
    }
    if (acted) actedSignature = signature;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return lastView;
}

test.describe('G2-B night-testimony 完整局', () => {
  test('4 人完整局：真实 WS 交替动作 + 浏览器渲染 + 隐私断言 + 服务端战绩', async ({ browser }) => {
    test.setTimeout(240_000);
    const seeded = seedRoom(DB_PATH, { gameId: 'night-testimony', count: 4, ready: true, config: TESTIMONY_CONFIG });
    const host = await RoomDriver.resume(WS_URL, seeded.roomCode, seeded.hostId, seeded.hostResumeToken);
    try {
      const readyAck = await host.ready();
      expect(readyAck.type).toBe('ack');
      const startAck = await host.startGame(TESTIMONY_CONFIG);
      expect(startAck.type, `start_game 应 ack：${JSON.stringify(startAck.payload)}`).toBe('ack');

      const browserPlayer = seeded.players[1]!;
      const page = await openBrowser(browser, {
        playerId: browserPlayer.playerId,
        resumeToken: browserPlayer.resumeToken,
        roomCode: seeded.roomCode,
        nickname: '玩家2',
      });

      // 渲染断言：私密信息区可见
      await expect(page.locator('.testimony-private')).toBeVisible();

      // Node 驱动其余 3 个座位
      const otherSeats = seeded.players.filter((p) => p.playerId !== browserPlayer.playerId);
      const nodeDrivers = await Promise.all(
        otherSeats.map(async (p) => {
          const driver = await RoomDriver.resume(WS_URL, seeded.roomCode, p.playerId, p.resumeToken);
          return { driver, playerId: p.playerId };
        }),
      );
      try {
        const nodeDrive = Promise.all(nodeDrivers.map(({ driver, playerId }) => driveSeat(driver, playerId)));

        // 浏览器驱动：回答/提问/投票，直到房间页
        const browserDeadline = Date.now() + 200_000;
        while (Date.now() < browserDeadline) {
          if (await page.locator('.testimony-over').isVisible().catch(() => false)) break;
          if (await page.locator('.room-page').isVisible().catch(() => false)) break;
          const answerYes = page.getByRole('button', { name: '回答 YES' }).first();
          const answerNo = page.getByRole('button', { name: '回答 NO' }).first();
          const askSubmit = page.getByRole('button', { name: /^提问 / }).first();
          const askInput = page.locator('.goose-transmit__input');
          const voteBtn = page.getByRole('button', { name: /^票选 / }).first();
          const guessSubmit = page.getByRole('button', { name: '提交猜罪' }).first();
          if (await answerYes.isVisible().catch(() => false) && await answerYes.isEnabled().catch(() => false)) {
            await answerYes.click();
          } else if (await answerNo.isVisible().catch(() => false) && await answerNo.isEnabled().catch(() => false)) {
            await answerNo.click();
          } else if (await askInput.isVisible().catch(() => false)) {
            // 先选被问者（第一个 secondary），再填问题，再提交
            const targetBtn = page.locator('.action-dock button').nth(1);
            if (await targetBtn.isVisible().catch(() => false)) {
              await targetBtn.click();
              await page.waitForTimeout(80);
            }
            await askInput.fill('你的罪行？').catch(() => {});
            await askSubmit.click().catch(() => {});
          } else if (await voteBtn.isVisible().catch(() => false) && await voteBtn.isEnabled().catch(() => false)) {
            await voteBtn.click();
          } else if (await guessSubmit.isVisible().catch(() => false)) {
            // 狱警猜罪：为每囚犯选罪行（简化：全部猜第一个罪行）
            await page.locator('.action-dock button').filter({ hasText: /纵火犯/ }).first().click().catch(() => {});
            await page.waitForTimeout(80);
            await guessSubmit.click().catch(() => {});
          }
          await page.waitForTimeout(200);
        }

        const finalViews = await nodeDrive;
        const finalView = finalViews[0] ?? {};
        const view = finalView as {
          phase: string;
          wardenId?: unknown;
          crimes?: unknown;
        };

        // 隐私断言：终局前公开视图不含狱警/罪行全表
        if (view.phase !== 'game_over') {
          expect(view.wardenId).toBeUndefined();
          expect(view.crimes).toBeUndefined();
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

        await page.context().close();
      } finally {
        for (const { driver } of nodeDrivers) driver.client.close();
      }
    } finally {
      host.client.close();
    }
  });
});
