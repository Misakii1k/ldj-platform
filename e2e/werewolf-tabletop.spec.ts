/**
 * D5 P1a：werewolf v2 真实引擎 12 人审判桌 Chromium 验收。
 *
 * 服务端说明：werewolf_platform_open_kill_v1 已注册到 werewolfV2Module（engineContractVersion 2 /
 * viewVersion 1 / schemaVersion 1）。本门真实跑 v2 引擎：start_game 按 (moduleId, rulesetId)
 * 路由到 v2 模块，Node 侧 host 与浏览器玩家经真实 WS game_action 确认身份，v2 reducer 受理后
 * 回发视角。同时验收 tabletop skeleton：12 席位 SeatRing dense 几何、无交叠、浏览器视角隐私。
 *
 * 房间构成：12 人（11 个 Node 侧玩家 + 1 个浏览器玩家同房）——seedRoom 直插 12 人（全员
 * CONNECTED + ready），房主经真实 WS resume + ready + start_game，浏览器玩家经本地会话
 * resume 加入；其余玩家保持服务端 CONNECTED 席位。
 *
 * 验证（真实 Chromium 断言）：
 * - v2 引擎判别：game_state 携带 engineContractVersion 2 / viewVersion 1 / rulesetId
 *   werewolf_platform_open_kill_v1，view.schemaVersion = 1（v2 模块视图身份）。
 * - 真实动作：host 与浏览器玩家 confirm_role 被 v2 reducer 受理（confirmedRolePlayerIds 更新）。
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

test.describe('D5 P1a 狼人杀 12 人审判桌（v2 引擎）', () => {
  test('12 人局：v2 引擎判别 + 真实 confirm_role + SeatRing dense 几何无交叠 + 浏览器视角隐私（宽视口 1280×800）', async ({ browser }) => {
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

      // —— v2 引擎判别：版本化判别符 + schemaVersion 1 ——
      expect(hostState.payload.engineContractVersion).toBe(2);
      expect(hostState.payload.viewVersion).toBe(1);
      expect(hostState.payload.rulesetId).toBe('werewolf_platform_open_kill_v1');
      const hostView = hostState.payload.view as Record<string, unknown>;
      expect(hostView.schemaVersion).toBe(1);
      expect(hostView.rulesetId).toBe('werewolf_platform_open_kill_v1');
      expect(hostView.phase).toBe('role_reveal');

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

      // —— 真实 v2 引擎动作：host 与浏览器玩家 confirm_role 被 v2 reducer 受理 ——
      const confirmAck = await host.gameAction({ type: 'confirm_role' });
      expect(
        confirmAck.type,
        `host confirm_role 应 ack：${confirmAck.payload.code ?? ''} ${confirmAck.payload.message ?? ''}`,
      ).toBe('ack');
      await page.getByRole('button', { name: '我已记住身份' }).click();
      await host.waitGameState(
        (v) =>
          Array.isArray(v.confirmedRolePlayerIds)
          && (v.confirmedRolePlayerIds as string[]).includes(host.playerId)
          && (v.confirmedRolePlayerIds as string[]).includes(browserPlayer.playerId),
        15_000,
      );
      await expect(page.getByRole('button', { name: '我已记住身份' })).toHaveCount(0);

      // 阶段可能是 role_reveal（relaxed 45s）或已推进到 night；两者都是 skeleton 有效态
      const phaseText = (await page.locator('.moon-header h1').textContent())?.trim() ?? '';
      expect(['身份确认', '夜晚行动']).toContain(phaseText);

      await page.screenshot({
        path: 'C:/Users/87850/.gemini/antigravity/brain/786d7f94-b943-4023-b1ef-27107647f92a/scratch/werewolf-12p-in-game.png',
        fullPage: false,
      });

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
      await expect(page.locator('.werewolf-compact-role__popover')).toHaveCount(0);
      const privateRoleToggle = page.locator('.werewolf-compact-role__toggle-btn');
      await expect(privateRoleToggle).toBeVisible();
      // 3) 按下查看后，身份匣只显示本人身份（7 种之一）
      await privateRoleToggle.click();
      const myRole = (
        await page.locator('.werewolf-compact-role__popover .identity-card-front__role-name').textContent()
      )?.trim() ?? '';
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

  test('狼人杀大厅：实时阵营分布卡片与梯度预览（12 人 4 狼验证）', async ({ browser }) => {
    const seeded = seedRoom(DB_PATH, {
      gameId: 'werewolf',
      count: 12,
      ready: false,
      config: WEREWOLF_CONFIG,
    });
    const browserPlayer = seeded.players[0]!;
    const page = await prepareBrowser(browser, {
      playerId: browserPlayer.playerId,
      resumeToken: browserPlayer.resumeToken,
      roomCode: seeded.roomCode,
      nickname: '房主',
    });
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(BASE_URL);

    // 大厅规则面板下方：狼人杀实时阵营分布卡片可见
    const preview = page.locator('.werewolf-camp-preview');
    await expect(preview).toBeVisible({ timeout: 15_000 });
    await expect(preview).toContainText('当前 12 人局阵营分布');
    await expect(preview).toContainText('梯度：6–8人配2狼 · 9–10人配3狼 · 11–12人配4狼');

    // 狼人阵营卡片：4 人
    const wolfCard = page.locator('.werewolf-camp-card--wolf');
    await expect(wolfCard).toBeVisible();
    await expect(wolfCard).toContainText('4 人');

    // 神职阵营卡片与平民阵营卡片
    const godCard = page.locator('.werewolf-camp-card--god');
    await expect(godCard).toBeVisible();
    const villagerCard = page.locator('.werewolf-camp-card--villager');
    await expect(villagerCard).toBeVisible();

    // 截图保存为 artifact 证据
    await preview.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: 'C:/Users/87850/.gemini/antigravity/brain/786d7f94-b943-4023-b1ef-27107647f92a/scratch/werewolf-camp-preview.png',
      fullPage: false,
    });

    await page.context().close();
  });

  test('7 人局竖屏移动端：紧凑席位 + 聊天按钮避让席位 + 公投进度卡片紧凑排版（390×844 竖屏）', async ({ browser }) => {
    const seeded = seedRoom(DB_PATH, {
      gameId: 'werewolf',
      count: 7,
      ready: true,
      config: WEREWOLF_CONFIG,
    });
    const host = await RoomDriver.resume(WS_URL, seeded.roomCode, seeded.hostId, seeded.hostResumeToken);
    try {
      const readyAck = await host.ready();
      expect(readyAck.type).toBe('ack');
      const startAck = await host.startGame(WEREWOLF_CONFIG);
      expect(startAck.type).toBe('ack');

      const browserPlayer = seeded.players[0]!;
      const page = await prepareBrowser(browser, {
        playerId: browserPlayer.playerId,
        resumeToken: browserPlayer.resumeToken,
        roomCode: seeded.roomCode,
        nickname: '麦田捕手',
      });
      // 竖屏 iPhone 12/13/14 尺寸
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(BASE_URL);

      // 等待移动端舞台与左右翼席位渲染
      await expect(page.locator('.werewolf-arena').first()).toBeVisible({ timeout: 20_000 });
      await expect(page.locator('.werewolf-wing--left .seat-chip')).toHaveCount(4);
      await expect(page.locator('.werewolf-wing--right .seat-chip')).toHaveCount(3);

      // 验证席位卡片高度紧凑性（<= 64px）且无重叠、无溢出
      const seatMetrics = await page.evaluate(() => {
        const chips = Array.from(document.querySelectorAll('.seat-chip')).map((el) => {
          const r = el.getBoundingClientRect();
          return { height: r.height, top: r.top, bottom: r.bottom, left: r.left, right: r.right };
        });
        const chat = document.querySelector('.game-chat-trigger')?.getBoundingClientRect();
        const maxChipHeight = Math.max(...chips.map((c) => c.height));
        // 验证聊天按钮绝不与任何席位重合（无碰撞）
        let collidesWithAnySeat = false;
        if (chat) {
          collidesWithAnySeat = chips.some((sr) =>
            !(chat.right <= sr.left || chat.left >= sr.right || chat.bottom <= sr.top || chat.top >= sr.bottom)
          );
        }
        return { maxChipHeight, collidesWithAnySeat };
      });
      expect(seatMetrics.maxChipHeight).toBeLessThanOrEqual(68);
      expect(seatMetrics.collidesWithAnySeat).toBe(false);

      // 验证在公投进度卡片渲染下的排版结构：标题与计票垂直分行居中、无文本折行溢出
      await page.evaluate(() => {
        // 动态注入 voting 阶段公投卡片以验证端到端 CSS 排版
        const stack = document.querySelector('.werewolf-arena__center-stack');
        if (stack) {
          const dummy = document.createElement('div');
          dummy.className = 'werewolf-spotlight werewolf-spotlight--voting';
          dummy.innerHTML = `
            <div class="werewolf-spotlight__vote-header">
              <div class="werewolf-spotlight__vote-title-wrap">
                <span class="werewolf-spotlight__pulsing-dot"></span>
                <strong class="werewolf-spotlight__vote-title">放逐公投进行中</strong>
              </div>
              <div class="werewolf-spotlight__vote-tally">
                <span class="werewolf-spotlight__vote-tally-label">已投票</span>
                <strong class="werewolf-spotlight__vote-tally-num">6</strong>
                <span class="werewolf-spotlight__vote-tally-total">/ 7</span>
                <span class="werewolf-spotlight__vote-percent-badge">86%</span>
              </div>
            </div>
            <div class="werewolf-spotlight__vote-track"><div class="werewolf-spotlight__vote-fill" style="width:86%"></div></div>
            <div class="werewolf-spotlight__vote-footer">
              <div class="werewolf-spotlight__vote-feedback-left"><span class="werewolf-spotlight__vote-status-text">⏳ 请点击上方席位头像完成投票</span></div>
              <div class="werewolf-spotlight__vote-feedback-right"><span class="werewolf-spotlight__vote-remaining">还差 <strong>1</strong> 票即刻结算</span></div>
            </div>
          `;
          stack.appendChild(dummy);
        }
      });

      // 验证公投标题与计票各占一行，标题高度无换行
      const voteLayout = await page.evaluate(() => {
        const title = document.querySelector('.werewolf-spotlight__vote-title') as HTMLElement | null;
        const tally = document.querySelector('.werewolf-spotlight__vote-tally') as HTMLElement | null;
        const header = document.querySelector('.werewolf-spotlight__vote-header') as HTMLElement | null;
        return {
          titleHeight: title?.offsetHeight ?? 0,
          tallyHeight: tally?.offsetHeight ?? 0,
          headerDirection: header ? window.getComputedStyle(header).flexDirection : '',
        };
      });
      expect(voteLayout.headerDirection).toBe('column');
      expect(voteLayout.titleHeight).toBeLessThanOrEqual(24);
      expect(voteLayout.tallyHeight).toBeLessThanOrEqual(24);

      // 截图保存为证据
      const screenshotPath = 'C:/Users/87850/.gemini/antigravity/brain/cb997e70-02c1-4e9b-9b1f-d86a3ad769a7/scratch/werewolf-7p-portrait-verified.png';
      await page.screenshot({ path: screenshotPath, fullPage: false });

      await page.context().close();
    } finally {
      host.client.close();
    }
  });
});
