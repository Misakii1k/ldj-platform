/**
 * 游戏内悬浮控制坞（immersive dock）截图验收 — Ding（bell-clash 真实联机版）。
 *
 * 验收点：
 * - 坞 `.ldj-session-dock` 常驻可见；真实联机版（rulesetId=bell_clash_v1，非 sim）
 *   sessionHasOwnMenu=false，设置按钮（aria-label「打开设置与房间菜单」）常驻。
 * - 点击「收起顶栏」后 body 加 `ldj-chrome-collapsed`，`.pt-top-bar` 隐藏、舞台撑开，
 *   坞仍可见；再点「展开顶栏」恢复。
 * - 视口 1280x800 与 390x844 各截 expanded / collapsed 两态。
 *
 * 目标目录：docs/superpowers/reports/2026-09-29-immersive-dock/baseline/
 * （可用环境变量 DOCK_SHOTS_OUT 覆盖）
 * 文件名：ding-dock-<moment>-<state>-<宽x高>.png
 */
import { test, expect, type Page } from '@playwright/test';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { BASE_URL, seedBrowserSession } from './helpers/serverEnv.ts';

const SHOTS_DIR = process.env.DOCK_SHOTS_OUT
  ? path.resolve(process.cwd(), process.env.DOCK_SHOTS_OUT)
  : path.resolve(process.cwd(), 'docs/superpowers/reports/2026-09-29-immersive-dock/baseline');

test.beforeAll(() => {
  if (!fs.existsSync(SHOTS_DIR)) {
    fs.mkdirSync(SHOTS_DIR, { recursive: true });
  }
});

// 辅助：建立 mock WebSocket 并返回 activeWs 发送器（与 cards-trio-capture.spec.ts 同一模式）
async function setupMockGame(page: Page, options: {
  gameId: string;
  roomCode: string;
  rulesetId: string;
  members: { playerId: string; nickname: string; seat: number; ready?: boolean }[];
  initialView: Record<string, unknown>;
  viewVersion?: number;
}) {
  let activeWs: { send(data: string): void } | null = null;

  const me = options.members[0]!;
  await seedBrowserSession(page, {
    roomId: `room-${options.gameId}-shots`,
    roomCode: options.roomCode,
    playerId: me.playerId,
    resumeToken: 'test-resume-token',
    nickname: me.nickname,
  });

  const wrapGameState = (view: Record<string, unknown>) => ({
    v: 1,
    type: 'game_state',
    roomSeq: 2,
    serverNow: Date.now(),
    payload: {
      sessionId: `sess_${options.gameId}_1`,
      moduleId: options.gameId,
      status: 'IN_GAME',
      role: 'player',
      rulesetId: options.rulesetId,
      engineContractVersion: 2,
      viewVersion: options.viewVersion ?? 1,
      view,
    },
  });

  // 必须在 page.goto 之前注册，否则首连不会被拦截
  await page.routeWebSocket(/.*\/ws.*/, (ws) => {
    activeWs = ws;
    ws.send(
      JSON.stringify({
        v: 1,
        type: 'welcome',
        serverNow: Date.now(),
        payload: {
          protocolVersion: 1,
          connectionId: 'c_mock_dock',
          serverVersion: '0.4.0',
          llmAvailable: false,
        },
      }),
    );

    ws.onMessage((msg) => {
      const text = typeof msg === 'string' ? msg : msg.toString();
      try {
        const parsed = JSON.parse(text);
        if (parsed.type === 'resume_room') {
          ws.send(
            JSON.stringify({
              v: 1,
              type: 'ack',
              requestId: parsed.requestId,
              roomSeq: 1,
              serverNow: Date.now(),
              payload: { ok: true },
            }),
          );
          ws.send(
            JSON.stringify({
              v: 1,
              type: 'room_snapshot',
              roomSeq: 1,
              serverNow: Date.now(),
              payload: {
                roomCode: options.roomCode,
                status: 'IN_GAME',
                seq: 1,
                gameId: options.gameId,
                config: { rulesetId: options.rulesetId },
                members: options.members.map((m) => ({
                  ...m,
                  connectionStatus: 'CONNECTED',
                  ready: true,
                })),
              },
            }),
          );
          ws.send(JSON.stringify(wrapGameState(options.initialView)));
        }
      } catch {
        // ignore
      }
    });
  });

  return {
    sendView(view: Record<string, unknown>) {
      if (activeWs) {
        activeWs.send(JSON.stringify(wrapGameState(view)));
      }
    },
  };
}

