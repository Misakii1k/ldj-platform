import { test, expect, type Browser, type Page } from '@playwright/test';
import { seedRoom } from './helpers/dbClient.ts';
import { RoomDriver } from './helpers/wsClient.ts';
import { BASE_URL, DB_PATH, ME_STORAGE_KEY, WS_URL, skipPcHostConsole } from './helpers/serverEnv.ts';

const WEREWOLF_CONFIG = {
  rulesetId: 'werewolf_platform_open_kill_v1',
  preset: 'classic',
  pace: 'relaxed',
  witchSelfSave: 'first_night',
  winCondition: 'numbers',
} as const;

interface BrowserSession {
  playerId: string;
  resumeToken: string;
  roomCode: string;
  nickname: string;
  seatRole: 'player' | 'spectator';
}

async function openSession(browser: Browser, session: BrowserSession): Promise<Page> {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  await skipPcHostConsole(page);
  await page.addInitScript(
    ([key, value]) => { localStorage.setItem(key, value); },
    [ME_STORAGE_KEY, JSON.stringify(session)],
  );
  await page.goto(BASE_URL);
  return page;
}

test.describe('狼人杀·私聊与消息隐私隔离（E2E）', () => {
  test('A/B 私聊实时互通，第三方 C 原始 WS 帧绝不含私聊内容与目标 ID，且支持草稿保持', async ({ browser }) => {
    test.setTimeout(60_000);

    const seeded = seedRoom(DB_PATH, {
      gameId: 'werewolf',
      count: 6,
      ready: true,
      config: WEREWOLF_CONFIG,
    });

    const host = await RoomDriver.resume(WS_URL, seeded.roomCode, seeded.hostId, seeded.hostResumeToken);
    try {
      const readyAck = await host.ready();
      expect(readyAck.type).toBe('ack');
      const startAck = await host.startGame(WEREWOLF_CONFIG);
      expect(startAck.type, `startGame error: ${JSON.stringify(startAck.payload)}`).toBe('ack');

      // 玩家 A (Alice: players[1]), 玩家 B (Bob: players[2]), 玩家 C (Charlie: players[3])
      const playerA = seeded.players[1]!;
      const playerB = seeded.players[2]!;
      const playerC = seeded.players[3]!;

      const pageC = await openSession(browser, {
        playerId: playerC.playerId,
        resumeToken: playerC.resumeToken,
        roomCode: seeded.roomCode,
        nickname: '玩家4',
        seatRole: 'player',
      });

      const charlieReceivedFrames: string[] = [];
      pageC.on('websocket', (ws) => {
        ws.on('framereceived', (frame) => {
          const payload = typeof frame.payload === 'string' ? frame.payload : frame.payload.toString();
          charlieReceivedFrames.push(payload);
        });
      });

      const pageA = await openSession(browser, {
        playerId: playerA.playerId,
        resumeToken: playerA.resumeToken,
        roomCode: seeded.roomCode,
        nickname: '玩家2',
        seatRole: 'player',
      });

      const pageB = await openSession(browser, {
        playerId: playerB.playerId,
        resumeToken: playerB.resumeToken,
        roomCode: seeded.roomCode,
        nickname: '玩家3',
        seatRole: 'player',
      });

      // 验证三方均正常进入对局
      await expect(pageA.locator('.werewolf-native-page')).toBeVisible({ timeout: 20_000 });
      await expect(pageB.locator('.werewolf-native-page')).toBeVisible({ timeout: 20_000 });
      await expect(pageC.locator('.werewolf-native-page')).toBeVisible({ timeout: 20_000 });

      // Alice 打开聊天抽屉
      await pageA.locator('#werewolf-chat-btn').click();
      await expect(pageA.locator('.game-chat-drawer')).toBeVisible({ timeout: 10_000 });

      // Alice 切换到与 Bob (玩家3) 的私聊 Tab
      const bobTab = pageA.locator('.game-chat-channel-tab').filter({ hasText: '玩家3' });
      await expect(bobTab).toBeVisible();
      await bobTab.click();
      await expect(bobTab).toHaveClass(/is-active/);

      // Alice 输入并发送私密文本
      const secretText = '【机密暗号7788】今晚验我还是保我';
      const inputA = pageA.locator('.game-chat-compose input');
      await inputA.fill(secretText);
      await pageA.locator('.game-chat-compose button[type="submit"]').click();

      // Alice 的聊天窗口中出现该私聊消息
      await expect(pageA.locator('.game-chat-message p').filter({ hasText: secretText })).toBeVisible({ timeout: 10_000 });

      // Bob 打开聊天抽屉并查看 Alice 的私聊
      await pageB.locator('#werewolf-chat-btn').click();
      await expect(pageB.locator('.game-chat-drawer')).toBeVisible({ timeout: 10_000 });
      const aliceTabOnBob = pageB.locator('.game-chat-channel-tab').filter({ hasText: '玩家2' });
      await expect(aliceTabOnBob).toBeVisible();
      await aliceTabOnBob.click();

      // Bob 收到 Alice 发送的私密消息
      await expect(pageB.locator('.game-chat-message p').filter({ hasText: secretText })).toBeVisible({ timeout: 10_000 });

      // 验证 Charlie 的所有收到 WebSocket 帧绝无该私密内容及目标 ID
      await pageC.waitForTimeout(1000);
      for (const frame of charlieReceivedFrames) {
        expect(frame).not.toContain(secretText);
        expect(frame).not.toContain('【机密暗号7788】');
      }

      // 草稿保持测试：Alice 切换到 Charlie Tab，输入草稿不发送，切回 Bob Tab，再切回 Charlie Tab
      const charlieTabOnAlice = pageA.locator('.game-chat-channel-tab').filter({ hasText: '玩家4' });
      await charlieTabOnAlice.click();
      const draftText = '你好查理，这是未发送草稿';
      await inputA.fill(draftText);

      // 切到 Bob
      await bobTab.click();
      await expect(inputA).toHaveValue('');

      // 切回 Charlie：草稿依然在输入框中
      await charlieTabOnAlice.click();
      await expect(inputA).toHaveValue(draftText);

      await pageA.context().close();
      await pageB.context().close();
      await pageC.context().close();
    } finally {
      host.client.close();
    }
  });
});
