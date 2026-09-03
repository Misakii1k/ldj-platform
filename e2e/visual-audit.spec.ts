/**
 * 视觉走查专用自动化脚本（Visual Audit）：
 * 生成多视口、多阶段、全品类对局界面的高保真截图，供设计审查与针对性 UI 优化。
 */
import { test, expect, type Page, type Browser } from '@playwright/test';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { blankModule } from '../packages/games/undercover/server/blank/module.ts';
import { seedRoom } from './helpers/dbClient.ts';
import { RoomDriver } from './helpers/wsClient.ts';
import { seedActiveSession } from './support/sessionSeeder.ts';
import { BASE_URL, DB_PATH, ME_STORAGE_KEY, WS_URL } from './helpers/serverEnv.ts';

const SHOTS_DIR = path.resolve(process.cwd(), 'screenshots');

test.beforeAll(() => {
  fs.mkdirSync(SHOTS_DIR, { recursive: true });
});

async function saveScreenshot(page: Page, filename: string) {
  const filePath = path.join(SHOTS_DIR, filename);
  await page.screenshot({ path: filePath, fullPage: false });
}

async function preparePlayerPage(browser: Browser, width: number, height: number, me: Record<string, unknown>): Promise<Page> {
  const context = await browser.newContext({ viewport: { width, height } });
  const page = await context.newPage();
  await page.addInitScript(
    ([key, value]) => { localStorage.setItem(key, value); },
    [ME_STORAGE_KEY, JSON.stringify({ seatRole: 'player', ...me })],
  );
  return page;
}

