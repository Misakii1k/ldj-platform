/**
 * D4-UI3：狼人杀 12 人审判桌 skeleton 真实 Chromium 验收。
 *
 * 服务端说明：werewolf 服务端 registry 不修改。v2 未注册，采用已注册的 legacy
 * `werewolf_platform_open_kill_v1` 规则集（getSessionGameModule 可解析，start_game 成功链）。
 * 本门只验收 tabletop skeleton：12 席位 SeatRing dense 几何、无交叠、浏览器视角隐私。
 *
 * 房间构成：12 人（11 个 Node 侧玩家 + 1 个浏览器玩家同房）——seedRoom 直插 12 人（全员
 * CONNECTED + ready），房主经真实 WS resume + ready + start_game，浏览器玩家经本地会话
 * resume 加入；其余玩家保持服务端 CONNECTED 席位。
 *
 * 验证（真实 Chromium 断言）：
 * - SeatRing dense：`.seat-ring.is-dense`、`.seat-chip` 计数 12、aria-label 审判桌共 12 席位。
 * - 几何：席位中心两两距离 > 席位宽度（无交叠保证由 dense 半径公式给出），且全部位于环形内。
 * - 隐私：role_reveal 阶段无任何 `.seat-chip__role`（他人身份绝不进入 DOM）；页面唯一身份
 *   文本只出现在私密身份匣（浏览器本人）。
 */
import { test, expect, type Browser, type Page } from '@playwright/test';
import { seedRoom } from './helpers/dbClient.ts';
import { RoomDriver } from './helpers/wsClient.ts';
import { BASE_URL, DB_PATH, ME_STORAGE_KEY, WS_URL } from './helpers/serverEnv.ts';

const WEREWOLF_CONFIG = {
  rulesetId: 'werewolf_platform_open_kill_v1',
  preset: 'classic',
  pace: 'relaxed',
  witchSelfSave: 'first_night',
  winCondition: 'numbers',
} as const;

const ROLE_NAMES = ['狼人', '村民', '预言家', '女巫', '守卫', '猎人', '白痴'] as const;

interface BrowserMe {
  playerId: string;
  resumeToken: string;
  roomCode: string;
  nickname: string;
}

async function prepareBrowser(browser: Browser, me: BrowserMe): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.addInitScript(
    ([key, value]) => { localStorage.setItem(key, value); },
    [ME_STORAGE_KEY, JSON.stringify({ ...me, seatRole: 'player' })],
  );
  return page;
}

