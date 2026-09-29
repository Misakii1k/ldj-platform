/**
 * 纸牌三姐妹（斗地主 / UNO / Ding）固定截图组采集测试脚本。
 *
 * 规范：contracts/landlord.md §6、contracts/uno.md §6、contracts/ding.md §6
 * 目标目录：docs/superpowers/reports/2026-08-15-game-ui-refresh/baseline/
 * 文件名：<game>-<画面>-<宽x高>.png
 */
import { test, expect, type Page } from '@playwright/test';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { BASE_URL, seedBrowserSession } from './helpers/serverEnv.ts';

const SHOTS_DIR = process.env.CARDS_TRIO_OUT
  ? path.resolve(process.cwd(), process.env.CARDS_TRIO_OUT)
  : path.resolve(process.cwd(), 'docs/superpowers/reports/2026-08-15-game-ui-refresh/baseline');

test.beforeAll(() => {
  if (!fs.existsSync(SHOTS_DIR)) {
    fs.mkdirSync(SHOTS_DIR, { recursive: true });
  }
});

// 辅助：建立 mock WebSocket 并返回 activeWs 发送器
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

  await page.routeWebSocket(/.*\/ws.*/, (ws) => {
    activeWs = ws;
    ws.send(
      JSON.stringify({
        v: 1,
        type: 'welcome',
        serverNow: Date.now(),
        payload: {
          protocolVersion: 1,
          connectionId: 'c_mock_trio',
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

test.describe('纸牌三姐妹固定截图组 (T7)', () => {
  test('斗地主 (Landlord) 截图组', async ({ page }) => {
    test.setTimeout(90_000);

    const members = [
      { playerId: 'p1', nickname: '小鱼干', seat: 1 },
      { playerId: 'p2', nickname: '阿杰', seat: 2 },
      { playerId: 'p3', nickname: '可可', seat: 3 },
    ];

    // 契约 §6 fixture:
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

    // ① 叫地主（轮到你，阿杰叫 1 分、可可不叫）
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

    const mock = await setupMockGame(page, {
      gameId: 'landlord',
      roomCode: 'LAND01',
      rulesetId: 'landlord_platform_v1',
      members,
      initialView: bidView,
    });

    await page.goto(BASE_URL);
    await expect(page.locator('.landlord-teahouse')).toBeVisible({ timeout: 20_000 });

    const captureLandlordVps = async (shotName: string) => {
      // 1280x800
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(SHOTS_DIR, `landlord-${shotName}-1280x800.png`), fullPage: false });

      // 844x390
      await page.setViewportSize({ width: 844, height: 390 });
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(SHOTS_DIR, `landlord-${shotName}-844x390.png`), fullPage: false });
    };

    // 1. bid
    await captureLandlordVps('bid');

    // 2. bid-decided (定地主后：你叫 3 分当地主，底牌 A♠ 2♥ 小王 已入手，20 张手牌)
    mock.sendView({
      ...bidView,
      phase: 'playing',
      landlordId: 'p1',
      currentPlayerId: 'p1',
      bottomCards,
      bids: [
        { playerId: 'p2', score: 1 },
        { playerId: 'p3', score: 0 },
        { playerId: 'p1', score: 3 },
      ],
      multiplier: 3,
      players: [
        { playerId: 'p1', handCount: 20 },
        { playerId: 'p2', handCount: 17 },
        { playerId: 'p3', handCount: 17 },
      ],
      me: {
        playerId: 'p1',
        hand: hand20,
      },
    });
    await captureLandlordVps('bid-decided');

    // 3. play (你是地主，上家阿杰出对 K)
    const hand14 = hand20.slice(0, 14);
    mock.sendView({
      ...bidView,
      phase: 'playing',
      landlordId: 'p1',
      currentPlayerId: 'p1',
      bottomCards,
      multiplier: 3,
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
    });
    await captureLandlordVps('play');

    // 4. play-bomb (你出炸弹 8888 之后)
    mock.sendView({
      ...bidView,
      phase: 'playing',
      landlordId: 'p1',
      currentPlayerId: 'p3',
      bottomCards,
      multiplier: 3,
      currentTrick: {
        playerId: 'p1',
        combo: {
          type: 'bomb',
          mainRank: 8,
          length: 4,
          cards: [
            { id: 'c7', rank: '8', suit: 'spades' },
            { id: 'c8', rank: '8', suit: 'hearts' },
            { id: 'c9', rank: '8', suit: 'clubs' },
            { id: 'c10', rank: '8', suit: 'diamonds' },
          ],
        },
      },
      players: [
        { playerId: 'p1', handCount: 10 },
        { playerId: 'p2', handCount: 9 },
        { playerId: 'p3', handCount: 7 },
      ],
      me: {
        playerId: 'p1',
        hand: hand14.filter((c) => c.rank !== '8'),
      },
    });
    await captureLandlordVps('play-bomb');

    // 5. result-win (地主胜)
    mock.sendView({
      ...bidView,
      phase: 'game_over',
      landlordId: 'p1',
      currentPlayerId: null,
      bottomCards,
      multiplier: 3,
      winnerTeam: 'landlord',
      winnerId: 'p1',
      revealedHands: {
        p2: [
          { id: 'r1', rank: '7', suit: 'clubs' },
          { id: 'r2', rank: '7', suit: 'hearts' },
        ],
        p3: [
          { id: 'r3', rank: '9', suit: 'diamonds' },
          { id: 'r4', rank: '10', suit: 'clubs' },
          { id: 'r5', rank: 'J', suit: 'spades' },
        ],
      },
      currentTrick: {
        playerId: 'p1',
        combo: {
          type: 'single',
          mainRank: 17,
          length: 1,
          cards: [{ id: 'c1', rank: 'BJ' }],
        },
      },
      players: [
        { playerId: 'p1', handCount: 0 },
        { playerId: 'p2', handCount: 2 },
        { playerId: 'p3', handCount: 3 },
      ],
      me: {
        playerId: 'p1',
        hand: [],
      },
    });
    await captureLandlordVps('result-win');

    // 6. result-spring (春天：地主胜且两个农民都是 17 张)
    mock.sendView({
      ...bidView,
      phase: 'game_over',
      landlordId: 'p1',
      currentPlayerId: null,
      bottomCards,
      multiplier: 3,
      winnerTeam: 'landlord',
      winnerId: 'p1',
      revealedHands: {
        p2: Array.from({ length: 17 }, (_, i) => ({ id: `p2_${i}`, rank: '3' as const, suit: 'hearts' as const })),
        p3: Array.from({ length: 17 }, (_, i) => ({ id: `p3_${i}`, rank: '4' as const, suit: 'diamonds' as const })),
      },
      currentTrick: {
        playerId: 'p1',
        combo: {
          type: 'single',
          mainRank: 17,
          length: 1,
          cards: [{ id: 'c1', rank: 'BJ' }],
        },
      },
      players: [
        { playerId: 'p1', handCount: 0 },
        { playerId: 'p2', handCount: 17 },
        { playerId: 'p3', handCount: 17 },
      ],
      me: {
        playerId: 'p1',
        hand: [],
      },
    });
    await captureLandlordVps('result-spring');

    // 7. result-lose (农民胜)
    mock.sendView({
      ...bidView,
      phase: 'game_over',
      landlordId: 'p1',
      currentPlayerId: null,
      bottomCards,
      multiplier: 3,
      winnerTeam: 'farmers',
      winnerId: 'p2',
      revealedHands: {
        p1: [{ id: 'c1', rank: 'BJ' }],
        p3: [{ id: 'r3', rank: '9', suit: 'diamonds' }],
      },
      currentTrick: {
        playerId: 'p2',
        combo: {
          type: 'single',
          mainRank: 15,
          length: 1,
          cards: [{ id: 'c2', rank: '2', suit: 'spades' }],
        },
      },
      players: [
        { playerId: 'p1', handCount: 1 },
        { playerId: 'p2', handCount: 0 },
        { playerId: 'p3', handCount: 1 },
      ],
      me: {
        playerId: 'p1',
        hand: [{ id: 'c1', rank: 'BJ' }],
      },
    });
    await captureLandlordVps('result-lose');

    // 8. rotate-hint (竖屏 390x844)
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(SHOTS_DIR, 'landlord-rotate-hint-390x844.png'), fullPage: false });
  });

  test('UNO 截图组', async ({ page }) => {
    test.setTimeout(90_000);

    const members = [
      { playerId: 'u1', nickname: '小鱼干', seat: 1 },
      { playerId: 'u2', nickname: 'Momo', seat: 2 },
      { playerId: 'u3', nickname: '糯米', seat: 3 },
      { playerId: 'u4', nickname: '老王', seat: 4 },
      { playerId: 'u5', nickname: '可可', seat: 5 },
      { playerId: 'u6', nickname: '阿杰', seat: 6 },
    ];

    // 契约 §6 fixture:
    // 7 张 = 红3 红反转 蓝7 绿跳过 红+2 变色 +4
    const hand7 = [
      { id: 'u_c1', kind: 'number' as const, color: 'red' as const, value: 3 },
      { id: 'u_c2', kind: 'reverse' as const, color: 'red' as const },
      { id: 'u_c3', kind: 'draw2' as const, color: 'red' as const },
      { id: 'u_c4', kind: 'number' as const, color: 'blue' as const, value: 7 },
      { id: 'u_c5', kind: 'skip' as const, color: 'green' as const },
      { id: 'u_c6', kind: 'wild' as const },
      { id: 'u_c7', kind: 'wild4' as const },
    ];

    const baseUnoView = {
      gameId: 'uno' as const,
      rulesetId: 'uno_platform_house_v1' as const,
      phase: 'round_playing' as const,
      round: 2,
      roundLimit: 3 as const,
      mode: 'individual' as const,
      players: [
        { playerId: 'u1', handCount: 7, unoCalled: false, isCurrentPlayer: true, teamId: null },
        { playerId: 'u2', handCount: 3, unoCalled: false, isCurrentPlayer: false, teamId: null },
        { playerId: 'u3', handCount: 1, unoCalled: true, isCurrentPlayer: false, teamId: null },
        { playerId: 'u4', handCount: 5, unoCalled: false, isCurrentPlayer: false, teamId: null },
        { playerId: 'u5', handCount: 1, unoCalled: false, isCurrentPlayer: false, teamId: null },
        { playerId: 'u6', handCount: 9, unoCalled: false, isCurrentPlayer: false, teamId: null },
      ],
      topDiscard: { id: 'top_1', kind: 'number' as const, color: 'red' as const, value: 7 },
      currentColor: 'red' as const,
      currentPlayerId: 'u1',
      direction: 1 as const,
      pendingPenalty: null,
      unoRaceWindow: null,
      deckCount: 42,
      discardCount: 18,
      roundScores: [[0, 24, 50, 12, 0, 35]],
      cumulativeScores: [0, 24, 50, 12, 0, 35],
      matchRanking: null,
      clockInfo: {
        turnDeadlineAt: Date.now() + 25_000,
        windowDeadlineAt: null,
      },
      // 隐私不变量：对局中恒为 null
      lastRound: null,
      me: {
        playerId: 'u1',
        hand: hand7,
        playableCardIds: ['u_c1', 'u_c2', 'u_c3', 'u_c6', 'u_c7'],
        capabilities: ['play_card', 'draw_card'],
        hasDrawnThisTurn: false,
        isCurrentPlayer: true,
        activeWindow: null,
      },
    };

    const mock = await setupMockGame(page, {
      gameId: 'uno',
      roomCode: 'UNO01',
      rulesetId: 'uno_platform_house_v1',
      members,
      initialView: baseUnoView,
      viewVersion: 2,
    });

    await page.goto(BASE_URL);
    await expect(page.locator('.uno-house-table')).toBeVisible({ timeout: 20_000 });

    const captureUnoVps = async (shotName: string, assertFrame?: () => Promise<void>) => {
      // 1280x800
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.waitForTimeout(400);
      if (assertFrame) await assertFrame();
      await page.screenshot({ path: path.join(SHOTS_DIR, `uno-${shotName}-1280x800.png`), fullPage: false });

      // 390x844
      await page.setViewportSize({ width: 390, height: 844 });
      await page.waitForTimeout(400);
      if (assertFrame) await assertFrame();
      await page.screenshot({ path: path.join(SHOTS_DIR, `uno-${shotName}-390x844.png`), fullPage: false });
    };

    // 1. play
    await captureUnoVps('play');

    // 2. play-draw4 (你打出 +4 选蓝之后)
    // 注意：pendingPenalty 公共形状恰好 5 键（无 sourcePlayerId），多一键会被客户端严格解析整帧拒绝
    mock.sendView({
      ...baseUnoView,
      topDiscard: { id: 'u_c7', kind: 'wild4' },
      currentColor: 'blue',
      currentPlayerId: 'u2',
      players: baseUnoView.players.map((p) => p.playerId === 'u1' ? { ...p, handCount: 6, isCurrentPlayer: false } : p.playerId === 'u2' ? { ...p, isCurrentPlayer: true } : p),
      pendingPenalty: {
        total: 4,
        kind: 'draw4',
        responderId: 'u2',
        challengeable: true,
        windowToken: 'pen_1',
      },
      me: {
        ...baseUnoView.me,
        hand: hand7.filter((c) => c.id !== 'u_c7'),
        isCurrentPlayer: false,
        playableCardIds: [],
      },
    });
    await captureUnoVps('play-draw4', async () => {
      // 帧确实被应用（而不是解析被拒后停在上一帧）
      await expect(page.locator('.uno-house-table')).toHaveAttribute('data-color', 'blue');
      await expect(page.locator('.uno-house-discard [data-face="draw4"]')).toBeVisible();
    });

    // 3. hand16 (16 张按颜色归堆，紧凑模式)
    const extra9 = [
      { id: 'u_e1', kind: 'number' as const, color: 'red' as const, value: 9 },
      { id: 'u_e2', kind: 'number' as const, color: 'yellow' as const, value: 2 },
      { id: 'u_e3', kind: 'number' as const, color: 'yellow' as const, value: 5 },
      { id: 'u_e4', kind: 'reverse' as const, color: 'yellow' as const },
      { id: 'u_e5', kind: 'number' as const, color: 'green' as const, value: 4 },
      { id: 'u_e6', kind: 'draw2' as const, color: 'green' as const },
      { id: 'u_e7', kind: 'number' as const, color: 'blue' as const, value: 1 },
      { id: 'u_e8', kind: 'skip' as const, color: 'blue' as const },
      { id: 'u_e9', kind: 'wild' as const },
    ];
    const hand16 = [...hand7, ...extra9];
    mock.sendView({
      ...baseUnoView,
      players: baseUnoView.players.map((p) => p.playerId === 'u1' ? { ...p, handCount: 16 } : p),
      me: {
        ...baseUnoView.me,
        hand: hand16,
        playableCardIds: ['u_c1', 'u_c2', 'u_c3', 'u_e1', 'u_c6', 'u_c7', 'u_e9'],
      },
    });
    await captureUnoVps('hand16');

    // 4. hand25 (25 张紧凑模式)
    const extra9More = [
      { id: 'u_x1', kind: 'number' as const, color: 'red' as const, value: 1 },
      { id: 'u_x2', kind: 'number' as const, color: 'red' as const, value: 8 },
      { id: 'u_x3', kind: 'number' as const, color: 'yellow' as const, value: 0 },
      { id: 'u_x4', kind: 'draw2' as const, color: 'yellow' as const },
      { id: 'u_x5', kind: 'number' as const, color: 'green' as const, value: 7 },
      { id: 'u_x6', kind: 'reverse' as const, color: 'green' as const },
      { id: 'u_x7', kind: 'number' as const, color: 'blue' as const, value: 5 },
      { id: 'u_x8', kind: 'draw2' as const, color: 'blue' as const },
      { id: 'u_x9', kind: 'wild4' as const },
    ];
    const hand25 = [...hand16, ...extra9More];
    mock.sendView({
      ...baseUnoView,
      players: baseUnoView.players.map((p) => p.playerId === 'u1' ? { ...p, handCount: 25 } : p),
      me: {
        ...baseUnoView.me,
        hand: hand25,
        playableCardIds: ['u_c1', 'u_c2', 'u_c3', 'u_e1', 'u_x1', 'u_x2', 'u_c6', 'u_c7', 'u_e9', 'u_x9'],
      },
    });
    await captureUnoVps('hand25', async () => {
      // 25 张紧凑模式：无横向溢出且 25 张全部落位
      const fanCheck = await page.evaluate(() => {
        const doc = document.documentElement;
        return {
          overflowX: doc.scrollWidth - doc.clientWidth,
          items: document.querySelectorAll('.card-fan-deck .card-fan-item').length,
        };
      });
      expect(fanCheck.overflowX).toBeLessThanOrEqual(1);
      expect(fanCheck.items).toBe(25);
    });

    // 5. round-result (本局结算：可可出完，逐张翻开剩余手牌)
    const roundResultView = {
      ...baseUnoView,
      phase: 'round_over' as const,
      players: [
        { playerId: 'u1', handCount: 2, unoCalled: false, isCurrentPlayer: false, teamId: null },
        { playerId: 'u2', handCount: 2, unoCalled: false, isCurrentPlayer: false, teamId: null },
        { playerId: 'u3', handCount: 1, unoCalled: false, isCurrentPlayer: false, teamId: null },
        { playerId: 'u4', handCount: 4, unoCalled: false, isCurrentPlayer: false, teamId: null },
        { playerId: 'u5', handCount: 0, unoCalled: false, isCurrentPlayer: false, teamId: null },
        { playerId: 'u6', handCount: 5, unoCalled: false, isCurrentPlayer: false, teamId: null },
      ],
      roundScores: [
        [0, 24, 50, 12, 0, 35],
        [10, 28, 50, 18, 0, 65],
      ],
      cumulativeScores: [10, 52, 100, 30, 0, 100],
      lastRound: {
        roundNumber: 2,
        finisherPlayerId: 'u5',
        remainingHands: [
          [
            { id: 'r_c1', kind: 'number' as const, color: 'red' as const, value: 3 },
            { id: 'r_c2', kind: 'number' as const, color: 'blue' as const, value: 7 },
          ],
          [
            { id: 'r_c3', kind: 'draw2' as const, color: 'green' as const },
            { id: 'r_c4', kind: 'number' as const, color: 'yellow' as const, value: 8 },
          ],
          [{ id: 'r_c5', kind: 'wild4' as const }],
          [
            { id: 'r_c6', kind: 'skip' as const, color: 'red' as const },
            { id: 'r_c7', kind: 'number' as const, color: 'green' as const, value: 4 },
            { id: 'r_c8', kind: 'reverse' as const, color: 'blue' as const },
            { id: 'r_c9', kind: 'number' as const, color: 'yellow' as const, value: 0 },
          ],
          [],
          [
            { id: 'r_c10', kind: 'number' as const, color: 'red' as const, value: 9 },
            { id: 'r_c11', kind: 'draw2' as const, color: 'blue' as const },
            { id: 'r_c12', kind: 'number' as const, color: 'green' as const, value: 6 },
            { id: 'r_c13', kind: 'wild' as const },
            { id: 'r_c14', kind: 'number' as const, color: 'yellow' as const, value: 2 },
          ],
        ],
      },
      me: {
        ...baseUnoView.me,
        isCurrentPlayer: false,
        playableCardIds: [],
        hand: [
          { id: 'u_c1', kind: 'number' as const, color: 'red' as const, value: 3 },
          { id: 'u_c4', kind: 'number' as const, color: 'blue' as const, value: 7 },
        ],
      },
    };
    mock.sendView(roundResultView);

    // 等冲屏大字先出现再卸载（≤950ms），采集静止画面；先 attached 防止卸载等待抢跑
    await page.waitForSelector('.pt-slam-fx', { state: 'attached', timeout: 2_000 }).catch(() => undefined);
    await page.waitForSelector('.pt-slam-fx', { state: 'detached', timeout: 4_000 }).catch(() => undefined);
    await captureUnoVps('round-result', async () => {
      // 结算快照被应用：胜者是可可（u5），剩牌逐张翻开
      await expect(page.locator('.pt-result-view')).toBeVisible();
      await expect(page.locator('.pt-result-row[data-player-id="u5"]')).toBeVisible();
      const slamCount = await page.locator('.pt-slam-fx').count();
      if (slamCount > 0) {
        await expect(page.locator('.pt-slam-fx').first()).toHaveCSS('opacity', '0');
      }
    });

    // 6. match-result (整场结束：总榜 + 冠军)
    mock.sendView({
      ...roundResultView,
      phase: 'match_over' as const,
      matchRanking: [
        { playerId: 'u5', total: 0, rank: 1 },
        { playerId: 'u1', total: 10, rank: 2 },
        { playerId: 'u4', total: 30, rank: 3 },
        { playerId: 'u2', total: 52, rank: 4 },
        { playerId: 'u3', total: 100, rank: 5 },
        { playerId: 'u6', total: 100, rank: 5 },
      ],
    });
    await page.waitForSelector('.pt-slam-fx', { state: 'attached', timeout: 2_000 }).catch(() => undefined);
    await page.waitForSelector('.pt-slam-fx', { state: 'detached', timeout: 4_000 }).catch(() => undefined);
    await captureUnoVps('match-result', async () => {
      await expect(page.locator('.pt-result-view')).toBeVisible();
      await expect(page.locator('.pt-result-board')).toContainText('总榜');
    });
  });

  test('Ding (Bell Clash) 截图组', async ({ page }) => {
    test.setTimeout(90_000);

    const members = [
      { playerId: 'b1', nickname: '小鱼干', seat: 1 },
      { playerId: 'b2', nickname: 'Momo', seat: 2 },
      { playerId: 'b3', nickname: '糯米', seat: 3 },
      { playerId: 'b4', nickname: '老王', seat: 4 },
      { playerId: 'b5', nickname: '可可', seat: 5 },
      { playerId: 'b6', nickname: '阿杰', seat: 6 },
    ];

    // 契约 §6 fixture:
    // 6 张 = 绿2 蓝5 绿「伸了一个懒腰」 红6 黄「双手抱胸」 蓝1
    const hand6 = [
      { kind: 'number' as const, color: 'green' as const, number: 2 },
      { kind: 'number' as const, color: 'blue' as const, number: 5 },
      { kind: 'phrase' as const, color: 'green' as const, phrase: '伸了一个懒腰' },
      { kind: 'number' as const, color: 'red' as const, number: 6 },
      { kind: 'phrase' as const, color: 'yellow' as const, phrase: '双手抱胸' },
      { kind: 'number' as const, color: 'blue' as const, number: 1 },
    ];

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
      roomCode: 'DING01',
      rulesetId: 'bell_clash_v1',
      members,
      initialView: baseBellView,
    });

    await page.goto(BASE_URL);
    await expect(page.locator('.bc-game, .tabletop-shell')).toBeVisible({ timeout: 20_000 });

    const captureBellVps = async (shotName: string) => {
      // 1280x800
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(SHOTS_DIR, `bell-clash-${shotName}-1280x800.png`), fullPage: false });

      // 390x844
      await page.setViewportSize({ width: 390, height: 844 });
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(SHOTS_DIR, `bell-clash-${shotName}-390x844.png`), fullPage: false });
    };

    // 1. idle (平时：轮到阿杰，顶牌蓝 4)
    await captureBellVps('idle');

    // 2. picking (挑卡态：按铃后手牌短语高亮)
    await page.evaluate(() => {
      const bellBtn = document.querySelector('.bc-bell-hit, .bell-floating-bell-btn, .bc-bell') as HTMLElement | null;
      bellBtn?.click();
    });
    await captureBellVps('picking');

    // 3. challenge (质疑中：亮出「伸了一个懒腰」，5 票里 4 有 1 没做过，剩 1 秒)
    mock.sendView({
      ...baseBellView,
      challenge: {
        claimantId: 'b1',
        card: { kind: 'phrase', color: 'green', phrase: '伸了一个懒腰' },
        voterIds: ['b2', 'b3', 'b4', 'b5', 'b6'],
        doubtIds: ['b3'],
        confirmIds: ['b2', 'b4', 'b5', 'b6'],
      },
      deadlineAt: Date.now() + 1_000,
      deadlineKind: 'challenge',
    });
    await captureBellVps('challenge');

    // 4. success (成功之后：顶牌绿短语，轮到你)
    mock.sendView({
      ...baseBellView,
      currentPlayerId: 'b1',
      discardTop: { kind: 'phrase', color: 'green', phrase: '伸了一个懒腰' },
      challenge: null,
      handCounts: { b1: 5, b2: 7, b3: 5, b4: 8, b5: 6, b6: 4 },
      me: {
        playerId: 'b1',
        hand: hand6.filter((c) => !(c.kind === 'phrase' && c.phrase === '伸了一个懒腰')),
      },
    });
    await captureBellVps('success');

    // 5. miss (拍错：亮出「做了一个鬼脸」，4/5 没做过)
    mock.sendView({
      ...baseBellView,
      challenge: {
        claimantId: 'b1',
        card: { kind: 'phrase', color: 'yellow', phrase: '做了一个鬼脸' },
        voterIds: ['b2', 'b3', 'b4', 'b5', 'b6'],
        doubtIds: ['b2', 'b3', 'b4', 'b5'],
        confirmIds: ['b6'],
      },
      deadlineAt: Date.now() + 500,
      deadlineKind: 'challenge',
    });
    await captureBellVps('miss');

    // 6. result (结算：可可出完)
    mock.sendView({
      ...baseBellView,
      phase: 'game_over',
      winners: ['b5'],
      challenge: null,
      handCounts: { b1: 5, b2: 7, b3: 5, b4: 8, b5: 0, b6: 4 },
    });
    await captureBellVps('result');

    // 7. hand24 (牌多 24 张)
    const hand24 = Array.from({ length: 24 }, (_, i) => {
      const colors = ['red', 'yellow', 'green', 'blue'] as const;
      return i % 4 === 0
        ? { kind: 'phrase' as const, color: colors[i % 4]!, phrase: `短语测试${i}` }
        : { kind: 'number' as const, color: colors[i % 4]!, number: (i % 8) + 1 };
    });
    mock.sendView({
      ...baseBellView,
      phase: 'playing',
      winners: [],
      handCounts: { b1: 24, b2: 7, b3: 5, b4: 8, b5: 6, b6: 4 },
      me: {
        playerId: 'b1',
        hand: hand24,
      },
    });
    await captureBellVps('hand24');
  });
});