test.describe('全页面视觉识别与多视口走查', () => {
  test('1. 首页与核心弹层视觉走查（桌面 1280x800 & 移动 390x844）', async ({ browser }) => {
    // 桌面首页
    const deskCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const deskPage = await deskCtx.newPage();
    await deskPage.goto(BASE_URL);
    await expect(deskPage.locator('.game-home-page')).toBeVisible();
    await deskPage.waitForTimeout(600);
    await saveScreenshot(deskPage, '01_home_desktop.png');

    // 弹层：创建房间
    const createBtn = deskPage.getByRole('button', { name: '创建房间' }).first();
    await createBtn.click();
    await expect(deskPage.locator('.room-sheet')).toBeVisible();
    await saveScreenshot(deskPage, '02_create_room_sheet.png');

    // 关闭后打开设置
    await deskPage.locator('.room-sheet__close').first().click();
    await expect(deskPage.locator('.room-sheet')).toBeHidden();

    const settingsBtn = deskPage.getByRole('button', { name: '打开设置' });
    await settingsBtn.click();
    await expect(deskPage.locator('.room-sheet')).toBeVisible();
    await saveScreenshot(deskPage, '03_settings_sheet.png');
    await deskPage.locator('.room-sheet__close').first().click();
    await expect(deskPage.locator('.room-sheet')).toBeHidden();

    // 移动端首页
    const mobCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const mobPage = await mobCtx.newPage();
    await mobPage.goto(BASE_URL);
    await expect(mobPage.locator('.game-home-page')).toBeVisible();
    await mobPage.waitForTimeout(600);
    await saveScreenshot(mobPage, '04_home_mobile.png');

    // 移动端加入房间弹层
    const joinBtn = mobPage.getByRole('button', { name: '输入房间码' }).first();
    if (await joinBtn.isVisible()) {
      await joinBtn.click();
      await expect(mobPage.locator('.sheet-dialog, .room-sheet')).toBeVisible();
      await saveScreenshot(mobPage, '05_join_room_sheet_mobile.png');
    }

    await deskCtx.close();
    await mobCtx.close();
  });

  test('2. 房间大厅（Room Lobby）桌面与移动端视觉走查', async ({ browser }) => {
    const seeded = seedRoom(DB_PATH, { gameId: 'undercover', count: 4, ready: false });
    const host = seeded.players[0]!;

    // 桌面大厅
    const deskPage = await preparePlayerPage(browser, 1280, 800, {
      ...host,
      roomCode: seeded.roomCode,
      nickname: '房主小明',
    });
    await deskPage.goto(BASE_URL);
    await expect(deskPage.locator('.room-page')).toBeVisible({ timeout: 20_000 });
    await saveScreenshot(deskPage, '06_room_lobby_desktop.png');

    // 移动端大厅
    const mobPage = await preparePlayerPage(browser, 390, 844, {
      ...host,
      roomCode: seeded.roomCode,
      nickname: '房主小明',
    });
    await mobPage.goto(BASE_URL);
    await expect(mobPage.locator('.room-page')).toBeVisible({ timeout: 20_000 });
    await saveScreenshot(mobPage, '07_room_lobby_mobile.png');

    await deskPage.context().close();
    await mobPage.context().close();
  });

  test('3. 谁是卧底游戏内阶段视觉走查（看词 / 发言 / 投票宽屏与移动端）', async ({ browser }) => {
    const seeded = seedRoom(DB_PATH, { gameId: 'undercover', count: 6, ready: true });
    const hostDriver = await RoomDriver.resume(WS_URL, seeded.roomCode, seeded.hostId, seeded.hostResumeToken);
    const startAck = await hostDriver.startGame();
    expect(startAck.type).toBe('ack');

    const p1 = seeded.players[0]!;
    const p2 = seeded.players[1]!;

    // 宽屏 1280x800
    const deskPage = await preparePlayerPage(browser, 1280, 800, {
      ...p1,
      roomCode: seeded.roomCode,
      nickname: '玩家1',
    });
    await deskPage.goto(BASE_URL);

    // 移动端 390x844
    const mobPage = await preparePlayerPage(browser, 390, 844, {
      ...p2,
      roomCode: seeded.roomCode,
      nickname: '玩家2',
    });
    await mobPage.goto(BASE_URL);

    // 1. 宽屏与移动端看词阶段
    await expect(deskPage.locator('.game-phase.word-reveal')).toBeVisible({ timeout: 20_000 });
    await saveScreenshot(deskPage, '08_undercover_word_reveal_desktop.png');
    await expect(mobPage.locator('.game-phase.word-reveal')).toBeVisible({ timeout: 20_000 });
    await saveScreenshot(mobPage, '08_undercover_word_reveal_mobile.png');

    // 确认看词进入发言阶段
    const confirm1 = deskPage.getByRole('button', { name: '我已记下，确认就绪' }).first();
    if (await confirm1.isVisible()) await confirm1.click();
    const confirm2 = mobPage.getByRole('button', { name: '我已记下，确认就绪' }).first();
    if (await confirm2.isVisible()) await confirm2.click();

    for (const p of seeded.players.slice(2)) {
      const d = await RoomDriver.resume(WS_URL, seeded.roomCode, p.playerId, p.resumeToken);
      await d.gameAction({ type: 'confirm_word' });
      d.client.close();
    }

    // 2. 宽屏与移动端发言阶段
    await expect(deskPage.locator('.game-phase.speaking')).toBeVisible({ timeout: 20_000 });
    await saveScreenshot(deskPage, '09_undercover_speaking_desktop.png');
    await expect(mobPage.locator('.game-phase.speaking')).toBeVisible({ timeout: 20_000 });
    await saveScreenshot(mobPage, '09_undercover_speaking_mobile.png');

    // 循环驱动所有玩家按发言顺序完成发言直到进入投票
    for (let step = 0; step < 20; step++) {
      if (await deskPage.locator('.game-phase.voting').isVisible().catch(() => false)) break;

      const speech1 = deskPage.getByRole('button', { name: '发言完毕，交棒下一位' }).first();
      if (await speech1.isVisible().catch(() => false) && await speech1.isEnabled().catch(() => false)) {
        await speech1.click().catch(() => {});
        await deskPage.waitForTimeout(400);
      }
      const speech2 = mobPage.getByRole('button', { name: '发言完毕，交棒下一位' }).first();
      if (await speech2.isVisible().catch(() => false) && await speech2.isEnabled().catch(() => false)) {
        await speech2.click().catch(() => {});
        await mobPage.waitForTimeout(400);
      }
      for (const p of seeded.players.slice(2)) {
        const d = await RoomDriver.resume(WS_URL, seeded.roomCode, p.playerId, p.resumeToken);
        await d.gameAction({ type: 'finish_speech' }).catch(() => {});
        d.client.close();
      }
      await deskPage.waitForTimeout(500);
    }


    // 3. 宽屏与移动端投票阶段
    await expect(deskPage.locator('.game-phase.voting')).toBeVisible({ timeout: 20_000 });
    await saveScreenshot(deskPage, '10_undercover_voting_desktop.png');
    await expect(mobPage.locator('.game-phase.voting')).toBeVisible({ timeout: 20_000 });
    await saveScreenshot(mobPage, '10_undercover_voting_mobile.png');

    // 4. 全员投票 → 投票结果与本轮票型
    // 浏览器玩家走页面真实点击；之后轮询补齐（重复发 cast_vote 对已投票者幂等拒绝）。
    {
      const deskVote = deskPage.locator('.vote-card:not(.self):not(:disabled)').first();
      const mobVote = mobPage.locator('.vote-card:not(.self):not(:disabled)').first();
      await deskVote.click().catch(() => {});
      await mobVote.click().catch(() => {});
      const target = p2.playerId;
      const browserIds = new Set([p1.playerId, p2.playerId]);
      for (let attempt = 0; attempt < 6; attempt += 1) {
        if (await deskPage.locator('.game-phase.vote-result').isVisible().catch(() => false)) break;
        for (const p of seeded.players) {
          if (browserIds.has(p.playerId)) continue;
          const d = await RoomDriver.resume(WS_URL, seeded.roomCode, p.playerId, p.resumeToken);
          await d.gameAction({ type: 'cast_vote', targetPlayerId: target }).catch(() => {});
          d.client.close();
        }
        await deskPage.waitForTimeout(800);
      }
      // 投票结果是瞬态（服务端数秒后自动推进），抓到后立即截图
      await expect(deskPage.locator('.game-phase.vote-result')).toBeVisible({ timeout: 8_000 });
      await saveScreenshot(deskPage, '10b_undercover_vote_result_desktop.png');
    }

    hostDriver.client.close();
    await deskPage.context().close();
    await mobPage.context().close();
  });

  test('3b. 谁是卧底 · 白板模式视觉走查（空白档案卡 / 发言 / 移动端）', async ({ browser }) => {
    // 确定性拿到白板玩家：重复播种 ACTIVE 会话直到目标角色非房主玩家出现
    let seeded = seedActiveSession(DB_PATH, { module: blankModule, count: 4, config: { speechSeconds: 30, voteSeconds: 30 } });
    for (let attempt = 0; attempt < 16; attempt += 1) {
      const state = seeded.state as { players: Record<string, { role: string }> };
      const blankPlayer = seeded.players.find(
        (player) => player.playerId !== seeded.hostId && state.players[player.playerId]?.role === 'blank',
      );
      if (blankPlayer) break;
      seeded = seedActiveSession(DB_PATH, { module: blankModule, count: 4, config: { speechSeconds: 30, voteSeconds: 30 } });
    }
    const state = seeded.state as { players: Record<string, { role: string }> };
    const blankMe = seeded.players.find(
      (player) => player.playerId !== seeded.hostId && state.players[player.playerId]?.role === 'blank',
    )!;

    const blankPage = await preparePlayerPage(browser, 1280, 800, {
      playerId: blankMe.playerId,
      resumeToken: blankMe.resumeToken,
      roomCode: seeded.roomCode,
      nickname: '白板玩家',
    });
    await blankPage.goto(BASE_URL);
    await expect(blankPage.locator('.blank-word-card__blank')).toBeVisible({ timeout: 20_000 });
    await saveScreenshot(blankPage, '18_blank_word_reveal_desktop.png');

    // 移动端：另一名平民玩家的偷看页（同一身份两页互顶会踢下线，不复用 blankMe）
    const civMe = seeded.players.find((player) => player.playerId !== seeded.hostId && player.playerId !== blankMe.playerId)!;
    const mobPage = await preparePlayerPage(browser, 390, 844, {
      playerId: civMe.playerId,
      resumeToken: civMe.resumeToken,
      roomCode: seeded.roomCode,
      nickname: '平民玩家',
    });
    await mobPage.goto(BASE_URL);
    await expect(mobPage.getByText('谁是卧底 · 白板').first()).toBeVisible({ timeout: 20_000 });
    await saveScreenshot(mobPage, '18_blank_word_reveal_mobile.png');

    // 全员就绪 → 发言阶段（白板玩家的发言面板 + 猜词特权区）
    const confirmBtn = blankPage.getByRole('button', { name: '我已记下，确认就绪' }).first();
    await expect(confirmBtn).toBeVisible({ timeout: 20_000 });
    await confirmBtn.click();
    for (const p of seeded.players) {
      if (p.playerId === blankMe.playerId) continue;
      const d = await RoomDriver.resume(WS_URL, seeded.roomCode, p.playerId, p.resumeToken);
      await d.gameAction({ type: 'confirm_word' });
      d.client.close();
    }
    await expect(blankPage.locator('.game-phase.speaking')).toBeVisible({ timeout: 20_000 });
    await saveScreenshot(blankPage, '19_blank_speaking_desktop.png');

    await blankPage.context().close();
    await mobPage.context().close();
  });

  test('4. 狼人杀 12 人审判桌与昼夜交替视觉走查', async ({ browser }) => {
    const seeded = seedRoom(DB_PATH, {
      gameId: 'werewolf',
      count: 12,
      ready: true,
      config: { rulesetId: 'werewolf_platform_open_kill_v1' },
    });
    const hostDriver = await RoomDriver.resume(WS_URL, seeded.roomCode, seeded.hostId, seeded.hostResumeToken);
    const startAck = await hostDriver.startGame({ rulesetId: 'werewolf_platform_open_kill_v1' });
    expect(startAck.type).toBe('ack');

    const p1 = seeded.players[1]!;
    const deskPage = await preparePlayerPage(browser, 1280, 800, {
      ...p1,
      roomCode: seeded.roomCode,
      nickname: '预言家小李',
    });
    await deskPage.goto(BASE_URL);
    await expect(deskPage.locator('.seat-ring').first()).toBeVisible({ timeout: 20_000 });
    await saveScreenshot(deskPage, '11_werewolf_tabletop_desktop.png');

    // 移动端狼人杀牌桌
    const mobPage = await preparePlayerPage(browser, 390, 844, {
      ...p1,
      roomCode: seeded.roomCode,
      nickname: '预言家小李',
    });
    await mobPage.goto(BASE_URL);
    await expect(mobPage.locator('.werewolf-wing').first()).toBeVisible({ timeout: 20_000 });
    await mobPage.waitForTimeout(500);
    await saveScreenshot(mobPage, '12_werewolf_tabletop_mobile.png');

    // 推进或渲染终局复盘遮罩走查
    hostDriver.client.close();
    await deskPage.context().close();
    await mobPage.context().close();
  });

  test('5. 斗地主（Landlord）牌桌与扇形手牌引擎视觉走查', async ({ browser }) => {
    const seeded = seedRoom(DB_PATH, {
      gameId: 'landlord',
      count: 3,
      ready: true,
      config: { rulesetId: 'landlord_platform_v1' },
    });
    const hostDriver = await RoomDriver.resume(WS_URL, seeded.roomCode, seeded.hostId, seeded.hostResumeToken);
    const startAck = await hostDriver.startGame({ rulesetId: 'landlord_platform_v1' });
    expect(startAck.type).toBe('ack');

    const p1 = seeded.players[0]!;
    const deskPage = await preparePlayerPage(browser, 1280, 800, {
      ...p1,
      roomCode: seeded.roomCode,
      nickname: '地主老王',
    });
    await deskPage.goto(BASE_URL);
    await expect(deskPage.locator('.tabletop-shell, .landlord-stage')).toBeVisible({ timeout: 20_000 });
    await saveScreenshot(deskPage, '13_landlord_tabletop_desktop.png');

    // 移动端斗地主
    const mobPage = await preparePlayerPage(browser, 390, 844, {
      ...p1,
      roomCode: seeded.roomCode,
      nickname: '地主老王',
    });
    await mobPage.goto(BASE_URL);
    await expect(mobPage.locator('.tabletop-shell, .landlord-stage')).toBeVisible({ timeout: 20_000 });
    await saveScreenshot(mobPage, '14_landlord_tabletop_mobile.png');

    hostDriver.client.close();
    await deskPage.context().close();
    await mobPage.context().close();
  });

  test('6b. 以鹅传鹅 / 囚徒之夜 / 伪人测试 / 铃铛对决 桌面视觉走查', async ({ browser }) => {
    type ShotSpec = { file: string; gameId: string; count: number; config: Record<string, unknown>; nickname: string };
    const specs: ShotSpec[] = [
      { file: '20_goose_relay_tabletop.png', gameId: 'goose-relay', count: 5, config: { rulesetId: 'goose_relay_classic_v1', relaySeconds: 30, discussionSeconds: 30, accuseSeconds: 30, voteSeconds: 30 }, nickname: '鹅鹅1号' },
      { file: '21_night_testimony_tabletop.png', gameId: 'night-testimony', count: 4, config: { rulesetId: 'night_testimony_v1', questionSeconds: 30, deductionSeconds: 30, voteSeconds: 30, questionLimit: 4 }, nickname: '证人甲' },
      { file: '22_echo_judge_tabletop.png', gameId: 'echo-judge', count: 4, config: { rulesetId: 'echo_judge_v1', answerSeconds: 30, judgmentSeconds: 30 }, nickname: '陪审员' },
      { file: '23_bell_clash_tabletop.png', gameId: 'bell-clash', count: 3, config: { rulesetId: 'bell_clash_v1', handSize: 3, turnSeconds: 30, bellSeconds: 30 }, nickname: '铃王' },
    ];
    for (const spec of specs) {
      const seeded = seedRoom(DB_PATH, { gameId: spec.gameId, count: spec.count, ready: true, config: spec.config });
      const driver = await RoomDriver.resume(WS_URL, seeded.roomCode, seeded.hostId, seeded.hostResumeToken);
      const startAck = await driver.startGame(spec.config);
      if (startAck.type !== 'ack') throw new Error(`${spec.gameId} startGame 失败：${startAck.payload?.code ?? ''} ${startAck.payload?.message ?? ''}`);
      const page = await preparePlayerPage(browser, 1280, 800, { ...seeded.players[0]!, roomCode: seeded.roomCode, nickname: spec.nickname });
      await page.goto(BASE_URL);
      await expect(page.locator('.tabletop-shell')).toBeVisible({ timeout: 20_000 });
      await saveScreenshot(page, spec.file);
      driver.client.close();
      await page.context().close();
    }
  });

  test('6. 热门桌游（情书 / 奶酪大盗 / 榴莲 / 铃铛对决）桌面视觉走查', async ({ browser }) => {
    // 情书
    const llSeeded = seedRoom(DB_PATH, { gameId: 'loveletter', count: 2, ready: true });
    const llDriver = await RoomDriver.resume(WS_URL, llSeeded.roomCode, llSeeded.hostId, llSeeded.hostResumeToken);
    await llDriver.startGame();
    const deskPage = await preparePlayerPage(browser, 1280, 800, {
      ...llSeeded.players[0]!,
      roomCode: llSeeded.roomCode,
      nickname: '玩家A',
    });
    await deskPage.goto(BASE_URL);
    await expect(deskPage.locator('.tabletop-shell')).toBeVisible({ timeout: 20_000 });
    await saveScreenshot(deskPage, '15_loveletter_tabletop.png');

    // 奶酪大盗（min 5 人）
    const ctSeeded = seedRoom(DB_PATH, {
      gameId: 'cheese-thief',
      count: 5,
      ready: true,
      config: { rulesetId: 'cheese_thief_classic_v1', nightHourSeconds: 10, discussionSeconds: 10, voteSeconds: 10 },
    });
    const ctDriver = await RoomDriver.resume(WS_URL, ctSeeded.roomCode, ctSeeded.hostId, ctSeeded.hostResumeToken);
    await ctDriver.startGame({ rulesetId: 'cheese_thief_classic_v1', nightHourSeconds: 10, discussionSeconds: 10, voteSeconds: 10 });
    const ctPage = await preparePlayerPage(browser, 1280, 800, {
      ...ctSeeded.players[0]!,
      roomCode: ctSeeded.roomCode,
      nickname: '小偷玩家',
    });
    await ctPage.goto(BASE_URL);
    await expect(ctPage.locator('.tabletop-shell')).toBeVisible({ timeout: 20_000 });
    await saveScreenshot(ctPage, '16_cheese_thief_tabletop.png');

    // 榴莲
    const durianSeeded = seedRoom(DB_PATH, { gameId: 'durian', count: 2, ready: true });
    const durianDriver = await RoomDriver.resume(WS_URL, durianSeeded.roomCode, durianSeeded.hostId, durianSeeded.hostResumeToken);
    await durianDriver.startGame();
    const durianPage = await preparePlayerPage(browser, 1280, 800, {
      ...durianSeeded.players[0]!,
      roomCode: durianSeeded.roomCode,
      nickname: '店长',
    });
    await durianPage.goto(BASE_URL);
    await expect(durianPage.locator('.tabletop-shell')).toBeVisible({ timeout: 20_000 });
    await saveScreenshot(durianPage, '17_durian_tabletop.png');

    llDriver.client.close();
    ctDriver.client.close();
    durianDriver.client.close();
    await deskPage.context().close();
    await ctPage.context().close();
    await durianPage.context().close();
  });

  test('6c. 桌面模拟模式（奶酪大盗 / 铃铛对决 / 囚徒之夜 / 伪人测试 / 鹅传鹅）自由道具走查', async ({ browser }) => {
    type SimShotSpec = { file: string; gameId: string; count: number; config: Record<string, unknown>; nickname: string };
    const simSpecs: SimShotSpec[] = [
      { file: '24_sim_cheese_thief.png', gameId: 'cheese-thief', count: 5, config: { rulesetId: 'cheese_thief_sim_v1', roleCards: true }, nickname: '盗鼠模拟' },
      { file: '25_sim_bell_clash.png', gameId: 'bell-clash', count: 3, config: { rulesetId: 'bell_clash_sim_v1', handSize: 3 }, nickname: '叮铃模拟' },
      { file: '26_sim_goose_relay.png', gameId: 'goose-relay', count: 5, config: { rulesetId: 'goose_relay_sim_v1', candidateCount: 9 }, nickname: '鹅传模拟' },
      { file: '27_sim_night_testimony.png', gameId: 'night-testimony', count: 4, config: { rulesetId: 'night_testimony_sim_v1' }, nickname: '证词模拟' },
      { file: '28_sim_echo_judge.png', gameId: 'echo-judge', count: 4, config: { rulesetId: 'echo_judge_sim_v1' }, nickname: '伪人模拟' },
    ];
    for (const spec of simSpecs) {
      const seeded = seedRoom(DB_PATH, { gameId: spec.gameId, count: spec.count, ready: true, config: spec.config });
      const driver = await RoomDriver.resume(WS_URL, seeded.roomCode, seeded.hostId, seeded.hostResumeToken);
      const startAck = await driver.startGame(spec.config);
      if (startAck.type !== 'ack') throw new Error(`${spec.gameId} sim startGame 失败：${startAck.payload?.code ?? ''} ${startAck.payload?.message ?? ''}`);
      const page = await preparePlayerPage(browser, 1280, 800, { ...seeded.players[0]!, roomCode: seeded.roomCode, nickname: spec.nickname });
      await page.goto(BASE_URL);
      await expect(page.locator('.tabletop-shell').first()).toBeVisible({ timeout: 20_000 });
      await page.waitForTimeout(400);
      await saveScreenshot(page, spec.file);
      driver.client.close();
      await page.context().close();
    }
  });
});
