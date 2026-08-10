/**
 * D7-C durian_orchard_v1 完整局 Chromium 验收（botSupport none：全部由 Node + 浏览器真实驱动）。
 * 2 人局：房主（Node）与浏览器玩家交替接单/按铃/裁定，直到牌堆耗尽或处罚 7 触发终局，
 * 服务端产出正式战绩；同时断言浏览器视角的隐私（本人库存隐藏、中央库存不入视图）。
 */
import { test, expect, type Browser, type Page } from '@playwright/test';
import { seedRoom } from './helpers/dbClient.ts';
import { RoomDriver } from './helpers/wsClient.ts';
import { BASE_URL, DB_PATH, ME_STORAGE_KEY, WS_URL } from './helpers/serverEnv.ts';

const safeOrder = (id: string) => ({
  id,
  options: [
    { fruit: 'amber_pear', quantity: 1 },
    { fruit: 'cloud_berry', quantity: 1 },
  ],
  staffEvent: 'mixed_crate',
});

const DURIAN_CONFIG = {
  rulesetId: 'durian_orchard_v1',
  orderDeck: ['one', 'two', 'three', 'four'].map(safeOrder),
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

/** Node 侧房主策略：接单选 0、按铃、裁定，直到终局；返回最后一个视角供隐私断言。 */
async function driveHost(
  host: RoomDriver,
  hostId: string,
): Promise<Record<string, unknown>> {
  let lastView: Record<string, unknown> = {};
  let actedSignature = '';
  for (let step = 0; step < 240; step += 1) {
    // 轮询最新权威状态（不按序消费旧帧），避免满负荷下读到过期回合造成竞态。
    const frame = host.client.latestGameState((v) => v.gameId === 'durian');
    if (frame) lastView = frame.payload.view as Record<string, unknown>;
    const view = lastView as {
      phase: string;
      currentPlayerId: string | null;
      bell: { status: string } | null;
    };
    if (view.phase === 'game_over') return lastView;
    const signature = JSON.stringify({ phase: view.phase, current: view.currentPlayerId, bell: view.bell?.status ?? null });
    if (signature === actedSignature) {
      await new Promise((resolve) => setTimeout(resolve, 200));
      continue;
    }
    let acted = false;
    if (view.phase === 'ordering' && view.currentPlayerId === hostId) {
      await host.gameAction({ type: 'submit_order', playerId: hostId, optionIndex: 0 });
      acted = true;
    } else if (view.phase === 'buzzer' && view.bell?.status === 'open' && view.currentPlayerId !== hostId) {
      await host.gameAction({ type: 'ring_bell', playerId: hostId });
      acted = true;
    } else if (view.phase === 'buzzer' && view.bell?.status === 'locked' && view.currentPlayerId === hostId) {
      await host.gameAction({ type: 'resolve_bell', playerId: hostId });
      acted = true;
    }
    if (acted) actedSignature = signature;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  return lastView;
}

test.describe('D7-C durian 完整局', () => {
  test('2 人完整局：真实 WS 交替动作 + 浏览器渲染 + 隐私断言 + 服务端战绩', async ({ browser }) => {
    test.setTimeout(240_000);
    const seeded = seedRoom(DB_PATH, { gameId: 'durian', count: 2, ready: true, config: DURIAN_CONFIG });
    const host = await RoomDriver.resume(WS_URL, seeded.roomCode, seeded.hostId, seeded.hostResumeToken);
    try {
      const readyAck = await host.ready();
      expect(readyAck.type).toBe('ack');
      const startAck = await host.startGame(DURIAN_CONFIG);
      expect(startAck.type, `start_game 应 ack：${JSON.stringify(startAck.payload)}`).toBe('ack');

      const browserPlayer = seeded.players[1]!;
      const page = await openBrowser(browser, {
        playerId: browserPlayer.playerId,
        resumeToken: browserPlayer.resumeToken,
        roomCode: seeded.roomCode,
        nickname: '玩家2',
      });

      // 渲染：表壳 + 订单区 + 本人库存隐藏标记
      await expect(page.locator('.durian-order')).toBeVisible();
      await expect(page.getByText('其他玩家的库存（自己的已隐藏）')).toBeVisible();

      // 房主（Node）并行驱动自己的回合；浏览器驱动自己的回合
      const hostDrive = driveHost(host, seeded.hostId);

      // 浏览器策略：交替接单/按铃/裁定，直到终局（客户端终局后切回房间页）
      const deadline = Date.now() + 200_000;
      while (Date.now() < deadline) {
        if (await page.locator('.durian-over').isVisible().catch(() => false)) break;
        if (await page.locator('.room-page').isVisible().catch(() => false)) break;
        const submitBtn = page.getByRole('button', { name: /^接单 · / }).first();
        const ringBtn = page.getByRole('button', { name: '按铃抢单' }).first();
        const resolveBtn = page.getByRole('button', { name: '裁定本次按铃' }).first();
        const closeBtn = page.getByRole('button', { name: '关闭按铃窗口' }).first();
        if (await submitBtn.isVisible().catch(() => false) && await submitBtn.isEnabled().catch(() => false)) {
          await submitBtn.click();
        } else if (await ringBtn.isVisible().catch(() => false) && await ringBtn.isEnabled().catch(() => false)) {
          await ringBtn.click();
        } else if (await resolveBtn.isVisible().catch(() => false) && await resolveBtn.isEnabled().catch(() => false)) {
          await resolveBtn.click();
        } else if (await closeBtn.isVisible().catch(() => false) && await closeBtn.isEnabled().catch(() => false)) {
          await closeBtn.click();
        }
        await page.waitForTimeout(200);
      }

      // 终局信号：房间页显示对局已结算（POST_GAME 客户端切回大厅）
      await expect(page.getByText('对局已结算').first()).toBeVisible({ timeout: 30_000 });
      const finalView = await hostDrive;

      // 隐私断言：本人库存隐藏、中央库存与权威库存不出现在任何视图
      const view = finalView as {
        me: { ownInventoryHidden: boolean } | null;
        centralInventory?: unknown;
        stock?: unknown;
        inventory?: unknown;
      };
      expect(view.me?.ownInventoryHidden).toBe(true);
      expect(view.centralInventory).toBeUndefined();
      expect(view.stock).toBeUndefined();
      expect(view.inventory).toBeUndefined();

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