test.describe('D4-UI3 狼人杀 12 人审判桌', () => {
  test('12 人局：SeatRing dense 几何无交叠 + 浏览器视角隐私（宽视口 1280×800）', async ({ browser }) => {
    // 12 人房（11 Node 侧 + 1 浏览器同房）；房主经真实 WS 开局
    const seeded = seedRoom(DB_PATH, {
      gameId: 'werewolf',
      count: 12,
      ready: true,
      config: WEREWOLF_CONFIG,
    });
    const host = await RoomDriver.resume(WS_URL, seeded.roomCode, seeded.hostId, seeded.hostResumeToken);
    try {
      const readyAck = await host.ready();
      expect(readyAck.type, `ready 应 ack，收到：${readyAck.type} ${readyAck.payload.code ?? ''}`).toBe('ack');
      const startAck = await host.startGame(WEREWOLF_CONFIG);
      expect(
        startAck.type,
        `start_game 应 ack：${startAck.payload.code ?? ''} ${startAck.payload.message ?? ''}`,
      ).toBe('ack');
      const hostState = await host.waitGameState((v) => v.gameId === 'werewolf');
      expect(hostState.payload.role).toBe('player');
      expect((hostState.payload.view as { phase?: string }).phase).toBe('role_reveal');

      // 浏览器玩家加入
      const browserPlayer = seeded.players[1]!;
      const page = await prepareBrowser(browser, {
        playerId: browserPlayer.playerId,
        resumeToken: browserPlayer.resumeToken,
        roomCode: seeded.roomCode,
        nickname: '玩家2',
      });
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.goto(BASE_URL);

      // —— 渲染：dense 审判桌 12 席位 ——
      await expect(page.locator('.seat-ring').first()).toBeVisible({ timeout: 30_000 });
      await expect(page.locator('.seat-ring').first()).toHaveClass(/is-dense/);
      await expect(page.locator('.seat-ring').first()).toHaveAttribute('aria-label', '审判桌，共 12 个席位');
      await expect(page.locator('.seat-chip')).toHaveCount(12);
      await expect(page.getByText('12 人局').first()).toBeVisible();
      // 阶段可能是 role_reveal（relaxed 45s）或已推进到 night；两者都是 skeleton 有效态
      const phaseText = (await page.locator('.moon-header h1').textContent())?.trim() ?? '';
      expect(['身份确认', '夜晚行动']).toContain(phaseText);

      // —— 几何：席位中心两两距离 > 席位宽度（dense 公式保证），且全部位于环形内 ——
      const geometry = await page.evaluate(() => {
        const ring = document.querySelector('.seat-ring');
        const ringRect = ring?.getBoundingClientRect() ?? { left: 0, top: 0, width: 0, height: 0 };
        const chips = Array.from(document.querySelectorAll('.seat-chip')).map((el) => {
          const r = el.getBoundingClientRect();
          return {
            cx: r.left + r.width / 2,
            cy: r.top + r.height / 2,
            width: r.width,
            height: r.height,
            inside:
              r.left >= ringRect.left - 1
              && r.top >= ringRect.top - 1
              && r.right <= ringRect.right + 1
              && r.bottom <= ringRect.bottom + 1,
          };
        });
        let minCenterDistance = Number.POSITIVE_INFINITY;
        for (let i = 0; i < chips.length; i += 1) {
          for (let j = i + 1; j < chips.length; j += 1) {
            const d = Math.hypot(chips[i]!.cx - chips[j]!.cx, chips[i]!.cy - chips[j]!.cy);
            minCenterDistance = Math.min(minCenterDistance, d);
          }
        }
        const maxWidth = Math.max(...chips.map((c) => c.width));
        const allInside = chips.every((c) => c.inside);
        return { chipCount: chips.length, minCenterDistance, maxWidth, allInside };
      });
      expect(geometry.chipCount).toBe(12);
      expect(geometry.allInside).toBe(true);
      // dense 半径公式保证相邻席位中心弦距 ≥ 席位宽度 + 间隙；中心距必须大于席位宽度
      expect(geometry.minCenterDistance).toBeGreaterThan(geometry.maxWidth);

      // —— 浏览器视角隐私 ——
      // 1) 他人身份绝不进入 DOM：无任何已揭示身份标签（任何阶段、任何淘汰前）
      await expect(page.locator('.seat-chip__role')).toHaveCount(0);
      // 2) 本人身份默认隐藏（PrivatePanel 需显式按下查看）：身份卡初始不可见
      await expect(page.locator('.private-role-panel__card')).toHaveCount(0);
      await expect(page.getByRole('button', { name: '按下查看本人私密信息' })).toBeVisible();
      // 3) 按下查看后，身份匣只显示本人身份（7 种之一）
      await page.getByRole('button', { name: '按下查看本人私密信息' }).click();
      const myRole = (await page.locator('.private-role-panel__card strong').textContent())?.trim() ?? '';
      expect((ROLE_NAMES as readonly string[]).includes(myRole), `身份应属于合法集合，收到：${myRole}`).toBe(true);
      // 4) 席位卡绝不携带任何身份文本（身份只可能出现在身份匣）
      const seatTexts = await page.locator('.seat-chip').allInnerTexts();
      for (const text of seatTexts) {
        for (const role of ROLE_NAMES) {
          expect(text, `席位不应出现身份 ${role}`).not.toContain(role);
        }
      }

      await page.context().close();
    } finally {
      host.client.close();
    }
  });
});
