/**
 * 「游戏内悬浮控制坞」斗地主（Landlord）固定截图组采集测试脚本。
 *
 * 验收目标：
 * - 坞 `.ldj-session-dock` 在斗地主对局内常驻可见；
 * - 斗地主 `sessionHasOwnMenu=false`，「设置」按钮常驻；
 * - 点击「收起顶栏」后 body 挂 `ldj-chrome-collapsed`，坞仍可见；
 * - 再点击「展开顶栏」恢复原状。
 *
 * mock WebSocket 模式与 fixture 完整复用 e2e/cards-trio-capture.spec.ts 的斗地主段
 * （rulesetId landlord_platform_v1、3 名真实昵称成员、bidding / playing 关键时刻 view）。
 *
 * 目标目录：docs/superpowers/reports/2026-09-29-immersive-dock/baseline/
 * （可用环境变量 DOCK_SHOTS_OUT 覆盖，语义同 CARDS_TRIO_OUT）
 * 文件名：landlord-dock-<moment>-<state>-<宽x高>.png
 *   moment ∈ bidding / playing；state ∈ expanded / collapsed
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

// 辅助：建立 mock WebSocket 并返回 activeWs 发送器（与 cards-trio-capture.spec.ts 同构）
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

  // 必须在 page.goto 之前注册
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

test.describe('悬浮控制坞 (Immersive Dock) 截图组', () => {
  test('斗地主 (Landlord) 悬浮坞：展开 / 收起 × 桌面 / 手机横屏', async ({ page }) => {
    test.setTimeout(90_000);

    const members = [
      { playerId: 'p1', nickname: '小鱼干', seat: 1 },
      { playerId: 'p2', nickname: '阿杰', seat: 2 },
      { playerId: 'p3', nickname: '可可', seat: 3 },
    ];

    // 契约 §6 fixture（同 cards-trio landlord 段）:
    // 17 张：大王 2♠ A♦ Q♣ J♥ 10♠ 8♠ 8♥ 8♣ 8♦ 7♦ 6♣ 5♥ 4♣ 4♦ 3♠ 3♥
    const hand17 = [
      { id: 'c1', rank: 'BJ' as const },
      { id: 'c2', rank: '2' as const, suit: 'spades' as const },
      { id: 'c3', rank: 'A' as const, suit: 'diamonds' as const },
      { id: 'c4', rank: 'Q' as const, suit: 'clubs' as const },
      { id: 'c5', rank: 'J' as const, suit: 'hearts' as const },
      { id: 'c6', rank: '10' as const, suit: 'spades' as const },
      { id: 'c7', rank: '8' as const, suit: 'spades' as const },
      { id: 'c8', rank: '8' as const, suit: 'hearts' as const },
      { id: 'c9', rank: '8' as const, suit: 'clubs' as const },
      { id: 'c10', rank: '8' as const, suit: 'diamonds' as const },
      { id: 'c11', rank: '7' as const, suit: 'diamonds' as const },
      { id: 'c12', rank: '6' as const, suit: 'clubs' as const },
      { id: 'c13', rank: '5' as const, suit: 'hearts' as const },
      { id: 'c14', rank: '4' as const, suit: 'clubs' as const },
      { id: 'c15', rank: '4' as const, suit: 'diamonds' as const },
      { id: 'c16', rank: '3' as const, suit: 'spades' as const },
      { id: 'c17', rank: '3' as const, suit: 'hearts' as const },
    ];

    const bottomCards = [
      { id: 'b1', rank: 'A' as const, suit: 'spades' as const },
      { id: 'b2', rank: '2' as const, suit: 'hearts' as const },
      { id: 'b3', rank: 'SJ' as const },
    ];

    const hand20 = [...hand17, ...bottomCards];

    // moment 1 —— 叫地主（轮到你，阿杰叫 1 分、可可不叫）
    const bidView = {
      gameId: 'landlord' as const,
      rulesetId: 'landlord_platform_v1' as const,
      schemaVersion: 1 as const,
      phase: 'bidding' as const,
      players: [
        { playerId: 'p1', handCount: 17 },
        { playerId: 'p2', handCount: 17 },
        { playerId: 'p3', handCount: 17 },
      ],
      bottomCards: [],
      bids: [
        { playerId: 'p2', score: 1 as const },
        { playerId: 'p3', score: 0 as const },
      ],
      currentBidderId: 'p1',
      landlordId: null,
      currentPlayerId: null,
      currentTrick: null,
      passCount: 0,
      multiplier: 1,
      winnerTeam: null,
      winnerId: null,
      deadlineAt: Date.now() + 20_000,
      aborted: false,
      me: {
        playerId: 'p1',
        hand: hand17,
      },
    };

    // moment 2 —— 出牌中（你是地主，上家阿杰出对 K，同 cards-trio 的 play 帧）
    const hand14 = hand20.slice(0, 14);
    const playView = {
      ...bidView,
      phase: 'playing' as const,
      landlordId: 'p1',
      currentPlayerId: 'p1',
      bottomCards,
      multiplier: 3,
      bids: [
        { playerId: 'p2', score: 1 as const },
        { playerId: 'p3', score: 0 as const },
        { playerId: 'p1', score: 3 as const },
      ],
      currentTrick: {
        playerId: 'p2',
        combo: {
          type: 'pair',
          mainRank: 13,
          length: 2,
          cards: [
            { id: 'k1', rank: 'K', suit: 'spades' },
            { id: 'k2', rank: 'K', suit: 'hearts' },
          ],
        },
      },
      players: [
        { playerId: 'p1', handCount: 14 },
        { playerId: 'p2', handCount: 9 },
        { playerId: 'p3', handCount: 7 },
      ],
      me: {
        playerId: 'p1',
        hand: hand14,
      },
    };

    const mock = await setupMockGame(page, {
      gameId: 'landlord',
      roomCode: 'LAND01',
      rulesetId: 'landlord_platform_v1',
      members,
      initialView: bidView,
    });

    await page.goto(BASE_URL);
    await expect(page.locator('.landlord-teahouse')).toBeVisible({ timeout: 20_000 });

    const dock = page.locator('.ldj-session-dock');
    // aria-label 精确匹配，避免与「展开顶栏」/全屏按钮混淆
    const settingsBtn = page.getByRole('button', { name: '打开设置与房间菜单', exact: true });
    const collapseBtn = page.getByRole('button', { name: '收起顶栏', exact: true });
    const expandBtn = page.getByRole('button', { name: '展开顶栏', exact: true });

    // 单个 (moment, 视口) 上完成 expanded → collapsed → 恢复 的完整循环并各截一张
    const captureDockStates = async (moment: string, width: number, height: number) => {
      await page.setViewportSize({ width, height });
      await page.waitForTimeout(400); // 等动画静止（同 cards-trio 的等待方式）

      // ---- expanded 常态 ----
      // 机器门：坞可见；landlord（sessionHasOwnMenu=false）下设置按钮常驻可见
      await expect(dock).toBeVisible();
      await expect(dock).toHaveAttribute('data-collapsed', 'false');
      await expect(settingsBtn).toBeVisible();
      await expect(page.locator('body')).not.toHaveClass(/ldj-chrome-collapsed/);
      await page.screenshot({
        path: path.join(SHOTS_DIR, `landlord-dock-${moment}-expanded-${width}x${height}.png`),
        fullPage: false,
      });

      // ---- collapsed：点击「收起顶栏」 ----
      await expect(collapseBtn).toBeVisible();
      await collapseBtn.click();
      await page.waitForTimeout(400); // 等收起动画与按钮过渡（.14s）静止
      // 机器门：body 挂收起类、容器 data-collapsed=true、按钮 aria-pressed=true，坞与茶馆外壳仍可见（无布局破坏）
      await expect(page.locator('body')).toHaveClass(/ldj-chrome-collapsed/);
      await expect(dock).toBeVisible();
      await expect(dock).toHaveAttribute('data-collapsed', 'true');
      await expect(expandBtn).toHaveAttribute('aria-pressed', 'true');
      await expect(page.locator('.landlord-teahouse')).toBeVisible();
      await page.screenshot({
        path: path.join(SHOTS_DIR, `landlord-dock-${moment}-collapsed-${width}x${height}.png`),
        fullPage: false,
      });

      // ---- 恢复：再点击「展开顶栏」 ----
      await expandBtn.click();
      await page.waitForTimeout(400);
      await expect(page.locator('body')).not.toHaveClass(/ldj-chrome-collapsed/);
      await expect(dock).toHaveAttribute('data-collapsed', 'false');
      await expect(collapseBtn).toHaveAttribute('aria-pressed', 'false');
      await expect(settingsBtn).toBeVisible();
    };

    // moment 1：bidding × 1280x800 / 844x390
    await captureDockStates('bidding', 1280, 800);
    await captureDockStates('bidding', 844, 390);

    // moment 2：playing × 1280x800 / 844x390
    mock.sendView(playView);
    await page.waitForTimeout(400); // 等出牌区与手牌动画静止
    await captureDockStates('playing', 1280, 800);
    await captureDockStates('playing', 844, 390);
  });
});
