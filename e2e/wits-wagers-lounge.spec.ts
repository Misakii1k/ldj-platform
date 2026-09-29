/**
 * 一智千金「深夜赌场贵宾厅」X08 验收：after 截图组 + 跳动检测。
 *
 * 截图组落到 docs/superpowers/reports/2026-09-26-wits-wagers-visual/after/，
 * 与 before/ 同名同视口（5 画面 × 1280x800 / 390x844 = 10 张），
 * fixture 照 01-CONTRACT.md §6（6 人、第 3/7 轮、埃菲尔铁塔、答案 330、324 胜）。
 *
 * 跳动检测把 scripts/check-stage-jitter.mjs 的逐帧采样搬进本 spec
 * （03-ACCEPTANCE.md §1.2 允许的做法），在阶段切换后立刻采样：
 *   MOVE  静止容器位移 >1.5px；JUMP  牌/筹码相邻帧位移 >20px；FLASH  一帧内骤隐。
 *   ④ 允许的只剩计数结束与皇冠的 scale 弹跳（绕中心、中心点不动，探测器本就不计）。
 */
import { test, expect, type Page } from '@playwright/test';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { BASE_URL, DB_PATH, WS_URL, seedBrowserSession } from './helpers/serverEnv.ts';
import { seedRoom } from './helpers/dbClient.ts';
import { RoomDriver } from './helpers/wsClient.ts';

const AFTER_DIR = path.resolve(
  process.cwd(),
  'docs/superpowers/reports/2026-09-26-wits-wagers-visual/after',
);

test.beforeAll(() => {
  if (!fs.existsSync(AFTER_DIR)) {
    fs.mkdirSync(AFTER_DIR, { recursive: true });
  }
});

// ---------- 契约 §6 的 6 人 fixture（昵称与数据照方向稿 _shared.js） ----------

const PLAYERS = [
  { playerId: 'p1', name: '阿杰', guess: 300, before: 12, after: 12 },
  { playerId: 'p2', name: '小鱼干', guess: 324, before: 9, after: 25 }, // 我
  { playerId: 'p3', name: '可可', guess: 250, before: 15, after: 10 },
  { playerId: 'p4', name: '老王', guess: 280, before: 6, after: 30 },
  { playerId: 'p5', name: '糯米', guess: 324, before: 8, after: 21 },
  { playerId: 'p6', name: '一只很长昵称的鲸', guess: 412, before: 11, after: 11 },
];

const BOARD = [
  { id: 'lower', value: null, slot: 'LOWER', odds: 6, authors: [] },
  { id: 'g:250', value: 250, slot: 'L2', odds: 4, authors: ['p3'] },
  { id: 'g:280', value: 280, slot: 'L1', odds: 3, authors: ['p4'] },
  { id: 'g:300', value: 300, slot: 'C', odds: 2, authors: ['p1'] },
  { id: 'g:324', value: 324, slot: 'R1', odds: 3, authors: ['p2', 'p5'] },
  { id: 'g:412', value: 412, slot: 'R2', odds: 4, authors: ['p6'] },
];

/** 各人下注（照方向稿）：[[A 目标, 加注], [B 目标, 加注]] */
const BETS: Record<string, [[string, number], [string, number]]> = {
  p1: [['g:300', 3], ['g:324', 0]],
  p2: [['g:324', 4], ['g:412', 2]],
  p3: [['g:250', 5], ['lower', 0]],
  p4: [['g:324', 6], ['g:324', 0]],
  p5: [['g:412', 2], ['g:324', 3]],
  p6: [['g:300', 0], ['g:280', 0]],
};

const LEDGER = [
  { playerId: 'p1', scoreBefore: 12, reserved: 3, winProfit: 3, loss: 3, authorBonus: 0, scoreAfter: 12 },
  { playerId: 'p2', scoreBefore: 9, reserved: 6, winProfit: 15, loss: 2, authorBonus: 3, scoreAfter: 25 },
  { playerId: 'p3', scoreBefore: 15, reserved: 5, winProfit: 0, loss: 5, authorBonus: 0, scoreAfter: 10 },
  { playerId: 'p4', scoreBefore: 6, reserved: 6, winProfit: 24, loss: 0, authorBonus: 0, scoreAfter: 30 },
  { playerId: 'p5', scoreBefore: 8, reserved: 5, winProfit: 12, loss: 2, authorBonus: 3, scoreAfter: 21 },
  { playerId: 'p6', scoreBefore: 11, reserved: 0, winProfit: 0, loss: 0, authorBonus: 0, scoreAfter: 11 },
];

