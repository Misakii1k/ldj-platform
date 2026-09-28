/**
 * 伪人测试 · 法庭视觉验收截图与几何检查（计划 §1.6 / §T1 判据）。
 *
 * 用法：仓库根目录执行  npx tsx docs/plans/2026-09-26-echo-judge-visual/capture-court-shots.ts
 * 行为：自起一台独立服务端（端口 3193，独立 DATA_DIR，跑完即杀），
 * 6 人固定 fixture（阿杰 / 老王 / 可可 / 小鱼干 / Momo / 糯米）打到第 2 轮后逐画面截图，
 * 另起 9 人房补拍一张 answering 1280×800。
 * 产物：docs/superpowers/reports/2026-08-15-game-ui-refresh/echo-judge-court/*.png
 *       + 同目录 geometry-report.json（无横向溢出 / 关键区域不重叠的机器门结果）
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium, type Page } from '@playwright/test';
import { seedRoom, type SeededRoom } from '../../../e2e/helpers/dbClient.ts';
import { RoomDriver } from '../../../e2e/helpers/wsClient.ts';

const PLAN_DIR = fileURLToPath(new URL('.', import.meta.url));
const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const PORT = 3193;
const BASE = `http://127.0.0.1:${PORT}`;
const WS = `ws://127.0.0.1:${PORT}/ws`;
const DATA_DIR = `${PLAN_DIR}/.tmp-court-data`;
const DB_PATH = `${DATA_DIR}/platform.db`;
const OUT_DIR = `${REPO_ROOT}docs/superpowers/reports/2026-08-15-game-ui-refresh/echo-judge-court`;

const NAMES = ['阿杰', '老王', '可可', '小鱼干', 'Momo', '糯米'];
const CONFIG = { rulesetId: 'echo_judge_v1', answerSeconds: 75, judgmentSeconds: 120 };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitServer(): Promise<void> {
  for (let i = 0; i < 120; i += 1) {
    try {
      const res = await fetch(`${BASE}/health/live`);
      if (res.ok) return;
    } catch { /* 未就绪 */ }
    await sleep(500);
  }
  throw new Error('服务端 60s 未就绪');
}

function startServer(): ChildProcess {
  rmSync(DATA_DIR, { recursive: true, force: true });
  const child = spawn(process.execPath, ['packages/server/src/index.ts'], {
    cwd: REPO_ROOT,
    env: { ...process.env, PORT: String(PORT), DATA_DIR, LOG_LEVEL: 'warn', E2E_JOIN_LIMIT_MAX: '1000' },
    stdio: 'ignore',
  });
  return child;
}

interface Cast {
  room: SeededRoom;
  drivers: Map<string, RoomDriver>; // nickname → driver
  judgeOf: (round: number) => string; // nickname
}

async function openPage(browserPage: Page, room: SeededRoom, seat: number): Promise<void> {
  const player = room.players[seat]!;
  const nickname = NAMES[seat] ?? `玩家${seat + 1}`;
  await browserPage.addInitScript(
    ([meValue]) => {
      localStorage.setItem('ldj:session', meValue);
      sessionStorage.setItem('ldj_pc_host_entered', 'true');
    },
    [JSON.stringify({ seatRole: 'player', playerId: player.playerId, resumeToken: player.resumeToken, roomCode: room.roomCode, nickname })],
  );
  await browserPage.goto(`${BASE}/?room=${room.roomCode}`);
  await browserPage.waitForSelector('.ej-court', { timeout: 15000 });
}

/** 等动效静止后截图；settleMs 用于宣判停留期内的抢拍 */
async function shoot(page: Page, name: string, width: number, height: number, settleMs = 2000): Promise<void> {
  await page.setViewportSize({ width, height });
  await sleep(settleMs);
  await page.screenshot({ path: `${OUT_DIR}/echo-judge-${name}-${width}x${height}.png` });
}

/** 几何检查：无横向溢出、长椅与卷宗区不重叠、画面元素都在舞台内（字符串形式注入，避开 tsx 的 __name 改写） */
async function geometryCheck(page: Page, name: string): Promise<Record<string, unknown>> {
  const result = (await page.evaluate(`(() => {
    const rect = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, bottom: r.bottom };
    };
    const overlap = (a, b) =>
      !!a && !!b && a.x < b.right - 1 && b.x < a.right - 1 && a.y < b.bottom - 1 && b.y < a.bottom - 1;
    const court = rect('.ej-court');
    const bench = rect('.ej-bench');
    const witness = rect('.ej-witness');
    const left = rect('.ej-pew--left');
    const right = rect('.ej-pew--right');
    const doc = document.documentElement;
    return {
      horizontalOverflow: doc.scrollWidth > doc.clientWidth + 1,
      courtVisible: !!court && court.w > 100 && court.h > 100,
      witnessOverlapsLeft: overlap(witness, left),
      witnessOverlapsRight: overlap(witness, right),
      benchOverlapsWitness: overlap(bench, witness),
      seatsCount: document.querySelectorAll('.ej-seat').length,
    };
  })()`)) as Record<string, unknown>;
  return { shot: name, ...result };
}

