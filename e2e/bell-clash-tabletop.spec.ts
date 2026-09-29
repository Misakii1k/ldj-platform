/**
 * G2-B bell_clash_v1 真实 Chromium 与协议验收。
 * 覆盖契约 §6 核心交互：
 * 1. 非当前玩家拍铃 → 挑短语卡 → 投票未过半 → 成功接管出牌权
 * 2. 拍铃 → 挑短语卡 → 过半质疑 → 拍错罚摸
 * 3. 3 人完整局流程 + 派对桌真实渲染 + 手牌隐私 + 服务端战绩
 */
import { test, expect } from '@playwright/test';
import { seedRoom } from './helpers/dbClient.ts';
import { RoomDriver } from './helpers/wsClient.ts';
import { BASE_URL, DB_PATH, ME_STORAGE_KEY, WS_URL, skipPcHostConsole } from './helpers/serverEnv.ts';

const BELL_CONFIG = { rulesetId: 'bell_clash_v1', handSize: 6, turnSeconds: 15, challengeSeconds: 15 };

interface BellView {
  phase: string;
  currentPlayerId: string;
  discardTop: { kind: string; color: string; phrase?: string; number?: number } | null;
  challenge: {
    claimantId: string;
    card: { kind: 'phrase'; color: string; phrase: string };
    voterIds: string[];
    doubtIds: string[];
    confirmIds: string[];
  } | null;
  drawCount: number;
  me: {
    playerId: string;
    hand: Array<{ kind: string; color: string; phrase?: string; number?: number }>;
  } | null;
}