const QUESTION_PROMPT = '埃菲尔铁塔（含顶部天线）有多高？';

function betPair(pid: string) {
  const [a, b] = BETS[pid]!;
  return [
    { chipId: 'A', targetId: a[0], extraStake: a[1] },
    { chipId: 'B', targetId: b[0], extraStake: b[1] },
  ];
}

function viewPayload(phase: string, phaseEpoch: number) {
  const settled = phase === 'settlement';
  const boardVisible = phase !== 'answering';
  const players = PLAYERS.map((p, i) => ({
    playerId: p.playerId,
    score: settled ? p.after : p.before,
    winningGuesses: 0,
    // answering：4/6 已交（你没交，鲸也没交）
    hasSubmitted: phase === 'answering' ? i !== 1 && i !== 5 : true,
    forfeited: false,
  }));
  const publicBets = phase === 'betting' || settled
    ? Object.fromEntries(PLAYERS.map((p) => [p.playerId, betPair(p.playerId)]))
    : {};

  return {
    sessionId: 'session-ww-x08',
    status: 'ACTIVE',
    moduleId: 'wits-wagers',
    rulesetId: 'wits_wagers_platform_v1',
    engineContractVersion: 2,
    viewVersion: 1,
    role: 'player',
    view: {
      gameId: 'wits-wagers',
      rulesetId: 'wits_wagers_platform_v1',
      viewVersion: 1,
      phase,
      round: 3,
      totalRounds: 7,
      phaseEpoch,
      roundToken: 'ww-x08-r3',
      deadlineAt: phase === 'answering' || phase === 'betting' ? Date.now() + 60_000 : null,
      question: { prompt: QUESTION_PROMPT, unit: '米' },
      players,
      board: boardVisible ? BOARD : [],
      publicBets,
      revealed: settled
        ? {
            round: 3,
            question: {
              id: 'q-eiffel',
              prompt: QUESTION_PROMPT,
              unit: '米',
              answer: 330,
              sourceUrl: 'https://example.com/eiffel-tower',
              sourceNote: '埃菲尔铁塔官网 · 2022 年加装新天线后',
              asOf: '2022',
              explanation: '埃菲尔铁塔含顶部天线高 330 米。',
              reviewed: true,
            },
            board: BOARD,
            bets: Object.fromEntries(PLAYERS.map((p) => [p.playerId, betPair(p.playerId)])),
            winningTargetIds: ['g:324'],
            awardedAuthors: ['p2', 'p5'],
            ledger: LEDGER,
          }
        : null,
      history: [],
      result: null,
      me: {
        playerId: 'p2',
        submittedGuess: phase === 'answering' ? null : { value: 324, origin: 'submitted' },
        guessRevision: phase === 'answering' ? 0 : 1,
        acceptedBets:
          phase === 'betting' || settled ? betPair('p2') : [
            { chipId: 'A', targetId: null, extraStake: 0 },
            { chipId: 'B', targetId: null, extraStake: 0 },
          ],
        betRevision: phase === 'betting' || settled ? 1 : 0,
        reserved: phase === 'betting' ? 6 : 0,
        available: phase === 'betting' ? 3 : settled ? 25 : 9,
        canGuess: phase === 'answering',
        canBet: phase === 'betting',
      },
    },
  };
}

/** 注入一台假 WS：resume 后推 answering，之后按 test 推进各阶段 */
async function mockWsWithLoungeGame(page: Page) {
  let send: ((payload: unknown) => void) | null = null;
  await page.routeWebSocket(/.*\/ws.*/, (ws) => {
    // 建立连接时立即发送 welcome envelope（客户端等到 welcome 才会 resume）
    ws.send(
      JSON.stringify({
        v: 1,
        type: 'welcome',
        serverNow: Date.now(),
        payload: { protocolVersion: 1, connectionId: 'c_mock_x08', serverVersion: '0.4.0', llmAvailable: false },
      }),
    );
    ws.onMessage((msg) => {
      const text = typeof msg === 'string' ? msg : msg.toString();
      try {
        const parsed = JSON.parse(text);
        if (parsed.type === 'resume_room') {
          ws.send(JSON.stringify({
            v: 1, type: 'ack', requestId: parsed.requestId, roomSeq: 1, serverNow: Date.now(),
            payload: { ok: true },
          }));
          ws.send(JSON.stringify({
            v: 1, type: 'room_snapshot', roomSeq: 2, serverNow: Date.now(),
            payload: {
              roomCode: 'WITSA2',
              status: 'IN_GAME',
              seq: 1,
              gameId: 'wits-wagers',
              config: { gameConfig: {} },
              members: PLAYERS.map((p, i) => ({
                playerId: p.playerId,
                nickname: p.name,
                seat: i + 1,
                connectionStatus: 'CONNECTED',
                ready: true,
              })),
            },
          }));
          send = (payload) => ws.send(JSON.stringify({
            v: 1, type: 'game_state', roomSeq: 3, serverNow: Date.now(), payload,
          }));
          send(viewPayload('answering', 1));
        }
      } catch {
        // ignore
      }
    });
  });
  return {
    push(payload: unknown) {
      send?.(payload);
    },
  };
}