test.describe('游戏内悬浮控制坞（immersive dock）验收', () => {
  test('Ding 真实联机版：坞常驻 + 收起/展开顶栏截图组', async ({ page }) => {
    test.setTimeout(90_000);

    // 6 席真实昵称（≥ 规则最低人数），与 cards-trio Ding 段一致
    const members = [
      { playerId: 'b1', nickname: '小鱼干', seat: 1 },
      { playerId: 'b2', nickname: 'Momo', seat: 2 },
      { playerId: 'b3', nickname: '糯米', seat: 3 },
      { playerId: 'b4', nickname: '老王', seat: 4 },
      { playerId: 'b5', nickname: '可可', seat: 5 },
      { playerId: 'b6', nickname: '阿杰', seat: 6 },
    ];

    // 契约 §6 fixture（复用 cards-trio Ding 段）：
    // 6 张 = 绿2 蓝5 绿「伸了一个懒腰」 红6 黄「双手抱胸」 蓝1
    const hand6 = [
      { kind: 'number' as const, color: 'green' as const, number: 2 },
      { kind: 'number' as const, color: 'blue' as const, number: 5 },
      { kind: 'phrase' as const, color: 'green' as const, phrase: '伸了一个懒腰' },
      { kind: 'number' as const, color: 'red' as const, number: 6 },
      { kind: 'phrase' as const, color: 'yellow' as const, phrase: '双手抱胸' },
      { kind: 'number' as const, color: 'blue' as const, number: 1 },
    ];

    // 真实联机版关键时刻 view：rulesetId=bell_clash_v1（非 bell_clash_sim_v1）
    const baseBellView = {
      gameId: 'bell-clash' as const,
      rulesetId: 'bell_clash_v1' as const,
      schemaVersion: 1 as const,
      phase: 'playing' as const,
      players: ['b1', 'b2', 'b3', 'b4', 'b5', 'b6'],
      handCounts: { b1: 6, b2: 7, b3: 5, b4: 8, b5: 6, b6: 4 },
      currentPlayerId: 'b6', // 轮到阿杰
      discardTop: { kind: 'number' as const, color: 'blue' as const, number: 4 },
      challenge: null,
      drawCount: 48,
      winners: [],
      deadlineAt: Date.now() + 20_000,
      deadlineKind: 'turn' as const,
      me: {
        playerId: 'b1',
        hand: hand6,
      },
    };

    const mock = await setupMockGame(page, {
      gameId: 'bell-clash',
      roomCode: 'DINGDOCK',
      rulesetId: 'bell_clash_v1',
      members,
      initialView: baseBellView,
    });

    await page.goto(BASE_URL);
    await expect(page.locator('.bc-game')).toBeVisible({ timeout: 20_000 });

    const dock = page.locator('.ldj-session-dock');
    const settingsBtn = page.getByRole('button', { name: '打开设置与房间菜单' });
    const collapseBtn = page.getByRole('button', { name: '收起顶栏' });
    const topBar = page.locator('.pt-top-bar');

    // 截图前等动画静止（沿用仓库固定截图组的 settle 约定）
    const settle = async () => {
      await page.waitForTimeout(450);
    };

    // 机器门：坞与常驻设置按钮（真实联机版 sessionHasOwnMenu=false → 设置常驻）
    await expect(dock).toBeVisible();
    await expect(dock).toHaveAttribute('data-collapsed', 'false');
    await expect(settingsBtn).toBeVisible();
    await expect(collapseBtn).toBeVisible();
    await expect(collapseBtn).toHaveAttribute('aria-pressed', 'false');
    await expect(topBar).toBeVisible();

    const VIEWPORTS = [
      { width: 1280, height: 800, tag: '1280x800' },
      { width: 390, height: 844, tag: '390x844' },
    ] as const;

    // 每个关键时刻 × 每视口：先截 expanded，再收起截 collapsed，最后展开恢复
    const captureMoment = async (moment: string) => {
      for (const vp of VIEWPORTS) {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await settle();

        // (a) 坞展开常态
        await page.screenshot({
          path: path.join(SHOTS_DIR, `ding-dock-${moment}-expanded-${vp.tag}.png`),
          fullPage: false,
        });

        // (b) 收起顶栏：body 加 ldj-chrome-collapsed，.pt-top-bar 必须隐藏，坞仍可见
        await collapseBtn.click();
        await expect(page.locator('body')).toHaveClass(/ldj-chrome-collapsed/);
        await expect(dock).toHaveAttribute('data-collapsed', 'true');
        await expect(topBar).toBeHidden();
        await expect(dock).toBeVisible();
        await expect(settingsBtn).toBeVisible();
        await settle();
        await page.screenshot({
          path: path.join(SHOTS_DIR, `ding-dock-${moment}-collapsed-${vp.tag}.png`),
          fullPage: false,
        });

        // 恢复：再点「展开顶栏」，顶栏回归、body 类移除
        const expandBtn = page.getByRole('button', { name: '展开顶栏' });
        await expect(expandBtn).toHaveAttribute('aria-pressed', 'true');
        await expandBtn.click();
        await expect(page.locator('body')).not.toHaveClass(/ldj-chrome-collapsed/);
        await expect(dock).toHaveAttribute('data-collapsed', 'false');
        await expect(topBar).toBeVisible();
        await settle();
      }
    };

    // 关键时刻 1：playing（轮到阿杰，顶牌蓝 4）
    await captureMoment('playing');

    // 关键时刻 2：challenge（质疑中：亮出「伸了一个懒腰」，5 票里 4 有 1 没做过）
    mock.sendView({
      ...baseBellView,
      challenge: {
        claimantId: 'b1',
        card: { kind: 'phrase', color: 'green', phrase: '伸了一个懒腰' },
        voterIds: ['b2', 'b3', 'b4', 'b5', 'b6'],
        doubtIds: ['b3'],
        confirmIds: ['b2', 'b4', 'b5', 'b6'],
      },
      deadlineAt: Date.now() + 20_000,
      deadlineKind: 'challenge',
    });
    // 帧确实被应用（而不是解析被拒后停在上一帧）
    await expect(page.locator('.bc-game')).toHaveClass(/is-challenging/);
    await captureMoment('challenge');
  });
});
