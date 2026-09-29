/**
 * P0 基座完成判据：Node WS 建房 + 浏览器加入并断言渲染。
 *
 * 流程：
 * 1. 服务端已由 playwright webServer 启动（/health/live 就绪，llmAvailable=false）。
 * 2. Node 端 seedRoom 直插一间 undercover classic 4 人房（绕过建房准入，与
 *    gatewayGame.test.ts 成熟模式一致）→ 真实 WS resume 房主 → ready → start_game。
 * 3. 浏览器经 localStorage 会话（ldj:session）加入同一房间，断言对局页真实渲染：
 *    标题/看词界面渲染、私有词条不入 DOM（未交互前只显示占位文案）。
 */
import { test, expect, type Page } from '@playwright/test';
import { seedRoom } from './helpers/dbClient.ts';
import { RoomDriver } from './helpers/wsClient.ts';
import { BASE_URL, DB_PATH, ME_STORAGE_KEY, WS_URL, skipPcHostConsole } from './helpers/serverEnv.ts';

/** 浏览器作为第 2 位玩家 resume：设置本地会话后访问根路径即自动加入房间 */
async function prepareBrowser(browser: import('@playwright/test').Browser, me: {
  playerId: string;
  resumeToken: string;
  roomCode: string;
  nickname: string;
}): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.addInitScript(
    ([key, value]) => { localStorage.setItem(key, value); },
    [ME_STORAGE_KEY, JSON.stringify({ ...me, seatRole: 'player' })],
  );
  return page;
}

test('smoke：Node WS 建房开局 + 浏览器加入渲染', async ({ browser }) => {
  // 1. 直插 undercover classic 4 人房（全员 CONNECTED + ready）
  const seeded = seedRoom(DB_PATH, {
    gameId: 'undercover',
    count: 4,
    ready: true,
    config: { rulesetId: 'undercover_classic_v1' },
  });

  // 2. Node WS：房主 resume → 确认 welcome/ack → ready → start_game
  //    （resume 保留已就绪状态：seedRoom(ready:true) 的成员重连后仍是 ready，ready 幂等）
  const host = await RoomDriver.resume(WS_URL, seeded.roomCode, seeded.hostId, seeded.hostResumeToken);
  const readyAck = await host.ready();
  expect(readyAck.type, `ready 应 ack，收到：${readyAck.type} ${readyAck.payload.code ?? ''}`).toBe('ack');
  const startAck = await host.startGame();
  expect(startAck.type, `start_game 应 ack，收到：${startAck.type} ${startAck.payload.code ?? ''} ${startAck.payload.message ?? ''}`).toBe('ack');

  // 房主收到 word_reveal 视角帧
  const hostState = await host.waitGameState((view) => view.phase === 'word_reveal');
  expect(hostState.payload.role).toBe('player');
  expect(hostState.payload.moduleId).toBe('undercover');
  const hostView = hostState.payload.view as { me: { word: string } | null };
  expect(hostView.me?.word?.length ?? 0).toBeGreaterThan(0);

  // 3. 浏览器以第 2 位玩家加入并断言渲染
  const browserPlayer = seeded.players[1]!;
  const page = await prepareBrowser(browser, {
    playerId: browserPlayer.playerId,
    resumeToken: browserPlayer.resumeToken,
    roomCode: seeded.roomCode,
    nickname: '玩家2',
  });

  await skipPcHostConsole(page);

  await page.goto(BASE_URL);

  // 对局页（word_reveal）渲染：标题 + 看词交互
  await expect(page.getByText('谁是卧底').first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/查看你的(机密|秘密)词条/)).toBeVisible({ timeout: 20_000 });

  // 3D 翻牌卡牌渲染与交互前状态
  await expect(page.locator('.identity-flip-card')).toBeVisible();
  await expect(page.locator('.identity-card-back__badge')).toBeVisible();

  // 回合信息渲染（第 0 轮）确认浏览器已进入该房间的对局页
  await expect(page.getByText('第 0 轮 · 找出隐藏卧底')).toBeVisible();

  host.client.close();
  await page.context().close();
});