/** 从某司机视角读最新视图（轮询最多 8s 等广播到达） */
async function viewOf(driver: RoomDriver): Promise<Record<string, unknown> | null> {
  for (let i = 0; i < 40; i += 1) {
    const frame = driver.client.latestGameState((v) => v.gameId === 'echo-judge');
    if (frame) return frame.payload.view as Record<string, unknown>;
    await sleep(200);
  }
  return null;
}

/** 等某位审判长视角里出现待选卷宗并返回第一张 */
async function firstPendingCard(judge: RoomDriver, tag: string): Promise<string> {
  for (let i = 0; i < 40; i += 1) {
    const view = (await viewOf(judge)) as { phase?: string; me?: { pendingTopicChoices?: { id: string }[] | null } } | null;
    const card = view?.me?.pendingTopicChoices?.[0];
    if (view?.phase === 'judge_setup' && card) return card.id;
    await sleep(200);
  }
  throw new Error(`${tag}：审判长没有待选卷宗`);
}

/** 发动作：ack 超时按 e2e 惯例吞掉（动作幂等），靠随后的状态轮询兜底 */
async function act(driver: RoomDriver, payload: unknown): Promise<void> {
  try {
    const ack = await driver.gameAction(payload);
    if (ack.type === 'error') console.log(`[capture] 动作被拒（忽略）：${JSON.stringify(ack.payload).slice(0, 120)}`);
  } catch {
    console.log('[capture] 动作 ack 超时（忽略，靠状态轮询兜底）');
  }
}

/** 轮询任意司机的公开视图直到谓词满足 */
async function waitView(drivers: Iterable<RoomDriver>, pred: (v: Record<string, unknown>) => boolean, tag: string): Promise<Record<string, unknown>> {
  const list = [...drivers];
  for (let i = 0; i < 60; i += 1) {
    for (const d of list) {
      const frame = d.client.latestGameState((v) => v.gameId === 'echo-judge');
      const view = (frame?.payload.view as Record<string, unknown> | undefined) ?? null;
      if (view && pred(view)) return view;
    }
    await sleep(250);
  }
  throw new Error(`等状态超时：${tag}`);
}

/** 快打一轮：审判长挑第一张卡 → 全员说完 → 空指认 */
async function speedRound(cast: Cast, round: number): Promise<void> {
  const judgeNick = cast.judgeOf(round);
  const judge = cast.drivers.get(judgeNick)!;
  console.log(`[capture] 快打第 ${round} 轮（审判长 ${judgeNick}）`);
  const cardId = await firstPendingCard(judge, `第 ${round} 轮`);
  await act(judge, { type: 'pick_topic_card', playerId: judge.playerId, cardId });
  await waitView(cast.drivers.values(), (v) => v.phase === 'answering', `第 ${round} 轮进入作答`);
  // 按服务端视图的真实发言顺序依次说完
  for (let step = 0; step < cast.drivers.size; step += 1) {
    const v = await waitView(cast.drivers.values(), (x) => x.phase !== 'answering' || typeof x.currentSpeakerId === 'string', `第 ${round} 轮发言人`);
    if (v.phase !== 'answering') break;
    const speaker = String(v.currentSpeakerId);
    const speakerDriver = [...cast.drivers.values()].find((d) => d.playerId === speaker);
    if (!speakerDriver) break;
    await act(speakerDriver, { type: 'finish_speaking', playerId: speaker });
    await sleep(150);
  }
  await waitView(cast.drivers.values(), (v) => v.phase === 'judgment', `第 ${round} 轮进入审判`);
  await act(judge, { type: 'accuse', playerId: judge.playerId, targetPlayerIds: [] });
  await waitView(cast.drivers.values(), (v) => v.phase !== 'judgment', `第 ${round} 轮宣判完毕`);
}

