/**
 * D5 P2b：上架游戏建房链路 Chromium 验收（真实 create_room 准入）。
 *
 * 平台状态：undercover / werewolf / landlord 已 playable（catalog availability='playable' +
 * 台账 catalogStatus='playable' + rights 授权证据齐备）；uno 保持 blocked_rights 不可建房。
 * 本 spec 全部走真实浏览器：首页 → 游戏卡「创建房间」→ 建房表单 → 服务端 create_room。
 *
 * 验证内容：
 * - undercover 完整局：首页建房 → 添加规则机器人 → 准备 → 开局 → 浏览器玩家全程参与
 *   （看词确认 / 发言交棒 / 投票），3 个规则机器人驱动其余回合，直至真实服务端产出
 *   game_over（完整局 = 从开局到唯一正式结果）。
 * - werewolf / landlord 最小建房断言：首页可见、卡面「创建房间」可点、服务端 accept
 *   并进入房间大厅（房间码渲染、data-game-id 正确）。
 * - uno：blocked_rights 不出现在首页生产目录（首页不可见，即不可建房）。
 */
import { test, expect, type Page } from '@playwright/test';
import { DatabaseSync } from 'node:sqlite';
import { BASE_URL, DB_PATH } from './helpers/serverEnv.ts';

/** 首页卡片：按展示名精确定位（avoid 误命中房间页的 room-code-card）。 */
function homeCard(page: Page, displayName: string) {
  return page.locator('.game-card').filter({
    has: page.getByRole('heading', { name: displayName, exact: true }),
  });
}

/** 建房表单流程：点击该游戏卡的「创建房间」→ 填昵称 → 提交 → 断言进入房间大厅。 */
async function createRoomFromHome(page: Page, displayName: string, nickname: string): Promise<void> {
  const card = homeCard(page, displayName);
  await expect(card).toBeVisible({ timeout: 20_000 });
  await card.getByRole('button', { name: '创建房间' }).click();
  await page.locator('#create-nickname').fill(nickname);
  await page.getByRole('button', { name: '创建并进入房间' }).click();
}

/**
 * 浏览器玩家（房主）完整局驱动器：
 * 看词确认 → 轮到自己发言时交棒 → 投票阶段投出合法一票；
 * 其余回合全部由规则机器人经 BotRunner 自动驱动。
 * 终局判别：game_over 视图（如有短暂渲染）或房间进入 POST_GAME（对局已结算）——
 * 客户端在终局后立即用 RoomPage 替换游戏页，所以「对局已结算」是可靠信号。
 */
async function driveBrowserUndercover(page: Page, timeoutMs = 240_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  const confirmBtn = page.getByRole('button', { name: '我已记下，确认就绪' });
  const speechBtn = page.getByRole('button', { name: '发言完毕，交棒下一位' });
  const voteCard = page.locator('.vote-card:not(.self):not(:disabled)').first();
  let lastLog = 0;
  let lastPhase = '';

  while (Date.now() < deadline) {
    if (await page.locator('.game-phase.game-over').isVisible().catch(() => false)) return;
    const roomStatus = await page.locator('.room-status').textContent().catch(() => '');
    if (roomStatus.includes('对局已结算')) return;

    // 每 10 秒打一次对局状态探针（阶段/按钮可点性/连接状态）
    if (Date.now() - lastLog > 10_000) {
      lastLog = Date.now();
      const phase = (await page.locator('.game-phase').first().getAttribute('class').catch(() => 'unknown')) ?? 'unknown';
      const conn = await page.locator('.game-header').textContent().catch(() => '');
      const confirmState = await confirmBtn.isVisible().catch(() => false);
      const speechState = await speechBtn.isEnabled().catch(() => false);
      const voteCount = await voteCard.count().catch(() => 0);
      if (phase !== lastPhase) {
        lastPhase = phase;
        console.log(`[drive-undercover] phase=${phase} confirm=${confirmState} speech=${speechState} voteCards=${voteCount} conn=${(conn ?? '').slice(0, 40)}`);
      }
    }

    const confirmed = await confirmBtn.isVisible().catch(() => false)
      && await confirmBtn.isEnabled().catch(() => false);
    if (confirmed) {
      await confirmBtn.click();
      await page.waitForTimeout(400);
      continue;
    }

    const mySpeechTurn = await speechBtn.isVisible().catch(() => false)
      && await speechBtn.isEnabled().catch(() => false);
    if (mySpeechTurn) {
      await speechBtn.click();
      await page.waitForTimeout(400);
      continue;
    }

    if (await voteCard.count().catch(() => 0) > 0) {
      await voteCard.click();
      await page.waitForTimeout(400);
      continue;
    }

    await page.waitForTimeout(200);
  }
  throw new Error(`浏览器玩家驱动超时：对局未在 ${timeoutMs}ms 内结束（最后 phase=${lastPhase}）`);
}

