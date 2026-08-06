/**
 * D4-B-UI：undercover_blank_v1 白板规则主舞台真实 Chromium 验收。
 *
 * 平台状态：start_game({ rulesetId: 'undercover_blank_v1' }) 经真实服务器成功开局
 * （D4 平台 ruleset 路由修复后按 (moduleId, rulesetId) 解析，本 spec 首条测试直接验证）。
 * 浏览器视角（白板/平民）用 seedActiveSession 确定性直插 ACTIVE 会话（e2e/support/sessionSeeder.ts）
 * 并重试到目标角色，保证「浏览器=白板」的终局猜词流程可测；后续动作全走真实 WS 与真实模块裁决。
 *
 * 验证内容（真实 Chromium 断言）：
 * - 有词/无词视角不泄漏：平民词条默认隐藏（占位文案），白板显式无词；他人都市词绝不进入 DOM。
 * - speaking / voting / final_guess（30 秒倒计时）状态渲染。
 * - submit / skip 是真实 game_action；提交被服务端拒绝时错误就近显示且输入保留。
 */
import { test, expect, type Browser, type Page } from '@playwright/test';
import { blankModule } from '../packages/games/undercover/server/blank/module.ts';
import { seedRoom } from './helpers/dbClient.ts';
import { RoomDriver } from './helpers/wsClient.ts';
import { seedActiveSession, type SeededSession } from './support/sessionSeeder.ts';
import { BASE_URL, DB_PATH, ME_STORAGE_KEY, WS_URL } from './helpers/serverEnv.ts';

const BLANK_CONFIG = { speechSeconds: 30, voteSeconds: 30 } as const;

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

/** 确定性 seed：重试 seedActiveSession 直到 players[1]（浏览器玩家）拿到目标角色。 */
function seedBlankGameWithRole(role: 'blank' | 'civilian', count = 4): SeededSession {
  for (let attempt = 0; attempt < 16; attempt += 1) {
    const seeded = seedActiveSession(DB_PATH, { module: blankModule, count, config: BLANK_CONFIG });
    const state = seeded.state as { players: Record<string, { role: string }> };
    const browserId = seeded.players[1]!.playerId;
    if (state.players[browserId]?.role === role) return seeded;
  }
  throw new Error(`无法在重试次数内让 players[1] 获得角色 ${role}`);
}

/**
 * 3 名 Node 平民驱动：word_reveal 确认一次 → 等 speaking，各平民轮到即 finish_speech →
 * 等 voting，平民投票给白板一次 → 等 final_guess。
 * 注意：不能每个 word_reveal 帧都重发确认（会无限增长观察队列）；改为按阶段推进。
 */
async function driveBlankToFinalGuess(
  host: RoomDriver,
  civilians: readonly RoomDriver[],
  browserId: string,
): Promise<void> {
  const waitPhase = (phases: readonly string[], timeoutMs = 60_000): Promise<string> =>
    host.waitGameState((v) => phases.includes(v.phase as string), timeoutMs)
      .then((frame) => (frame.payload.view as { phase: string }).phase);

  // 1) word_reveal：平民确认一次；浏览器由测试体点击确认
  for (const civ of civilians) await civ.gameAction({ type: 'confirm_word' });
  await waitPhase(['speaking']);

  // 2) speaking：各平民轮到即结束发言；白板轮到由浏览器点击
  while (true) {
    const frame = await host.waitGameState(
      (v) => ['speaking', 'voting', 'runoff_voting'].includes(v.phase as string),
      60_000,
    );
    const view = frame.payload.view as { phase: string; currentSpeakerId?: string | null };
    if (view.phase !== 'speaking') break;
    const civ = civilians.find((c) => c.playerId === view.currentSpeakerId);
    if (civ) await civ.gameAction({ type: 'finish_speech' });
    // 当前发言人是浏览器（白板）时等待浏览器自己结束发言
  }

  // 3) voting：平民投票给白板一次；白板投票由浏览器点击
  for (const civ of civilians) await civ.gameAction({ type: 'cast_vote', targetPlayerId: browserId });

  // 4) 等终局（白板被投出 → final_guess；或意外 game_over）
  await waitPhase(['final_guess', 'game_over']);
}

