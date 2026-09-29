/**
 * 狼人杀剧场视觉改造 · 截图采集（W03 起逐任务扩充，W08 汇总到 after/ 目录）。
 *
 * 对局推进全靠真实链路：seedRoom 直插 12 人房 → 房主 start_game → WerewolfAutopilot
 * 驱动其余 11 人按各自身份视角行动 → 浏览器玩家（你 = 6 号团子）走真实 UI。
 * 截图落在 test-results/werewolf-wXX/（中间态验证图；正式组在 W08 汇总）。
 */
import { test, expect, type Browser, type Page } from '@playwright/test';
import { DatabaseSync } from 'node:sqlite';
import { seedRoom, type SeededRoom } from './helpers/dbClient.ts';
import { RoomDriver } from './helpers/wsClient.ts';
import { WerewolfAutopilot } from './helpers/werewolfAutopilot.ts';
import { seedActiveSession } from './support/sessionSeeder.ts';
import { werewolfV2Module } from '../packages/games/werewolf/server/v2/module.ts';
import { BASE_URL, DB_PATH, ME_STORAGE_KEY, WS_URL, skipPcHostConsole } from './helpers/serverEnv.ts';
import * as fs from 'node:fs';
import * as path from 'node:path';

const V2_CONFIG = {
  rulesetId: 'werewolf_platform_open_kill_v1',
  preset: 'classic',
  pace: 'relaxed',
  witchSelfSave: 'first_night',
  winCondition: 'numbers',
} as const;

/** 契约 §6 fixture 昵称（1–12 号，6 号是你） */
const FIXTURE_NICKNAMES = [
  '月下听风', '阿澈', '小鹿乱撞', 'Kiki', '夜行的猫头鹰', '团子',
  '老周', '星期八', '白桃乌龙', '阿木', '三分糖', '北岛',
];

const SHOT_ROOT = 'output/werewolf-shots';

export interface TableSession {
  seeded: SeededRoom;
  auto: WerewolfAutopilot;
  hostDriver: RoomDriver;
  roles: Map<number, string>;
}

/** 反复开房直到 6 号（你）拿到期望身份；返回房间与已启动的自动桌。 */
export async function openTableWithRole(
  wantRole: string,
  options: { maxAttempts?: number } = {},
): Promise<TableSession> {
  const maxAttempts = options.maxAttempts ?? 30;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const seeded = seedRoom(DB_PATH, {
      gameId: 'werewolf',
      count: 12,
      ready: true,
      config: V2_CONFIG,
      nicknames: FIXTURE_NICKNAMES,
    });
    const auto = await WerewolfAutopilot.start(WS_URL, seeded.roomCode, seeded.players);
    try {
      const hostDriver = auto.drivers.get(seeded.hostId)!;
      const startAck = await hostDriver.startGame(V2_CONFIG);
      if (startAck.type !== 'ack') throw new Error(`start_game 失败：${String(startAck.payload.code ?? '')}`);
      const roles = await auto.probeRoles();
      if (roles.get(6) === wantRole) return { seeded, auto, hostDriver, roles };
    } catch (err) {
      auto.closeAll();
      throw err;
    }
    auto.closeAll();
  }
  throw new Error(`连续 ${maxAttempts} 次开房 6 号都不是 ${wantRole}`);
}

/** 摘出浏览器玩家（默认 6 号）的驱动并交给浏览器会话接管。 */
export function detachBrowserDriver(session: TableSession, seat = 6): { playerId: string; resumeToken: string } {
  const player = session.seeded.players[seat - 1]!;
  const driver = session.auto.drivers.get(player.playerId);
  if (driver) {
    session.auto.drivers.delete(player.playerId);
    driver.client.close();
  }
  return { playerId: player.playerId, resumeToken: player.resumeToken };
}