async function main(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });
  const server = startServer();
  const geometry: Record<string, unknown>[] = [];
  let judgePage: Page | null = null;
  let mePage: Page | null = null;
  try {
    await waitServer();
    console.log('[capture] 服务端就绪');

    /* ── 6 人 fixture ── */
    const room = seedRoom(DB_PATH, { gameId: 'echo-judge', count: 6, nicknames: NAMES, ready: true, config: CONFIG });
    const drivers = new Map<string, RoomDriver>();
    for (let i = 0; i < NAMES.length; i += 1) {
      const p = room.players[i]!;
      drivers.set(NAMES[i]!, await RoomDriver.resume(WS, room.roomCode, p.playerId, p.resumeToken));
    }
    console.log('[capture] 6 人房间已 seed 并恢复连接', room.roomCode);
    const host = drivers.get('阿杰')!;
    const startAck = await host.startGame(CONFIG);
    if (startAck.type === 'error') throw new Error(`start_game 失败：${JSON.stringify(startAck.payload)}`);
    console.log('[capture] 已开局');

    const cast: Cast = {
      room,
      drivers,
      judgeOf: (round) => NAMES[(round - 1) % NAMES.length]!,
    };

    // 快打第 1 轮（阿杰当审判长，此刻没有任何浏览器页面开着，Node 驱动全部可用）
    await speedRound(cast, 1);
    console.log('[capture] 第 1 轮完成，进入第 2 轮立案');

    // 打开两个浏览器页面（老王 = 审判长视角；小鱼干 = 旁听席视角）。
    // 注意：浏览器 resume 会顶掉同 playerId 的 Node 驱动，此后老王/小鱼干的动作一律走页面 UI。
    const browser = await chromium.launch();
    const ctxJudge = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const ctxMe = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    judgePage = await ctxJudge.newPage();
    mePage = await ctxMe.newPage();
    for (const [tag, pg] of [['judge', judgePage], ['me', mePage]] as const) {
      pg.on('pageerror', (err) => console.log(`[capture][pageerror:${tag}]`, String(err).slice(0, 300)));
      pg.on('console', (msg) => {
        if (msg.type() === 'error') console.log(`[capture][console:${tag}]`, msg.text().slice(0, 200));
      });
    }
    await openPage(judgePage, room, 1);
    await openPage(mePage, room, 3);
    await judgePage.waitForSelector('.ej-cases', { timeout: 15000 });

    // 第 2 轮身份固定为混合案：小鱼干 + Momo 当伪人，其余人类。
    // 小鱼干走真实 UI 点卡，Momo/其余人走 Node（choose_role 幂等，开庭前随时可改）。
    await act(drivers.get('Momo')!, { type: 'choose_role', playerId: drivers.get('Momo')!.playerId, role: 'impostor' });
    for (const nick of ['阿杰', '可可', '糯米']) {
      await act(drivers.get(nick)!, { type: 'choose_role', playerId: drivers.get(nick)!.playerId, role: 'human' });
    }
    await mePage.click('.ej-role--impostor');
    await sleep(600);

    // ① 立案
    await shoot(judgePage, 'setup-judge', 1280, 800);
    geometry.push(await geometryCheck(judgePage, 'setup-judge-1280x800'));
    await shoot(judgePage, 'setup-judge', 390, 844);
    geometry.push(await geometryCheck(judgePage, 'setup-judge-390x844'));
    await shoot(mePage, 'setup-player', 1280, 800);
    geometry.push(await geometryCheck(mePage, 'setup-player-1280x800'));
    await shoot(mePage, 'setup-player', 390, 844);
    geometry.push(await geometryCheck(mePage, 'setup-player-390x844'));

    // 老王点第一份卷宗立案（真实 UI 路径）
    console.log('[capture] 老王立案');
    await judgePage.setViewportSize({ width: 1280, height: 800 });
    await judgePage.click('.ej-case');

    // 前两位说完 → 轮到小鱼干（你）：阿杰/可可 的 Node 驱动仍然可用
    for (let step = 0; step < 2; step += 1) {
      const v = await waitView(drivers.values(), (x) => x.phase === 'answering' && typeof x.currentSpeakerId === 'string', '第 2 轮当前发言人');
      const speaker = String(v.currentSpeakerId);
      const speakerDriver = [...drivers.values()].find((d) => d.playerId === speaker);
      if (!speakerDriver) throw new Error(`发言人 ${speaker} 没有可用驱动（不该发生：前两位应是阿杰/可可）`);
      await act(speakerDriver, { type: 'finish_speaking', playerId: speaker });
      await sleep(300);
    }
    await sleep(1800); // 等交棒飞行落定
    await mePage.reload();
    await mePage.waitForSelector('.ej-dossier', { timeout: 15000 });
    await sleep(600);

    // ② 轮流作答（轮到你）
    await shoot(mePage, 'answering', 1280, 800);
    geometry.push(await geometryCheck(mePage, 'answering-1280x800'));
    await shoot(mePage, 'answering', 390, 844);
    geometry.push(await geometryCheck(mePage, 'answering-390x844'));

    // 小鱼干点「我说完了」（真实 UI），其余 Momo/糯米走 Node
    await mePage.setViewportSize({ width: 1280, height: 800 });
    await sleep(400);
    await mePage.click('.ej-dock .tabletop-action--primary');
    await act(drivers.get('Momo')!, { type: 'finish_speaking', playerId: drivers.get('Momo')!.playerId });
    await act(drivers.get('糯米')!, { type: 'finish_speaking', playerId: drivers.get('糯米')!.playerId });
    await judgePage.reload();
    await judgePage.waitForSelector('.ej-tally', { timeout: 15000 });
    await sleep(600);

    // ③ 审判：审判长点小鱼干 + 可可（已点 2 人）
    const idOf = (nick: string) => drivers.get(nick)!.playerId;
    await judgePage.click(`[data-player-id="${idOf('小鱼干')}"]`);
    await judgePage.click(`[data-player-id="${idOf('可可')}"]`);
    await sleep(500);
    await shoot(judgePage, 'judgment-judge', 1280, 800);
    geometry.push(await geometryCheck(judgePage, 'judgment-judge-1280x800'));
    await shoot(judgePage, 'judgment-judge', 390, 844);
    geometry.push(await geometryCheck(judgePage, 'judgment-judge-390x844'));
    await mePage.reload();
    await mePage.waitForSelector('.ej-ponder', { timeout: 15000 });
    await shoot(mePage, 'judgment-player', 390, 844);
    geometry.push(await geometryCheck(mePage, 'judgment-player-390x844'));

    // 审判长点「宣判 · 指认 2 人」（走真实 UI 按钮）
    await judgePage.setViewportSize({ width: 1280, height: 800 });
    await sleep(400);
    await judgePage.click('.ej-dock .tabletop-action--primary');

    // ④ 宣判：等账单卡出现即静止帧（抓对 1 + 冤枉 1）。
    // 中途轮次演出结束停留 900ms 即收起，两个视口必须连拍。
    await judgePage.waitForSelector('.ej-verdict__ledger', { timeout: 10000 });
    await shoot(judgePage, 'verdict', 1280, 800, 250);
    await shoot(judgePage, 'verdict', 390, 844, 250);
    geometry.push(await geometryCheck(judgePage, 'verdict-390x844'));

    // 快打第 3–6 轮 → 终局。浏览器页面保持打开（终局截图要用同一连接），
    // 老王/小鱼干的动作走各自页面 UI，其余人走 Node 驱动。
    const pageOf = new Map<string, Page>([['老王', judgePage], ['小鱼干', mePage]]);
    for (let round = 3; round <= 6; round += 1) {
      await sleep(3800); // 等上轮宣判演出播完并收起（2.4s 演出 + 0.9s 停留）
      const judgeNick = cast.judgeOf(round);
      console.log(`[capture] 快打第 ${round} 轮（审判长 ${judgeNick}）`);
      const judgePageBound = pageOf.get(judgeNick);
      if (judgePageBound) {
        await judgePageBound.waitForSelector('.ej-case', { timeout: 15000 });
        await judgePageBound.click('.ej-case');
        console.log(`[capture] 第 ${round} 轮：${judgeNick} 已点卷宗`);
      } else {
        const judgeDriver = drivers.get(judgeNick)!;
        const cardId = await firstPendingCard(judgeDriver, `第 ${round} 轮`);
        await act(judgeDriver, { type: 'pick_topic_card', playerId: judgeDriver.playerId, cardId });
        console.log(`[capture] 第 ${round} 轮：${judgeNick} 已立案（WS）`);
      }
      await waitView(drivers.values(), (v) => v.phase === 'answering', `第 ${round} 轮进入作答`);
      for (let step = 0; step < NAMES.length; step += 1) {
        const v = await waitView(drivers.values(), (x) => x.phase !== 'answering' || typeof x.currentSpeakerId === 'string', `第 ${round} 轮发言人`);
        if (v.phase !== 'answering') break;
        const speaker = String(v.currentSpeakerId);
        const speakerNick = NAMES[room.players.findIndex((p) => p.playerId === speaker)]!;
        const speakerPage = pageOf.get(speakerNick);
        if (speakerPage) {
          await speakerPage.waitForSelector('.ej-dock .tabletop-action--primary', { timeout: 15000 });
          await speakerPage.click('.ej-dock .tabletop-action--primary');
        } else {
          await act(drivers.get(speakerNick)!, { type: 'finish_speaking', playerId: speaker });
        }
        console.log(`[capture] 第 ${round} 轮：${speakerNick} 说完`);
        await sleep(250);
      }
      await waitView(drivers.values(), (v) => v.phase === 'judgment', `第 ${round} 轮进入审判`);
      console.log(`[capture] 第 ${round} 轮：审判`);
      if (judgePageBound) {
        await judgePageBound.getByRole('button', { name: '没人是伪人' }).click({ timeout: 15000 });
      } else {
        await act(drivers.get(judgeNick)!, { type: 'accuse', playerId: drivers.get(judgeNick)!.playerId, targetPlayerIds: [] });
      }
      await waitView(drivers.values(), (v) => v.phase !== 'judgment', `第 ${round} 轮宣判完毕`);
      console.log(`[capture] 第 ${round} 轮：完毕`);
    }
    await waitView(drivers.values(), (v) => v.phase === 'game_over', '终局');
    console.log('[capture] 终局');

    // 终局截图：老王页面仍在同一连接上，演出播完后停留
    await judgePage.waitForSelector('.echo-reveal-panel', { timeout: 20000 });
    await sleep(3600); // 终局宣判演出播完（不停留自动收起）+ 结算面板就位
    await shoot(judgePage, 'game-over', 1280, 800);
    geometry.push(await geometryCheck(judgePage, 'game-over-1280x800'));
    await shoot(judgePage, 'game-over', 390, 844);
    geometry.push(await geometryCheck(judgePage, 'game-over-390x844'));
    await browser.close();

    /* ── 9 人补拍（answering 1280×800） ── */
    const NINE = ['阿杰', '老王', '可可', '小鱼干', 'Momo', '糯米', '大橘', '阿May', '七七'];
    const room9 = seedRoom(DB_PATH, { gameId: 'echo-judge', count: 9, nicknames: NINE, ready: true, config: CONFIG });
    const d9: RoomDriver[] = [];
    for (let i = 0; i < 9; i += 1) {
      const p = room9.players[i]!;
      d9.push(await RoomDriver.resume(WS, room9.roomCode, p.playerId, p.resumeToken));
    }
    const ack9 = await d9[0]!.startGame(CONFIG);
    if (ack9.type === 'error') throw new Error('9 人房开局失败');
    const card9 = await firstPendingCard(d9[0]!, '9 人房');
    await act(d9[0]!, { type: 'pick_topic_card', playerId: d9[0]!.playerId, cardId: card9 });
    await act(d9[1]!, { type: 'finish_speaking', playerId: d9[1]!.playerId });
    const browser9 = await chromium.launch();
    const ctx9 = await browser9.newContext({ viewport: { width: 1280, height: 800 } });
    const page9 = await ctx9.newPage();
    await openPage(page9, room9, 2); // 可可视角（纯看图，不再驱动可可的动作）
    await sleep(1600);
    await shoot(page9, 'answering-9p', 1280, 800);
    geometry.push(await geometryCheck(page9, 'answering-9p-1280x800'));
    await browser9.close();

    for (const d of drivers.values()) d.client.close();
    for (const d of d9) d.client.close();
  } catch (err) {
    console.error('[capture] 失败，转储现场…', err instanceof Error ? err.message : err);
    process.exitCode = 1;
    if (judgePage) await judgePage.screenshot({ path: `${OUT_DIR}/_debug-judge.png` }).catch(() => {});
    if (mePage) await mePage.screenshot({ path: `${OUT_DIR}/_debug-me.png` }).catch(() => {});
    if (judgePage) {
      const txt = await judgePage.evaluate(`document.querySelector('.ej-dock')?.textContent ?? 'NO DOCK'`).catch(() => 'EVAL FAIL');
      console.log('[capture] judge dock 文本：', String(txt).slice(0, 120));
    }
    throw err;
  } finally {
    server.kill();
    // 浏览器/WS 句柄可能拖住进程，强制收尾
    setTimeout(() => process.exit(process.exitCode ?? 0), 1500).unref();
  }

  writeFileSync(`${OUT_DIR}/geometry-report.json`, JSON.stringify(geometry, null, 2));
  const bad = geometry.filter(
    (g) => g.horizontalOverflow || !g.courtVisible || g.witnessOverlapsLeft || g.witnessOverlapsRight || g.benchOverlapsWitness,
  );
  console.log(`截图与几何检查完成：${geometry.length} 条，异常 ${bad.length} 条`);
  if (bad.length > 0) {
    console.log(JSON.stringify(bad, null, 2));
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
