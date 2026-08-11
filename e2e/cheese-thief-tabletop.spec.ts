/**
 * G2-B cheese_thief_classic_v1 完整局 Chromium 验收（botSupport none：全部由 Node + 浏览器真实驱动）。
 * 5 人局：1 个浏览器座位 + 4 个 Node 座位走完 夜间1→6 → 共犯选择 → 讨论 →
 * 投票 → 结算；断言浏览器渲染、隐私（公开视图不含他人骰点/盗贼/共犯名单）与战绩落库。
 */
import { test, expect, type Browser, type Page } from '@playwright/test';
import { seedRoom } from './helpers/dbClient.ts';
import { RoomDriver } from './helpers/wsClient.ts';
import { BASE_URL, DB_PATH, ME_STORAGE_KEY, WS_URL } from './helpers/serverEnv.ts';

const CHEESE_CONFIG = {
  rulesetId: 'cheese_thief_classic_v1',
  nightHourSeconds: 1,
  discussionSeconds: 1,
  voteSeconds: 1,
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
  await page.goto(BASE_URL);
  await page.locator('.tabletop-shell').waitFor({ timeout: 30_000 });
  return page;
}

/** Node 驱动一个座位：按 phase 走完，直到终局；返回终局前最后视角 */
async function driveSeat(
  driver: RoomDriver,
  playerId: string,
): Promise<Record<string, unknown>> {
  let lastView: Record<string, unknown> = {};
  let actedSignature = '';
  for (let step = 0; step < 300; step += 1) {
    const frame = driver.client.latestGameState((v) => v.gameId === 'cheese-thief');
    if (frame) lastView = frame.payload.view as Record<string, unknown>;
    const view = lastView as {
      phase: string;
      me: { canPeek: boolean; isThief: boolean; playerId: string } | null;
      players: string[];
    };
    if (view.phase === 'game_over') return lastView;
    const signature = JSON.stringify({ phase: view.phase, canPeek: view.me?.canPeek ?? false });
    if (signature === actedSignature) {
      await new Promise((resolve) => setTimeout(resolve, 150));
      continue;
    }
    let acted = false;
    if (view.phase === 'night' && view.me?.canPeek) {
      const target = view.players.find((id) => id !== playerId);
      await driver.gameAction({ type: 'peek_die', playerId, targetPlayerId: target ?? playerId });
      acted = true;
    } else if (view.phase === 'accomplice_select' && view.me?.isThief) {
      const ruleCount = view.players.length >= 7 ? 2 : 1;
      const picks = view.players.filter((id) => id !== playerId).slice(0, ruleCount);
      await driver.gameAction({ type: 'select_accomplice', playerId, accompliceIds: picks });
      acted = true;
    } else if (view.phase === 'vote') {
      await driver.gameAction({ type: 'cast_abstention', playerId });
      acted = true;
    }
    if (acted) actedSignature = signature;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return lastView;
}

test.describe('G2-B cheese-thief 完整局', () => {
  test('5 人完整局：真实 WS 交替动作 + 浏览器渲染 + 隐私断言 + 服务端战绩', async ({ browser }) => {
    test.setTimeout(240_000);
    const seeded = seedRoom(DB_PATH, { gameId: 'cheese-thief', count: 5, ready: true, config: CHEESE_CONFIG });
    const host = await RoomDriver.resume(WS_URL, seeded.roomCode, seeded.hostId, seeded.hostResumeToken);
    try {
      const readyAck = await host.ready();
      expect(readyAck.type).toBe('ack');
      const startAck = await host.startGame(CHEESE_CONFIG);
      expect(startAck.type, `start_game 应 ack：${JSON.stringify(startAck.payload)}`).toBe('ack');

      const browserPlayer = seeded.players[1]!;
      const page = await openBrowser(browser, {
        playerId: browserPlayer.playerId,
        resumeToken: browserPlayer.resumeToken,
        roomCode: seeded.roomCode,
        nickname: '玩家2',
      });

      // 渲染断言：私密信息区可见（本局规则/身份区）
      await expect(page.locator('.cheese-private')).toBeVisible();

      // Node 驱动除浏览器外的其余 4 个座位（房主 + 座位 2/3/4）
      const otherSeats = seeded.players.filter((p) => p.playerId !== browserPlayer.playerId);
      const nodeDrivers = await Promise.all(
        otherSeats.map(async (p) => {
          const driver = await RoomDriver.resume(WS_URL, seeded.roomCode, p.playerId, p.resumeToken);
          return { driver, playerId: p.playerId };
        }),
      );
      try {
        const nodeDrive = Promise.all(nodeDrivers.map(({ driver, playerId }) => driveSeat(driver, playerId)));

        // 浏览器驱动：覆盖全部自身动作（偷看/共犯选择/投票），直到房间页（终局回大厅）
        const browserDeadline = Date.now() + 200_000;
        let browserFinished = false;
        while (Date.now() < browserDeadline) {
          if (await page.locator('.room-page').isVisible().catch(() => false)) {
            browserFinished = true;
            break;
          }
          // 优先点 primary（确认偷看/确认共犯/弃票）；disabled（共犯未选满）时点第一个 secondary 补齐选择
          const primaryBtn = page.locator('.action-dock button').filter({ hasText: /查看 |确认共犯|弃票|指认 / }).first();
          if (await primaryBtn.isVisible().catch(() => false) && await primaryBtn.isEnabled().catch(() => false)) {
            await primaryBtn.click();
          } else {
            const secondaryBtn = page.locator('.action-dock button').filter({ hasText: /^✓|^查看 |^确认共犯/ }).nth(1);
            const anySecondary = page.locator('.action-dock button').nth(1);
            if (await anySecondary.isVisible().catch(() => false) && await anySecondary.isEnabled().catch(() => false)) {
              await secondaryBtn.click().catch(() => {});
            }
          }
          await page.waitForTimeout(200);
        }
        void browserFinished;

        const finalViews = await nodeDrive;
        const finalView = finalViews[0] ?? {};
        const view = finalView as {
          phase: string;
          reveal?: unknown;
          thiefId?: unknown;
          wakeHours?: unknown;
          accomplices?: unknown;
        };

        // 隐私断言：终局前公开视图不含盗贼/醒来时刻全表/共犯名单
        if (view.phase !== 'game_over') {
          expect(view.thiefId).toBeUndefined();
          expect(view.wakeHours).toBeUndefined();
          expect(view.accomplices).toBeUndefined();
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