/** 服务端权威结果断言：该房间会话至少产出一条正式战绩（完整局终局证据）。 */
function assertServerResultRow(roomCode: string): void {
  const db = new DatabaseSync(DB_PATH, { timeout: 5000 });
  try {
    const row = db.prepare(
      `SELECT COUNT(*) AS n FROM game_results r
       JOIN game_sessions s ON s.id = r.session_id
       JOIN rooms ro ON ro.id = s.room_id
       WHERE ro.code = ?`,
    ).get(roomCode) as { n: number };
    expect(row.n, `房间 ${roomCode} 应产出正式战绩行`).toBeGreaterThanOrEqual(1);
  } finally {
    db.close();
  }
}

test.describe('D5 P2b 上架建房链路', () => {
  test('undercover 完整局：首页建房 → 机器人凑数 → 开局 → 真实服务端终局', async ({ browser }) => {
    test.setTimeout(320_000);
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(BASE_URL);

    // 首页：undercover 可见且「创建房间」可用（availability=playable）
    const undercoverCard = homeCard(page, '谁是卧底');
    await expect(undercoverCard.getByRole('button', { name: '创建房间' })).toBeEnabled({ timeout: 20_000 });

    // 建房表单 → 服务端 create_room → 房间大厅
    await createRoomFromHome(page, '谁是卧底', '房主');
    const roomPage = page.locator('.room-page');
    await expect(roomPage).toBeVisible({ timeout: 20_000 });
    await expect(roomPage).toHaveAttribute('data-game-id', 'undercover');
    const roomCode = (await page.locator('.room-code').textContent())?.trim() ?? '';
    expect(roomCode).toMatch(/^[A-Z0-9]{5}$/);
    await expect(page.getByText('谁是卧底 · 房间大厅')).toBeVisible();

    // 添加 3 个规则机器人凑 4 人（机器人自动就绪）
    const addBot = page.getByRole('button', { name: '添加规则机器人' });
    await expect(addBot).toBeEnabled();
    for (let expected = 2; expected <= 4; expected += 1) {
      await addBot.click();
      await expect(page.locator('.members-list .member')).toHaveCount(expected);
    }

    // 房主准备 → 开始游戏
    await page.getByRole('button', { name: '准备', exact: true }).click();
    const startBtn = page.getByRole('button', { name: '开始游戏' });
    await expect(startBtn).toBeEnabled({ timeout: 20_000 });
    await startBtn.click();

    // 对局开始：看词阶段渲染
    await expect(page.locator('.game-page.phase-word_reveal').first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('查看你的秘密词条').first()).toBeVisible();

    // 完整局：浏览器玩家全程参与，规则机器人驱动其余回合，直到真实终局
    await driveBrowserUndercover(page);

    // 服务端权威终局证据：房间已结算（POST_GAME）+ 正式战绩行落库
    await expect(page.getByText('对局已结算').first()).toBeVisible({ timeout: 20_000 });
    assertServerResultRow(roomCode);

    await context.close();
  });

  test('werewolf 建房：首页可见且可创建房间（min 6 人）', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(BASE_URL);

    const werewolfCard = homeCard(page, '狼人杀');
    await expect(werewolfCard).toBeVisible({ timeout: 20_000 });
    await expect(werewolfCard.getByRole('button', { name: '创建房间' })).toBeEnabled();

    await createRoomFromHome(page, '狼人杀', '房主');
    const roomPage = page.locator('.room-page');
    await expect(roomPage).toBeVisible({ timeout: 20_000 });
    await expect(roomPage).toHaveAttribute('data-game-id', 'werewolf');
    await expect(page.locator('.room-code')).toBeVisible();
    await expect(page.getByText('狼人杀 · 房间大厅')).toBeVisible();

    await context.close();
  });

  test('landlord 建房：首页可见且可创建房间（legacy 与 platform_v1 均已登记）', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(BASE_URL);

    const landlordCard = homeCard(page, '斗地主');
    await expect(landlordCard).toBeVisible({ timeout: 20_000 });
    await expect(landlordCard.getByRole('button', { name: '创建房间' })).toBeEnabled();

    await createRoomFromHome(page, '斗地主', '房主');
    const roomPage = page.locator('.room-page');
    await expect(roomPage).toBeVisible({ timeout: 20_000 });
    await expect(roomPage).toHaveAttribute('data-game-id', 'landlord');
    await expect(page.locator('.room-code')).toBeVisible();
    await expect(page.getByText('斗地主 · 房间大厅')).toBeVisible();

    await context.close();
  });

  test('uno：blocked_rights 不出现在首页生产目录，不可建房', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(BASE_URL);

    await expect(homeCard(page, 'UNO')).toHaveCount(0);
    await expect(page.getByRole('button', { name: '创建房间' })).toHaveCount(3);

    await context.close();
  });
});