export async function openPlayerPage(
  browser: Browser,
  session: TableSession,
  seat: number,
  viewport: { width: number; height: number },
): Promise<Page> {
  const player = session.seeded.players[seat - 1]!;
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  await skipPcHostConsole(page);
  await page.addInitScript(
    ([key, value]) => { localStorage.setItem(key, value); },
    [ME_STORAGE_KEY, JSON.stringify({
      playerId: player.playerId,
      resumeToken: player.resumeToken,
      roomCode: session.seeded.roomCode,
      nickname: FIXTURE_NICKNAMES[seat - 1]!,
      seatRole: 'player',
    })],
  );
  await page.goto(BASE_URL);
  await expect(page.locator('.werewolf-native-page').first()).toBeVisible({ timeout: 30_000 });
  return page;
}

/** W06 起发身份是两步：先点中央大牌翻开，再点黄色「我已记住身份并就绪」。 */
export async function confirmRoleWithFlip(page: Page): Promise<void> {
  await page.locator('.ww-deal').click();
  await expect(page.locator('.ww-deal')).toHaveClass(/flipped/);
  await page.getByRole('button', { name: /我已记住身份/ }).click();
}

const COUNTDOWN_MASK = ['.ww-timer .num', '.stage-top .time'];

export async function shot(page: Page, dir: string, name: string): Promise<string> {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, name);
  await page.screenshot({
    path: file,
    fullPage: false,
    mask: COUNTDOWN_MASK.map((selector) => page.locator(selector)),
  });
  return file;
}