// ---------- 跳动检测（采样逻辑移植自 scripts/check-stage-jitter.mjs） ----------
// 注：本页面在 resume 后会销毁一次执行上下文（长 evaluate 会被 GC），
// 所以采样改成 Node 侧驱动的短快照循环（每次 evaluate 立即返回）。

const STILL_SEL = '.ww-question,.ww-board,.ww-seat-card,.ww-tray,.ww-plaque,.ww-guess-panel';
const MOVING_SEL = '.ww-poker-card,.ww-chip';

interface JitterEl { k: string; cls?: string; chain?: string; still: boolean; l: number; t: number; x: number; y: number; o: number }
interface JitterFrame { t: number; els: JitterEl[]; ghosts: Array<[number, number]> }

async function sampleFrames(page: Page, ms: number): Promise<JitterFrame[]> {
  const frames: JitterFrame[] = [];
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try {
      const snap = await page.evaluate(
        ([stillSel, movingSel]) => {
          const w = window as unknown as { __wwJitterIds?: WeakMap<Element, number>; __wwJitterN?: number };
          if (!w.__wwJitterIds) {
            w.__wwJitterIds = new WeakMap();
            w.__wwJitterN = 0;
          }
          const ids = w.__wwJitterIds;
          const id = (e: Element) => {
            if (!ids.has(e)) ids.set(e, ++w.__wwJitterN!);
            return ids.get(e);
          };
          const grab = (sel: string, still: boolean) =>
            [...document.querySelectorAll(sel)]
              .filter((e) => !e.closest('.ghost,.ww-flight-layer'))
              .map((e) => {
                const r = e.getBoundingClientRect();
                let o = getComputedStyle(e).visibility === 'hidden' ? 0 : 1;
                for (let x: Element | null = e; x && x !== document.body; x = x.parentElement) {
                  o *= +getComputedStyle(x).opacity;
                }
                return {
                  k: `${e.className.toString().split(' ')[0]}#${id(e)}`,
                  cls: e.className.toString(),
                  // 透明链路：FLASH 时用来定位是哪一级祖先的 opacity 掉了
                  chain: (() => {
                    const parts: string[] = [];
                    for (let x: Element | null = e; x && x !== document.body; x = x.parentElement) {
                      const o = getComputedStyle(x).opacity;
                      if (o !== '1') parts.push(`${x.className.toString().split(' ')[0]}=${o}`);
                    }
                    return parts.join('<');
                  })(),
                  still,
                  l: Math.round(r.left * 10) / 10,
                  t: Math.round(r.top * 10) / 10,
                  x: Math.round((r.left + r.width / 2) * 10) / 10,
                  y: Math.round((r.top + r.height / 2) * 10) / 10,
                  o,
                };
              });
          const ghosts = [...document.querySelectorAll('.ghost > *, .ww-flight-layer > *')].map((g) => {
            const r = g.getBoundingClientRect();
            return [r.left + r.width / 2, r.top + r.height / 2];
          });
          return { els: [...grab(stillSel, true), ...grab(movingSel, false)], ghosts };
        },
        [STILL_SEL, MOVING_SEL],
      );
      frames.push({ t: Date.now() - t0, els: snap.els as JitterEl[], ghosts: snap.ghosts as Array<[number, number]> });
    } catch {
      // 上下文短暂销毁（路由切换等）：跳过这一拍，下一拍重建采样
    }
    await page.waitForTimeout(33);
  }
  return frames;
}