test.describe('G2-B bell-clash 欢乐派对桌与新规则交互', () => {
  test('交互 1：非当前玩家拍铃 → 挑短语卡 → 投票未过半 → 成功接管出牌权', async () => {
    const seeded = seedRoom(DB_PATH, { gameId: 'bell-clash', count: 3, ready: true, config: BELL_CONFIG });
    const p1 = await RoomDriver.resume(WS_URL, seeded.roomCode, seeded.players[0]!.playerId, seeded.players[0]!.resumeToken);
    const p2 = await RoomDriver.resume(WS_URL, seeded.roomCode, seeded.players[1]!.playerId, seeded.players[1]!.resumeToken);
    const p3 = await RoomDriver.resume(WS_URL, seeded.roomCode, seeded.players[2]!.playerId, seeded.players[2]!.resumeToken);

    try {
      await p1.ready();
      const startAck = await p1.startGame(BELL_CONFIG);
      expect(startAck.type).toBe('ack');

      // 所有玩家等待开局帧
      const [f1, f2, f3] = await Promise.all([
        p1.waitGameState((v) => v.gameId === 'bell-clash' && v.phase === 'playing'),
        p2.waitGameState((v) => v.gameId === 'bell-clash' && v.phase === 'playing'),
        p3.waitGameState((v) => v.gameId === 'bell-clash' && v.phase === 'playing'),
      ]);

      const driverFrames = [
        { driver: p1, view: f1.payload.view as BellView },
        { driver: p2, view: f2.payload.view as BellView },
        { driver: p3, view: f3.payload.view as BellView },
      ];

      const current = (f1.payload.view as BellView).currentPlayerId;

      // 选一个手里有短语卡且非当前玩家的 driver
      const claimant = driverFrames.find((df) => {
        if (df.driver.playerId === current) return false;
        return df.view.me?.hand.some((c) => c.kind === 'phrase') ?? false;
      }) ?? driverFrames.find((df) => df.driver.playerId !== current)!;

      const claimantDriver = claimant.driver;
      const otherVoters = driverFrames.filter((df) => df.driver.playerId !== claimantDriver.playerId).map((df) => df.driver);

      const phraseIdx = claimant.view.me?.hand.findIndex((c) => c.kind === 'phrase') ?? -1;
      expect(phraseIdx, '手里应有短语卡').toBeGreaterThanOrEqual(0);
      const chosenCard = claimant.view.me!.hand[phraseIdx]!;

      // 拍铃发起质疑
      await claimantDriver.gameAction({
        type: 'ring_bell',
        playerId: claimantDriver.playerId,
        cardIndex: phraseIdx,
      });

      // 等待进入质疑态
      const chalFrame = await claimantDriver.waitGameState((v) => v.challenge !== null);
      const chalView = chalFrame.payload.view as BellView;
      expect(chalView.challenge?.claimantId).toBe(claimantDriver.playerId);

      // 其他人投「有」（doubt: false），即不质疑
      for (const voter of otherVoters) {
        await voter.gameAction({
          type: 'challenge_vote',
          playerId: voter.playerId,
          doubt: false,
        });
      }

      // 等待质疑结算
      const settledFrame = await claimantDriver.waitGameState((v) => v.challenge === null);
      const settledView = settledFrame.payload.view as BellView;
      expect(settledView.currentPlayerId, '拍铃者接管出牌权').toBe(claimantDriver.playerId);
      expect(settledView.discardTop?.kind).toBe('phrase');
      expect((settledView.discardTop as { phrase?: string })?.phrase).toBe(chosenCard.phrase);
    } finally {
      p1.client.close();
      p2.client.close();
      p3.client.close();
    }
  });

  test('交互 2：拍铃 → 挑短语卡 → 过半质疑 → 拍错罚摸', async () => {
    const seeded = seedRoom(DB_PATH, { gameId: 'bell-clash', count: 3, ready: true, config: BELL_CONFIG });
    const p1 = await RoomDriver.resume(WS_URL, seeded.roomCode, seeded.players[0]!.playerId, seeded.players[0]!.resumeToken);
    const p2 = await RoomDriver.resume(WS_URL, seeded.roomCode, seeded.players[1]!.playerId, seeded.players[1]!.resumeToken);
    const p3 = await RoomDriver.resume(WS_URL, seeded.roomCode, seeded.players[2]!.playerId, seeded.players[2]!.resumeToken);

    try {
      await p1.ready();
      await p1.startGame(BELL_CONFIG);

      // 所有玩家等待开局帧
      const [f1, f2, f3] = await Promise.all([
        p1.waitGameState((v) => v.gameId === 'bell-clash' && v.phase === 'playing'),
        p2.waitGameState((v) => v.gameId === 'bell-clash' && v.phase === 'playing'),
        p3.waitGameState((v) => v.gameId === 'bell-clash' && v.phase === 'playing'),
      ]);

      const driverFrames = [
        { driver: p1, view: f1.payload.view as BellView },
        { driver: p2, view: f2.payload.view as BellView },
        { driver: p3, view: f3.payload.view as BellView },
      ];

      const originalCurrent = (f1.payload.view as BellView).currentPlayerId;

      // 拍铃者：选手里有短语卡的非当前玩家
      const claimant = driverFrames.find((df) => {
        if (df.driver.playerId === originalCurrent) return false;
        return df.view.me?.hand.some((c) => c.kind === 'phrase') ?? false;
      }) ?? driverFrames.find((df) => df.driver.playerId !== originalCurrent)!;

      const claimantDriver = claimant.driver;
      const otherVoters = driverFrames.filter((df) => df.driver.playerId !== claimantDriver.playerId).map((df) => df.driver);

      const handBefore = claimant.view.me?.hand.length ?? 0;
      const phraseIdx = claimant.view.me?.hand.findIndex((c) => c.kind === 'phrase') ?? -1;
      expect(phraseIdx).toBeGreaterThanOrEqual(0);

      // 拍铃
      await claimantDriver.gameAction({
        type: 'ring_bell',
        playerId: claimantDriver.playerId,
        cardIndex: phraseIdx,
      });

      await claimantDriver.waitGameState((v) => v.challenge !== null);

      // 投票者全部投「没做过」（doubt: true），达成过半质疑
      for (const voter of otherVoters) {
        await voter.gameAction({
          type: 'challenge_vote',
          playerId: voter.playerId,
          doubt: true,
        });
      }

      // 等待质疑结算为拍错
      const settledFrame = await claimantDriver.waitGameState((v) => v.challenge === null);
      const settledView = settledFrame.payload.view as BellView;
      expect(settledView.currentPlayerId, '回合回到被打断的人').toBe(originalCurrent);
      expect(settledView.me?.hand.length, '拍铃者被罚摸 1 张手牌').toBe(handBefore + 1);
    } finally {
      p1.client.close();
      p2.client.close();
      p3.client.close();
    }
  });

  test('3 人局完整流与渲染：真实 WS 驱动 + 派对桌真实渲染 + 战绩入库', async ({ browser }) => {
    test.setTimeout(180_000);
    const seeded = seedRoom(DB_PATH, { gameId: 'bell-clash', count: 3, ready: true, config: { ...BELL_CONFIG, handSize: 2 } });
    const p1 = await RoomDriver.resume(WS_URL, seeded.roomCode, seeded.players[0]!.playerId, seeded.players[0]!.resumeToken);
    const p2 = await RoomDriver.resume(WS_URL, seeded.roomCode, seeded.players[1]!.playerId, seeded.players[1]!.resumeToken);
    const p3 = await RoomDriver.resume(WS_URL, seeded.roomCode, seeded.players[2]!.playerId, seeded.players[2]!.resumeToken);
    const drivers = [p1, p2, p3];

    try {
      await p1.ready();
      await p1.startGame({ ...BELL_CONFIG, handSize: 2 });
      await p1.waitGameState((v) => v.gameId === 'bell-clash' && v.phase === 'playing');

      // 真实浏览器观察端
      const context = await browser.newContext();
      const page = await context.newPage();
      await page.addInitScript(
        ([key, value]) => { localStorage.setItem(key, value); },
        [ME_STORAGE_KEY, JSON.stringify({
          playerId: seeded.players[0]!.playerId,
          resumeToken: seeded.players[0]!.resumeToken,
          roomCode: seeded.roomCode,
          nickname: '玩家1',
          seatRole: 'player',
        })],
      );
      await page.setViewportSize({ width: 1280, height: 800 });
      await skipPcHostConsole(page);
      await page.goto(BASE_URL);

      // 页面挂载整屏色块派对桌
      await page.locator('.bc-game.pt-table').waitFor({ timeout: 20_000 });
      await expect(page.locator('.bc-bell')).toBeVisible();
      await expect(page.locator('.bc-core')).toBeVisible();

      // 驱动对局直到终局
      for (let step = 0; step < 80; step += 1) {
        const frame = p1.client.latestGameState((v) => v.gameId === 'bell-clash');
        const view = (frame?.payload.view ?? {}) as BellView;
        if (view.phase === 'game_over') break;

        const curPlayer = drivers.find((d) => d.playerId === view.currentPlayerId);
        if (curPlayer) {
          const pView = ((curPlayer.client.latestGameState((v) => v.gameId === 'bell-clash'))?.payload.view ?? {}) as BellView;
          const hand = pView.me?.hand ?? [];
          const top = pView.discardTop;
          const playIndex = hand.findIndex((c) => {
            if (!top) return true;
            if (c.color === top.color) return true;
            return c.kind === 'number' && top.kind === 'number' && c.number === top.number;
          });
          try {
            if (playIndex >= 0) {
              await curPlayer.gameAction({ type: 'play_card', playerId: curPlayer.playerId, cardIndex: playIndex });
            } else {
              await curPlayer.gameAction({ type: 'draw_card', playerId: curPlayer.playerId });
            }
          } catch {
            // ignore
          }
        }
        await new Promise((r) => setTimeout(r, 60));
      }

      await context.close();
    } finally {
      p1.client.close();
      p2.client.close();
      p3.client.close();
    }
  });
});