async function makeCivilians(seeded: SeededSession): Promise<{ host: RoomDriver; civilians: RoomDriver[] }> {
  const host = await RoomDriver.resume(WS_URL, seeded.roomCode, seeded.hostId, seeded.hostResumeToken);
  const civs = seeded.players.slice(2).map((p) => RoomDriver.resume(
    WS_URL,
    seeded.roomCode,
    p.playerId,
    p.resumeToken,
  ));
  const civilians = [host, ...(await Promise.all(civs))];
  return { host, civilians };
}

test.describe('D4-B-UI undercover_blank_v1', () => {
  test('平台开局成功链：start_game 对 undercover_blank_v1 返回 ack + word_reveal', async () => {
    const seeded = seedRoom(DB_PATH, {
      gameId: 'undercover',
      count: 4,
      ready: true,
      config: { rulesetId: 'undercover_blank_v1' },
    });
    const host = await RoomDriver.resume(WS_URL, seeded.roomCode, seeded.hostId, seeded.hostResumeToken);
    try {
      expect((await host.ready()).type).toBe('ack');
      const startAck = await host.startGame({ rulesetId: 'undercover_blank_v1' });
      expect(startAck.type, `start_game 应 ack：${startAck.payload.code ?? ''} ${startAck.payload.message ?? ''}`).toBe('ack');
      const frame = await host.waitGameState((v) => v.rulesetId === 'undercover_blank_v1' && v.phase === 'word_reveal');
      expect(frame.payload.engineContractVersion).toBe(2);
      expect(frame.payload.role).toBe('player');
    } finally {
      host.client.close();
    }
  });

  test('有词视角不泄漏：平民词条默认隐藏，长按才可见，他人都市词不入 DOM', async ({ browser }) => {
    const seeded = seedBlankGameWithRole('civilian');
    const civilianWord = (seeded.state as { civilianWord: string }).civilianWord;

    const page = await prepareBrowser(browser, {
      playerId: seeded.players[1]!.playerId,
      resumeToken: seeded.players[1]!.resumeToken,
      roomCode: seeded.roomCode,
      nickname: '平民甲',
    });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(BASE_URL);

    // 词条默认隐藏：占位文案可见，真实词不可见
    await expect(page.getByText('谁是卧底 · 白板').first()).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('.blank-word-card__box')).toBeVisible();
    await expect(page.getByText('长按查看秘密词').first()).toBeVisible();
    await expect(page.locator('.blank-word-card__word')).toHaveCount(0);
    // 他人都市词绝不进入 DOM（白板无词；这里以平民词明文做泄露探测）
    await expect(page.getByText(civilianWord)).toHaveCount(0);
    // 我是平民，不是白板
    await expect(page.locator('.blank-word-card__blank')).toHaveCount(0);

    // 长按（pointerdown）后词条出现；松手后遮挡
    await page.locator('.blank-word-card__box').dispatchEvent('pointerdown');
    await expect(page.locator('.blank-word-card__word')).toHaveText(civilianWord);
    await page.locator('.blank-word-card__box').dispatchEvent('pointerup');
    await expect(page.locator('.blank-word-card__word')).toHaveCount(0);

    await page.context().close();
  });

  test('无词视角 + 全流程：白板看词不泄漏 → 发言/投票渲染 → 终局猜词 30 秒 → skip 真实 action', async ({ browser }) => {
    const target = seedBlankGameWithRole('blank');
    const browserId = target.players[1]!.playerId;
    const civilianWord = (target.state as { civilianWord: string }).civilianWord;

    const page = await prepareBrowser(browser, {
      playerId: browserId,
      resumeToken: target.players[1]!.resumeToken,
      roomCode: target.roomCode,
      nickname: '白板',
    });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(BASE_URL);

    const { host, civilians } = await makeCivilians(target);
    try {
      const drive = driveBlankToFinalGuess(host, civilians, browserId);

      // 无词视角：白板显式无词，平民词绝不进入 DOM
      await expect(page.locator('.blank-word-card__blank')).toBeVisible({ timeout: 20_000 });
      await expect(page.getByText('你是白板').first()).toBeVisible();
      await expect(page.getByText(civilianWord)).toHaveCount(0);

      // 确认就绪（真实 confirm_word）
      await page.getByRole('button', { name: '我已记下，确认就绪' }).click();

      // 发言阶段：等浏览器（白板）发言轮次并结束发言（真实 finish_speech）
      await page.getByRole('button', { name: '结束发言' }).waitFor({ timeout: 90_000 });
      await expect(page.locator('.blank-speaking')).toBeVisible();
      await page.getByRole('button', { name: '结束发言' }).click();

      // 投票阶段渲染
      await page.locator('.blank-voting').waitFor({ timeout: 60_000 });
      await expect(page.locator('.blank-voting__options button').first()).toBeVisible();
      await expect(page.getByText('已投').first()).toBeVisible();

      // 忙碌/错误保留输入：白板主动猜词输入超长 → 服务端拒绝 → 错误就近显示且输入保留
      const longGuess = '词'.repeat(200);
      await page.getByRole('textbox', { name: '主动猜词输入' }).fill(longGuess);
      await page.getByRole('button', { name: '提交猜词' }).click();
      await expect(page.getByRole('alert')).toBeVisible({ timeout: 15_000 });
      await expect(page.getByRole('textbox', { name: '主动猜词输入' })).toHaveValue(longGuess);

      // 白板投票（真实 cast_vote）
      await page.locator('.blank-voting__options button').first().click();

      // 终局猜词：30 秒倒计时 + 白板被淘汰进入
      await page.locator('.blank-final-guess').waitFor({ timeout: 60_000 });
      const timerText = (await page.locator('.blank-final-guess__timer').textContent())?.trim() ?? '';
      expect(timerText, `倒计时文案应为「剩余 N 秒」，收到：${timerText}`).toMatch(/^剩余 \d+ 秒$/);

      // skip 是真实 game_action：跳过终局猜词 → 平民方获胜（host 权威 game_state）
      await page.getByRole('button', { name: '跳过' }).click();
      const over = await host.waitGameState(
        (v) => v.phase === 'game_over',
        20_000,
      );
      expect((over.payload.view as { winner?: string }).winner).toBe('civilian');
      // 浏览器进入结算页（对局已结算）
      await expect(page.getByText('对局已结算').first()).toBeVisible({ timeout: 20_000 });

      await drive;
      await page.context().close();
    } finally {
      for (const civ of civilians) civ.client.close();
      host.client.close();
    }
  });

  test('终局猜词 submit 真实 action：白板提交正确平民词 → 白板方获胜', async ({ browser }) => {
    const target = seedBlankGameWithRole('blank');
    const browserId = target.players[1]!.playerId;
    const civilianWord = (target.state as { civilianWord: string }).civilianWord;

    const page = await prepareBrowser(browser, {
      playerId: browserId,
      resumeToken: target.players[1]!.resumeToken,
      roomCode: target.roomCode,
      nickname: '白板',
    });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(BASE_URL);

    const { host, civilians } = await makeCivilians(target);
    try {
      const drive = driveBlankToFinalGuess(host, civilians, browserId);

      await expect(page.locator('.blank-word-card__blank')).toBeVisible({ timeout: 20_000 });
      await page.getByRole('button', { name: '我已记下，确认就绪' }).click();
      await page.getByRole('button', { name: '结束发言' }).waitFor({ timeout: 90_000 });
      await page.getByRole('button', { name: '结束发言' }).click();
      await page.locator('.blank-voting').waitFor({ timeout: 60_000 });
      await page.locator('.blank-voting__options button').first().click();

      // 终局猜词：提交与平民词完全一致 → 本地精确匹配 → 白板获胜（host 权威 game_state）
      await page.locator('.blank-final-guess').waitFor({ timeout: 60_000 });
      await page.getByRole('textbox', { name: '最终猜词输入' }).fill(civilianWord);
      await expect(page.getByRole('textbox', { name: '最终猜词输入' })).toHaveValue(civilianWord);
      await page.getByRole('button', { name: '提交猜词' }).click();
      // 本地精确匹配零 provider 调用，结果应尽快回灌为 game_over（winner=blank）
      const over = await host.waitGameState(
        (v) => v.phase === 'game_over',
        45_000,
      );
      expect((over.payload.view as { winner?: string }).winner).toBe('blank');
      // 浏览器进入结算页（对局已结算）
      await expect(page.getByText('对局已结算').first()).toBeVisible({ timeout: 20_000 });

      await drive;
      await page.context().close();
    } finally {
      for (const civ of civilians) civ.client.close();
      host.client.close();
    }
  });
});