function detectJitter(frames: JitterFrame[]): string[] {
  const issues: string[] = [];
  for (let i = 1; i < frames.length; i++) {
    const dt = Math.max(1, frames[i]!.t - frames[i - 1]!.t);
    const prev = new Map(frames[i - 1]!.els.map((e) => [e.k, e]));
    for (const e of frames[i]!.els) {
      const a = prev.get(e.k);
      if (!a) continue;
      const d = Math.min(Math.hypot(e.x - a.x, e.y - a.y), Math.hypot(e.l - a.l, e.t - a.t));
      const visible = a.o > 0.15 && e.o > 0.15;
      // MOVE（静止容器）是绝对阈值；JUMP 的 20px 是 16ms 帧基准，按实际采样间隔等比放大
      const jumpThreshold = 20 * (dt / 16);
      if (visible && e.still && d > 1.5) issues.push(`MOVE  ${e.k} ${d.toFixed(0)}px @${frames[i]!.t}ms`);
      else if (visible && d > jumpThreshold) issues.push(`JUMP  ${e.k} ${d.toFixed(0)}px @${frames[i]!.t}ms`);
      const handedOff = frames[i]!.ghosts.some(([gx, gy]) => Math.hypot(gx - a.x, gy - a.y) < 12);
      if (a.o > 0.8 && e.o < 0.2 && !handedOff) {
        issues.push(`FLASH ${e.k} @${frames[i]!.t}ms cls=${e.cls ?? ''} chain=${e.chain ?? ''} prevChain=${a.chain ?? ''}`);
      }
    }
  }
  return issues;
}

// ---------- 截图组 ----------

test.describe('一智千金贵宾厅 X08 after 截图组', () => {
  for (const vp of [
    { name: '1280x800', width: 1280, height: 800 },
    { name: '390x844', width: 390, height: 844 },
  ] as const) {
    test(`联机版四画面 ${vp.name}`, async ({ page }) => {
      test.setTimeout(120_000);
      await seedBrowserSession(page, {
        roomId: 'room-ww-x08',
        roomCode: 'WITSA2',
        playerId: 'p2',
        resumeToken: 'test-resume-token',
        nickname: '小鱼干',
      });
      const mock = await mockWsWithLoungeGame(page);
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(BASE_URL);

      const shot = (scene: string) =>
        page.screenshot({
          path: path.join(AFTER_DIR, `wits-wagers-${scene}-${vp.name}.png`),
          mask: [page.locator('.ww-countdown')],
        });

      // ① 作答：4/6 已交，你已输入 324 未交
      await expect(page.locator('.ww-game')).toBeVisible({ timeout: 15_000 });
      await expect(page.locator('.ww-question__prompt')).toContainText('埃菲尔铁塔');
      await page.locator('#ww-guess-input').fill('324');
      await page.waitForTimeout(1200); // 等背面牌落桌静止
      await shot('answering');

      // ② 排牌：6 张牌全部上桌
      mock.push(viewPayload('arranging', 2));
      await expect(page.locator('.ww-target-card')).toHaveCount(6, { timeout: 10_000 });
      await page.waitForTimeout(2500); // 翻牌 + 赔率牌弹出静止
      await shot('arranging');

      // ③ 下注：他人筹码已押，你的 A 押 324 +4、B 押 412 +2
      mock.push(viewPayload('betting', 3));
      await expect(page.locator('.ww-tray')).toBeVisible({ timeout: 10_000 });
      await page.waitForTimeout(1500); // 筹码飞行静止
      await shot('betting');

      // ④ 揭晓结算：计分全部结束、第一名已戴冠
      mock.push(viewPayload('settlement', 4));
      await expect(page.locator('.ww-plaque')).toBeVisible({ timeout: 10_000 });
      await expect(page.locator('.ww-plaque__value')).toContainText('330', { timeout: 10_000 });
      await expect(page.locator('.ww-seat-card--top')).toBeVisible({ timeout: 15_000 });
      await page.waitForTimeout(800);
      await shot('settlement');
    });
  }

  test('桌面模拟版两视口（真实 sim 对局，已亮牌）', async ({ browser }) => {
    test.setTimeout(180_000);
    const seeded = seedRoom(DB_PATH, {
      gameId: 'wits-wagers',
      count: 3,
      ready: true,
      spectatorCount: 1,
      config: { rulesetId: 'wits_wagers_sim_v1' },
      nicknames: ['阿杰', '小鱼干', '可可'],
    });
    const driver = await RoomDriver.resume(WS_URL, seeded.roomCode, seeded.hostId, seeded.hostResumeToken);
    try {
      const startAck = await driver.startGame({ rulesetId: 'wits_wagers_sim_v1' });
      expect(startAck.type).toBe('ack');
      await driver.waitGameState(() => true);

      // 三个玩家各交一个估数，然后亮牌
      const guesses: Array<[number, number]> = [[0, 300], [1, 324], [2, 250]];
      for (const [idx, value] of guesses) {
        await driver.gameAction({ type: 'sim:submit_guess', playerId: seeded.players[idx]!.playerId, value });
      }
      await driver.gameAction({ type: 'sim:reveal_guesses' });
      await driver.waitGameState((v) => (v as { revealed?: boolean }).revealed === true);

      for (const vp of [
        { name: '1280x800', width: 1280, height: 800 },
        { name: '390x844', width: 390, height: 844 },
      ] as const) {
        const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
        const page = await context.newPage();
        await seedBrowserSession(page, {
          roomId: seeded.roomId,
          roomCode: seeded.roomCode,
          playerId: seeded.players[1]!.playerId,
          resumeToken: seeded.players[1]!.resumeToken,
          nickname: '小鱼干',
        });
        await page.goto(BASE_URL);
        await expect(page.locator('.ww-sim')).toBeVisible({ timeout: 20_000 });
        await expect(page.locator('.ww-target-card').first()).toBeVisible({ timeout: 10_000 });
        await page.waitForTimeout(1200);
        await page.screenshot({
          path: path.join(AFTER_DIR, `wits-wagers-sim-${vp.name}.png`),
          mask: [page.locator('.ww-countdown')],
        });
        await context.close();
      }
    } finally {
      driver.client.close();
    }
  });
});