test.describe('狼人杀剧场视觉 · 逐任务截图', () => {
  test('W03 白天发言：speech（5号发言，你下一位）与 speech-self（轮到你）', async ({ browser }) => {
    test.setTimeout(600_000);
    const dir = path.join(SHOT_ROOT, 'werewolf-w03');
    const session = await openTableWithRole('villager');
    const drive = session.auto.run().catch(() => {});
    try {
      detachBrowserDriver(session, 6);
      // 夜：狼刀 1 号（他人），女巫不救不毒，守卫空守；预言家验 4 号
      session.auto.nightScript = { victimSeat: 1, seerCheckSeat: 4, witchSaves: false, witchPoisonSeat: null, guardSeat: null };
      session.auto.pauseSpeaker(5);
      session.auto.pauseSpeaker(6);

      const page = await openPlayerPage(browser, session, 6, { width: 1280, height: 800 });

      // 身份确认（真实 UI：翻牌 → 黄色主按钮）
      await confirmRoleWithFlip(page);
      // 天亮公告确认
      const confirmDay = page.getByRole('button', { name: /已知晓死讯/ });
      await confirmDay.waitFor({ timeout: 180_000 });
      await confirmDay.click();

      // 等到 5 号成为发言者（发言者票根 is-speaking）
      await expect(page.locator('.seat.ticket.is-speaking')).toHaveAttribute('data-seat', '5', { timeout: 180_000 });
      // 中央追光：5 号「夜行的猫头鹰」
      await expect(page.locator('.ww-speaker__big')).toHaveText('夜行的猫头鹰');
      // 票根状态行：5 发言中，6 下一位
      await expect(page.locator('.seat.ticket[data-seat="6"] .tag')).toHaveText('下一位');
      await expect(page.locator('.seat.ticket[data-seat="5"] .tag')).toHaveText('发言中');
      // 同视口黄色主按钮 ≤1（等待态不再是黄色）
      await expect(page.locator('.ww-global-action-btn.primary')).toHaveCount(0);

      await page.waitForTimeout(400);
      await shot(page, dir, 'werewolf-speech-1280x800.png');
      await page.setViewportSize({ width: 390, height: 844 });
      await page.waitForTimeout(400);
      await shot(page, dir, 'werewolf-speech-390x844.png');

      // 放行 5 号交麦 → 轮到 6 号（你）
      session.auto.releaseSpeaker(5);
      await expect(page.locator('.seat.ticket.is-speaking')).toHaveAttribute('data-seat', '6', { timeout: 120_000 });
      await expect(page.locator('.ww-speaker__big')).toHaveText('轮到你了');
      // 黄色主按钮唯一：发言完毕 · 交麦
      const pass = page.getByRole('button', { name: /发言完毕 · 交麦/ });
      await expect(pass).toBeVisible();
      await expect(page.locator('.ww-global-action-btn.primary')).toHaveCount(1);

      await page.setViewportSize({ width: 1280, height: 800 });
      await page.waitForTimeout(400);
      await shot(page, dir, 'werewolf-speech-self-1280x800.png');
      await page.setViewportSize({ width: 390, height: 844 });
      await page.waitForTimeout(400);
      await shot(page, dir, 'werewolf-speech-self-390x844.png');

      await page.context().close();
      void drive;
    } finally {
      session.auto.closeAll();
    }
  });

  test('W04 入夜：night-wolf（你是狼人，点票根→黄色确认 两步）', async ({ browser }) => {
    test.setTimeout(600_000);
    const dir = path.join(SHOT_ROOT, 'werewolf-w04');
    const session = await openTableWithRole('wolf');
    const drive = session.auto.run().catch(() => {});
    try {
      detachBrowserDriver(session, 6);
      // 其余狼刀 4 号；女巫不救不毒；预言家验 4 号；守卫空守
      session.auto.nightScript = { victimSeat: 4, seerCheckSeat: 4, witchSaves: false, witchPoisonSeat: null, guardSeat: null };

      const page = await openPlayerPage(browser, session, 6, { width: 1280, height: 800 });
      await confirmRoleWithFlip(page);

      // 狼人回合中央场景：狼人请睁眼 + 插画就绪
      await expect(page.locator('.ww-wake[data-role="wolf"]')).toBeVisible({ timeout: 180_000 });
      await expect(page.locator('.ww-wake[data-role="wolf"]')).toHaveAttribute('data-ready', 'true');
      await expect(page.locator('.ww-wake__big')).toHaveText('狼人请睁眼');
      // 队友票根：狼爪 + 「狼队友 / 同伴 · 选了 N 号」
      const mateSeat = [...session.roles.entries()].find(([seat, role]) => seat !== 6 && role === 'wolf')?.[0];
      if (mateSeat !== undefined) {
        await expect(page.locator(`.seat.ticket[data-seat="${mateSeat}"] .mate-paw`)).toBeVisible();
        // 队友可能已投票（竞态）：未投「狼队友」，已投「同伴 · 选了 N 号」
        await expect(page.locator(`.seat.ticket[data-seat="${mateSeat}"] .tag`)).toContainText(/狼队友|同伴/);
      }
      // 未选中前：无黄色主按钮
      await expect(page.locator('.ww-global-action-btn.primary')).toHaveCount(0);

      // 两步第一步：点 4 号票根只选中，不发送（状态行变「已选」而非「已锁定」）
      // 等 intro/open 段播完、服务器下发出刀目标（票根变可点）再点
      await expect(page.locator('.seat.ticket[data-seat="4"]')).toHaveClass(/pickable/, { timeout: 60_000 });
      await page.locator('.seat.ticket[data-seat="4"]').click();
      await expect(page.locator('.seat.ticket[data-seat="4"]')).toHaveClass(/is-picked/);
      await expect(page.locator('.seat.ticket[data-seat="4"] .stamp')).toBeVisible();
      await expect(page.locator('.ww-wake__line')).toContainText('已选');
      // 两步第二步：唯一黄色主按钮「确认袭击 · 4 号」
      const confirm = page.getByRole('button', { name: /确认袭击 · 4 号/ });
      await expect(confirm).toBeVisible();
      await expect(page.locator('.ww-global-action-btn.primary')).toHaveCount(1);

      await page.waitForTimeout(300);
      await shot(page, dir, 'werewolf-night-wolf-1280x800.png');
      await page.setViewportSize({ width: 390, height: 844 });
      await page.waitForTimeout(400);
      await shot(page, dir, 'werewolf-night-wolf-390x844.png');

      // 点击确认后才真正发送：状态行变「已锁定」
      await confirm.click();
      await expect(page.locator('.ww-wake__line')).toContainText('已锁定', { timeout: 30_000 });
      await expect(page.locator('.ww-global-action-btn.primary')).toHaveCount(0);

      await page.context().close();
      void drive;
    } finally {
      session.auto.closeAll();
    }
  });

  test('W04 入夜：night-witch（你是女巫，药瓶 + 被刀红光 + 两步确认）', async ({ browser }) => {
    test.setTimeout(600_000);
    const dir = path.join(SHOT_ROOT, 'werewolf-w04');
    const session = await openTableWithRole('witch');
    const drive = session.auto.run().catch(() => {});
    try {
      detachBrowserDriver(session, 6);
      // 狼刀 4 号 Kiki；预言家验 4 号；守卫空守（女巫是浏览器玩家，由 UI 决断）
      session.auto.nightScript = { victimSeat: 4, seerCheckSeat: 4, witchSaves: false, witchPoisonSeat: null, guardSeat: null };

      const page = await openPlayerPage(browser, session, 6, { width: 1280, height: 800 });
      await confirmRoleWithFlip(page);

      // 女巫回合中央场景：女巫请睁眼 + 说明行「今晚 4 号 Kiki 倒下了」
      await expect(page.locator('.ww-wake[data-role="witch"]')).toBeVisible({ timeout: 180_000 });
      await expect(page.locator('.ww-wake__big')).toHaveText('女巫请睁眼');
      await expect(page.locator('.ww-wake__line')).toContainText('4 号 Kiki');
      // 被刀者票根：红光 + 「今晚倒下」
      await expect(page.locator('.seat.ticket[data-seat="4"]')).toHaveClass(/is-victim/);
      await expect(page.locator('.seat.ticket[data-seat="4"] .tag')).toContainText('今晚倒下');
      // 药瓶两瓶可见、未决断前无黄色主按钮
      await expect(page.locator('.ww-potions button')).toHaveCount(2);
      await expect(page.locator('.ww-global-action-btn.primary')).toHaveCount(0);

      await page.waitForTimeout(300);
      await shot(page, dir, 'werewolf-night-witch-1280x800.png');
      await page.setViewportSize({ width: 390, height: 844 });
      await page.waitForTimeout(400);
      await shot(page, dir, 'werewolf-night-witch-390x844.png');

      // 两步验证：点 ☠ 毒药（=放弃解药）→ 点 9 号票根只选中 → 黄色「向 9 号下毒」
      await page.getByRole('button', { name: /毒药/ }).click();
      await expect(page.locator('.ww-wake__line')).toContainText('毒杀', { timeout: 30_000 });
      // 等服务器下发毒药目标再点
      await expect(page.locator('.seat.ticket[data-seat="9"]')).toHaveClass(/pickable/, { timeout: 60_000 });
      await page.locator('.seat.ticket[data-seat="9"]').click();
      await expect(page.locator('.ww-wake__line')).toContainText('已选');
      const confirm = page.getByRole('button', { name: /向 9 号 下毒/ });
      await expect(confirm).toBeVisible();
      await expect(page.locator('.ww-global-action-btn.primary')).toHaveCount(1);
      await shot(page, dir, 'werewolf-night-witch-poison-pick-390x844.png');

      await page.context().close();
      void drive;
    } finally {
      session.auto.closeAll();
    }
  });

  test('W04 入夜：night-sleep（你是村民，闭眼等待 + 剪影 + 全席压暗）', async ({ browser }) => {
    test.setTimeout(600_000);
    const dir = path.join(SHOT_ROOT, 'werewolf-w04');
    const session = await openTableWithRole('villager');
    const drive = session.auto.run().catch(() => {});
    try {
      detachBrowserDriver(session, 6);
      session.auto.nightScript = { victimSeat: 1, seerCheckSeat: 4, witchSaves: false, witchPoisonSeat: null, guardSeat: null };

      const page = await openPlayerPage(browser, session, 6, { width: 1280, height: 800 });
      await confirmRoleWithFlip(page);

      // 闭眼等待态：中央剪影 + 「狼人正在行动」+ 全席压暗
      await expect(page.locator('.ww-wake.sleeping')).toBeVisible({ timeout: 180_000 });
      await expect(page.locator('.ww-wake__big')).toContainText('正在行动');
      await expect(page.locator('.layout')).toHaveAttribute('data-view', 'sleep');
      await expect(page.locator('.seat.ticket[data-seat="6"] .tag')).toHaveText('闭眼中');
      // 无黄色主按钮、无可点席位
      await expect(page.locator('.ww-global-action-btn.primary')).toHaveCount(0);
      await expect(page.locator('.seat.ticket.pickable')).toHaveCount(0);

      await page.waitForTimeout(300);
      await shot(page, dir, 'werewolf-night-sleep-1280x800.png');
      await page.setViewportSize({ width: 390, height: 844 });
      await page.waitForTimeout(400);
      await shot(page, dir, 'werewolf-night-sleep-390x844.png');

      await page.context().close();
      void drive;
    } finally {
      session.auto.closeAll();
    }
  });

  test('W06 发身份：deal（卡背→翻开→黄色确认按钮才出现）', async ({ browser }) => {
    test.setTimeout(300_000);
    const dir = path.join(SHOT_ROOT, 'werewolf-w06');
    // 验收表 #1：deal 画面 = 你的牌已翻开（女巫）
    const session = await openTableWithRole('witch');
    const drive = session.auto.run().catch(() => {});
    try {
      detachBrowserDriver(session, 6);
      const page = await openPlayerPage(browser, session, 6, { width: 1280, height: 800 });

      // 卡背可见；翻开前无「我已记住身份」按钮（契约 §4.0 唯一黄色主按钮纪律）
      await expect(page.locator('.ww-deal')).toBeVisible({ timeout: 60_000 });
      await expect(page.getByRole('button', { name: /我已记住身份/ })).toHaveCount(0);
      await expect(page.locator('.ww-rcenter__kicker')).toHaveText('第 1 夜之前 · 查看你的身份');
      await expect(page.locator('.seat.ticket[data-seat="6"] .tag')).toHaveText('你 · 查看中');

      // 翻开 → 身份名 + 阵营 + 技能 + 黄色确认按钮出现
      await page.locator('.ww-deal').click();
      await expect(page.locator('.ww-deal')).toHaveClass(/flipped/);
      await expect(page.locator('.ww-deal__role-name')).toHaveText('女巫');
      await expect(page.locator('.ww-deal__team')).toHaveText('好人阵营');
      const confirm = page.getByRole('button', { name: /我已记住身份/ });
      await expect(confirm).toBeVisible();
      await expect(page.locator('.ww-global-action-btn.primary')).toHaveCount(1);

      await page.waitForTimeout(1400);
      await shot(page, dir, 'werewolf-deal-1280x800.png');
      await page.setViewportSize({ width: 390, height: 844 });
      await page.waitForTimeout(400);
      await shot(page, dir, 'werewolf-deal-390x844.png');

      await page.context().close();
      void drive;
    } finally {
      session.auto.closeAll();
    }
  });

  test('W05 投票/唱票/放逐：vote → count → exile（含两步投票）', async ({ browser }) => {
    test.setTimeout(600_000);
    const dir = path.join(SHOT_ROOT, 'werewolf-w05');
    const session = await openTableWithRole('villager');
    const drive = session.auto.run().catch(() => {});
    try {
      detachBrowserDriver(session, 6);
      session.auto.nightScript = { victimSeat: 1, seerCheckSeat: 4, witchSaves: false, witchPoisonSeat: null, guardSeat: null };
      // 公投计划：除浏览器 6 号外全员投 4 号（4 号投 9 号）→ 4 号 10 票被放逐（验收表 #7–#9：选 4 号、4 号放逐）
      const plan = new Map<number, number | null>();
      for (const seat of [2, 3, 5, 7, 8, 9, 10, 11, 12]) plan.set(seat, 4);
      plan.set(4, 9);
      session.auto.votePlan = plan;

      const page = await openPlayerPage(browser, session, 6, { width: 1280, height: 800 });
      await confirmRoleWithFlip(page);
      const confirmDay = page.getByRole('button', { name: /已知晓死讯/ });
      await confirmDay.waitFor({ timeout: 240_000 });
      await confirmDay.click();

      // 等讨论 + 自由发言跑完进入投票（自动驾驶立即交麦/准备投票）
      const readyVote = page.getByRole('button', { name: /准备进入投票/ });
      await readyVote.waitFor({ timeout: 300_000 });
      await readyVote.click();
      await expect(page.locator('.ww-vcenter')).toBeVisible({ timeout: 120_000 });
      await expect(page.locator('.ww-vcenter__kicker')).toContainText('放逐投票');
      await expect(page.locator('.ww-vcenter__big')).toHaveText('投出你心中的狼');
      await expect(page.locator('.ww-urn')).toBeVisible();
      // 隐私：投票中只显示进度人数，不出现任何「谁投了谁」
      await expect(page.locator('.ww-vcenter')).not.toContainText('投了');

      // 两步投票：点 4 号 → 「投给 4 号」黄色唯一主按钮（验收表 #7：已选 4 号未确认）
      await expect(page.locator('.seat.ticket[data-seat="4"]')).toHaveClass(/pickable/, { timeout: 60_000 });
      await page.locator('.seat.ticket[data-seat="4"]').click();
      await expect(page.locator('.seat.ticket[data-seat="4"]')).toHaveClass(/is-picked/);
      const voteBtn = page.getByRole('button', { name: /投给 4 号/ });
      await expect(voteBtn).toBeVisible();
      await expect(page.locator('.ww-global-action-btn.primary')).toHaveCount(1);

      await page.waitForTimeout(300);
      await shot(page, dir, 'werewolf-vote-1280x800.png');
      await page.setViewportSize({ width: 390, height: 844 });
      await page.waitForTimeout(400);
      await shot(page, dir, 'werewolf-vote-390x844.png');
      await page.setViewportSize({ width: 1280, height: 800 });

      // 确认投票 → 等唱票完成（大字落定 + 4 号票数徽章）
      await voteBtn.click();
      await expect(page.locator('.ww-vcenter__kicker')).toHaveText('唱票', { timeout: 180_000 });
      await expect(page.locator('.ww-vcenter__big')).not.toHaveText('正在开箱…', { timeout: 120_000 });
      await expect(page.locator('.ww-vcenter__big')).toHaveText('4 号得票最多');
      await expect(page.locator('.seat.ticket[data-seat="4"] .votes')).toHaveText('10', { timeout: 60_000 });
      // 最高票金光锁定（验收表 #8：唱票结束）
      await expect(page.locator('.seat.ticket[data-seat="4"]')).toHaveClass(/top/);

      await page.waitForTimeout(300);
      await shot(page, dir, 'werewolf-count-1280x800.png');
      await page.setViewportSize({ width: 390, height: 844 });
      await page.waitForTimeout(400);
      await shot(page, dir, 'werewolf-count-390x844.png');
      await page.setViewportSize({ width: 1280, height: 800 });

      // 撕票落定后（验收表 #9：4 号被放逐·撕票后）仍在 vote_result 内截
      await page.waitForTimeout(900);
      await shot(page, dir, 'werewolf-exile-1280x800.png');
      await page.setViewportSize({ width: 390, height: 844 });
      await page.waitForTimeout(400);
      await shot(page, dir, 'werewolf-exile-390x844.png');
      await page.setViewportSize({ width: 1280, height: 800 });

      // 遗言：中央遗言追光 + 4 号票根 last-words（Kiki）
      await expect(page.locator('.ww-speaker')).toBeVisible({ timeout: 180_000 });
      await expect(page.locator('.ww-speaker__big')).toHaveText('Kiki');
      await expect(page.locator('.seat.ticket[data-seat="4"]')).toHaveClass(/last-words/);
      await expect(page.locator('.seat.ticket[data-seat="4"] .tag')).toHaveText('🎙 发表遗言');

      await page.context().close();
      void drive;
    } finally {
      session.auto.closeAll();
    }
  });

  test('W07 终局揭晓：finale-village / finale-wolves（票根翻面 + 胜负盖章）', async ({ browser }) => {
    test.setTimeout(300_000);
    const dir = path.join(SHOT_ROOT, 'werewolf-w07');
    for (const scenario of [
      { winner: 'village' as const, banner: '好人胜利', name: 'finale-village' },
      { winner: 'wolves' as const, banner: '狼人胜利', name: 'finale-wolves' },
    ]) {
      // 直造终局态（规则/胜负计算不在本用例验证范围；与 werewolf-result.spec.ts 同一种子手法）
      const seeded = seedActiveSession(DB_PATH, {
        module: {
          ...werewolfV2Module,
          createInitialState: (ctx: unknown, players: unknown, config: unknown) => {
            const state = werewolfV2Module.createInitialState(ctx as never, players as never, config as never) as {
              phase: string; winner: string | null; day: number; deadlineAt: unknown; phaseToken: unknown; timelineState: unknown;
              players: Record<string, { role: string; alive: boolean; exitReason: string | null }>;
            };
            state.phase = 'game_over';
            state.winner = scenario.winner;
            state.day = 3; // 种子态 day=0 会让 kicker 显示「第 0 天」，真实终局从第 1 天起
            state.deadlineAt = null;
            state.phaseToken = null;
            state.timelineState = null;
            // 死因多样化：狼队全灭（好人胜）或村民/神职减员（狼人胜）
            const exits = ['night_kill', 'voted_out', 'poisoned', 'hunter_shot'] as const;
            let i = 0;
            for (const player of Object.values(state.players)) {
              const isWolf = player.role === 'wolf';
              player.alive = scenario.winner === 'village' ? !isWolf : isWolf;
              player.exitReason = player.alive ? null : exits[i++ % exits.length]!;
            }
            return state as never;
          },
        },
        count: 12,
        config: { rulesetId: 'werewolf_platform_open_kill_v1', preset: 'classic', pace: 'fast' },
      });
      // fixture 昵称入库（与真实对局截图一致）
      const db = new DatabaseSync(DB_PATH);
      seeded.players.forEach((player, i) => {
        db.prepare('UPDATE room_members SET nickname = ? WHERE player_id = ?').run(FIXTURE_NICKNAMES[i]!, player.playerId);
      });
      db.close();

      const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const page = await context.newPage();
      await skipPcHostConsole(page);
      await page.addInitScript(
        ([key, value]) => { localStorage.setItem(key, value); },
        [ME_STORAGE_KEY, JSON.stringify({
          playerId: seeded.hostId,
          resumeToken: seeded.hostResumeToken,
          roomCode: seeded.roomCode,
          nickname: FIXTURE_NICKNAMES[5]!,
          seatRole: 'player',
        })],
      );
      await page.goto(BASE_URL);

      // 中央：胜负大字盖章 + 胜方阵容
      await expect(page.locator('.ww-finale__banner')).toHaveText(scenario.banner, { timeout: 30_000 });
      // 票根逐张翻面播完（12 张全亮）
      await expect(page.locator('.seat.ticket.revealed')).toHaveCount(12, { timeout: 30_000 });
      // 胜方金光存在
      expect(await page.locator('.seat.ticket.winner').count()).toBeGreaterThan(0);
      // 复盘弹窗不再自动弹出，只经按钮打开
      await expect(page.locator('.ww-result-modal')).toHaveCount(0);
      await expect(page.getByRole('button', { name: '查看终局复盘', exact: true })).toBeVisible();

      await page.waitForTimeout(600);
      await shot(page, dir, `werewolf-${scenario.name}-1280x800.png`);
      await page.setViewportSize({ width: 390, height: 844 });
      await page.waitForTimeout(500);
      await shot(page, dir, `werewolf-${scenario.name}-390x844.png`);

      await context.close();
    }
  });
});