// ---------- 跳动检测（阶段切换后立刻采样；两视口） ----------

test.describe('一智千金贵宾厅跳动检测', () => {
  for (const vp of [
    { name: '1280x800', width: 1280, height: 800 },
    { name: '390x844', width: 390, height: 844 },
  ] as const) {
    test(`①②③④ 无 MOVE / JUMP / FLASH（${vp.name}）`, async ({ page }) => {
      test.setTimeout(120_000);
      await seedBrowserSession(page, {
        roomId: 'room-ww-jitter',
        roomCode: 'WITSJT',
        playerId: 'p2',
        resumeToken: 'test-resume-token',
        nickname: '小鱼干',
      });
      const mock = await mockWsWithLoungeGame(page);
      await page.setViewportSize({ width: vp.width, height: vp.height });
      const navigations: string[] = [];
      page.on('framenavigated', (frame) => {
        if (frame === page.mainFrame()) navigations.push(frame.url());
      });
      page.on('crash', () => navigations.push('PAGE_CRASH'));
      page.on('pageerror', (e) => navigations.push(`pageerror: ${String(e).slice(0, 200)}`));
      await page.goto(BASE_URL);
      await expect(page.locator('.ww-game')).toBeVisible({ timeout: 15_000 });
      // 客户端 resume 之后可能做一次路由跳转，等它落定再开始采样
      await page.waitForLoadState('load');
      await page.waitForTimeout(600);

      const issues: string[] = [];
      const sample = async (label: string, ms: number) => {
        // 路由跳转销毁执行上下文时 evaluate 会被 GC：落定后重采一次
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            const frames = await sampleFrames(page, ms);
            for (const issue of detectJitter(frames as JitterFrame[])) {
              issues.push(`[${label}] ${issue}`);
            }
            return;
          } catch (err) {
            if (attempt === 1) {
              throw new Error(
                `采样失败（${label}）：${String(err).slice(0, 120)}；页面事件：${navigations.join(' | ') || '无'}`,
              );
            }
            await page.waitForTimeout(400);
          }
        }
      };

      // ① 作答：初始落桌 + 两人补交（扇形扩张 + FLIP 让位）
      await sample('answering-mount', 1500);
      const v1b = viewPayload('answering', 1);
      v1b.view.players[4]!.hasSubmitted = true;
      v1b.view.players[5]!.hasSubmitted = true;
      mock.push(v1b);
      await sample('answering-late-join', 1500);

      // ② 排牌：逐张翻入 + 赔率牌弹出
      mock.push(viewPayload('arranging', 2));
      await sample('arranging-deal', 3200);

      // ③ 下注：筹码上桌 + 托盘出现
      mock.push(viewPayload('betting', 3));
      await sample('betting', 1800);

      // ④ 揭晓结算：牌匾计数 + 胜出升起扫光 + 筹码回收 + 逐个计分 + 皇冠
      mock.push(viewPayload('settlement', 4));
      await sample('settlement', 8000);

      expect(navigations.length, `采样期间发生页面跳转：${navigations.join(' | ')}`).toBeLessThanOrEqual(2);
      expect(issues, issues.slice(0, 20).join('\n')).toEqual([]);
    });
  }
});
