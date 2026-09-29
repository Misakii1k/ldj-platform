/**
 * 奶酪大盗·阁楼世界截图组 + 几何走查（plans/2026-09-29-cheese-thief-visual §1.6 / T1 判据）。
 *
 * 做法照 scripts/capture-settlement-dock-real.mjs：起真实服务端（静态资源）+ 拦截 WS，
 * 注入合成 game_state（routeMockServer），把四个定稿画面的关键局面精确摆出来截图。
 *
 * 用法：node scripts/capture-cheese-attic-shots.mjs [场景id]
 * 产物：docs/superpowers/reports/2026-08-15-game-ui-refresh/cheese-thief-attic/<id>-<宽x高>.png
 * 另把席位/告示牌/时刻条/中央区的重叠与出框检查打印到 stdout（hit/out 非空即几何不通过）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { chromium } from '@playwright/test';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const shotsDir = path.join(rootDir, 'docs', 'superpowers', 'reports', '2026-08-15-game-ui-refresh', 'cheese-thief-attic');
const PORT = 3198;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const DATA_DIR = path.join(rootDir, 'e2e', '.tmp-data-cheese-attic');

const ME_STORAGE_KEY = 'ldj:session';
const PC_HOST_ENTERED_KEY = 'ldj_pc_host_entered';

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** 定稿假数据（与方向稿同一局）：1 点可可/老王同醒，3 点你（小鱼干）独醒偷走奶酪 */
const NAMES = ['阿杰', '小鱼干', '可可', '老王', '糯米', 'Momo', '大橘', '一只很长昵称的鼠'];
const HOURS = [5, 3, 1, 1, 6, 4, 6, 4];

function membersFor(count) {
  return Array.from({ length: count }, (_, i) => ({
    playerId: `p${i + 1}`,
    nickname: NAMES[i] ?? `玩家${i + 1}`,
    seatRole: 'player',
    seat: i + 1,
    isHost: i === 0,
    connectionStatus: 'CONNECTED',
    botKind: null,
    ready: true,
  }));
}

/** 合成奶酪大盗视角（cheese_thief_classic_v1 / viewVersion 1） */
function cheeseView(count, meId, overrides = {}) {
  const players = Array.from({ length: count }, (_, i) => `p${i + 1}`);
  const wakeHours = Object.fromEntries(players.map((id, i) => [id, HOURS[i]]));
  const me = players.includes(meId)
    ? {
        playerId: meId,
        wakeHour: wakeHours[meId],
        hourChoices: null,
        coWakers: [],
        cheeseWasMissing: false,
        isThief: false,
        isAccomplice: false,
        knownAccomplices: [],
        roleCard: 'none',
        canPeek: false,
        peekedHour: null,
        catPeekedHour: null,
        hasVoted: false,
        ...(overrides.me ?? {}),
      }
    : null;
  const { me: _me, ...rest } = overrides;
  return {
    sessionId: 'session-cheese-attic-shots',
    status: 'PLAYING',
    moduleId: 'cheese-thief',
    rulesetId: 'cheese_thief_classic_v1',
    engineContractVersion: 2,
    viewVersion: 1,
    role: me ? 'player' : 'spectator',
    view: {
      gameId: 'cheese-thief',
      rulesetId: 'cheese_thief_classic_v1',
      schemaVersion: 1,
      phase: 'night',
      players,
      cheeseStolen: false,
      mode: 'standard',
      currentHour: 3,
      roleCardsEnabled: false,
      revealedCat: null,
      revealedDog: null,
      dogFirstVoter: null,
      thiefCaught: null,
      winners: [],
      deadlineAt: Date.now() + 20_000,
      votes: null,
      reveal: null,
      ...rest,
      me,
    },
  };
}

async function routeMockServer(page, { gamePayload, members, meId }) {
  await page.addInitScript(
    ([meKey, meValue, hostKey]) => {
      localStorage.setItem(meKey, meValue);
      sessionStorage.setItem(hostKey, 'true');
    },
    [
      ME_STORAGE_KEY,
      JSON.stringify({
        playerId: meId,
        resumeToken: 'attic-shots-token',
        roomCode: 'ATTC1',
        nickname: members.find((m) => m.playerId === meId)?.nickname ?? '我',
        seatRole: 'player',
      }),
      PC_HOST_ENTERED_KEY,
    ],
  );

  await page.routeWebSocket(/.*\/ws.*/, (ws) => {
    ws.send(JSON.stringify({
      v: 1,
      type: 'welcome',
      serverNow: Date.now(),
      payload: { protocolVersion: 1, connectionId: 'c_attic_shots', serverVersion: '0.4.0', llmAvailable: false },
    }));
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
            v: 1, type: 'room_snapshot', roomSeq: 1, serverNow: Date.now(),
            payload: { roomCode: 'ATTC1', status: 'IN_GAME', seq: 1, gameId: 'cheese-thief', config: { gameConfig: {} }, members },
          }));
          ws.send(JSON.stringify({ v: 1, type: 'game_state', roomSeq: 2, serverNow: Date.now(), payload: gamePayload }));
          return;
        }
        if (parsed.requestId) {
          ws.send(JSON.stringify({
            v: 1, type: 'ack', requestId: parsed.requestId, roomSeq: 1, serverNow: Date.now(),
            payload: { ok: true },
          }));
        }
      } catch {
        // ignore malformed
      }
    });
  });
}

/** 几何走查：席位/告示牌/时刻条/拱窗/中央区 两两重叠与出舞台框检查（照方向稿 __layoutCheck） */
async function probeLayout(page) {
  return page.evaluate(() => {
    const stage = document.querySelector('.cta-stage');
    if (!stage) return { error: 'no .cta-stage' };
    const s = stage.getBoundingClientRect();
    const pick = [
      ...document.querySelectorAll('.cta-seat'),
      ...document.querySelectorAll('.cta-notice, .cta-hours-box, .cta-window, .cta-center'),
    ];
    const rect = (el) => {
      const b = el.getBoundingClientRect();
      return { x: b.left - s.left, y: b.top - s.top, w: b.width, h: b.height };
    };
    const boxes = pick.map((el, i) => ({ n: el.dataset.playerId ?? `${el.className.split(' ')[0]}#${i}`, ...rect(el) }));
    const hit = [];
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        const a = boxes[i];
        const b = boxes[j];
        const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
        const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
        if (ox > 2 && oy > 2) hit.push(`${a.n}×${b.n} ${Math.round(ox)}x${Math.round(oy)}`);
      }
    }
    const out = boxes
      .filter((b) => b.x < -1 || b.y < -1 || b.x + b.w > s.width + 1 || b.y + b.h > s.height + 1)
      .map((b) => `${b.n} out [${[b.x, b.y, b.w, b.h].map(Math.round)}]`);
    return { stage: `${Math.round(s.width)}x${Math.round(s.height)}`, hit, out };
  });
}

async function waitServerReady(url, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${url}/health/live`);
      if (res.ok) return;
    } catch { /* not ready */ }
    await delay(400);
  }
  throw new Error(`服务端 ${url} 未在 ${timeoutMs}ms 内就绪`);
}

async function captureScenario(browser, scenario) {
  const { id, desc, count, meId = 'p2', viewOverrides = {}, viewports } = scenario;
  const members = membersFor(count);
  const gamePayload = cheeseView(count, meId, viewOverrides);
  for (const viewport of viewports ?? [
    { name: '1280x800', width: 1280, height: 800 },
    { name: '390x844', width: 390, height: 844 },
  ]) {
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
    const page = await context.newPage();
    await routeMockServer(page, { gamePayload, members, meId });
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.cta-stage', { timeout: 20_000 });
    // 动画静止后采集（呼吸/闪烁是无限循环，关不住，截的是布局）
    await page.waitForTimeout(700);

    const probe = await probeLayout(page);
    console.log(`  [probe] ${id} ${viewport.name}: ${JSON.stringify(probe)}`);

    const file = path.join(shotsDir, `${id}-${viewport.name}.png`);
    await page.screenshot({ path: file });
    console.log(`已截 ${id}（${desc}）${viewport.name} -> ${file}`);
    await context.close();
  }
}

async function main() {
  fs.mkdirSync(shotsDir, { recursive: true });
  fs.rmSync(DATA_DIR, { recursive: true, force: true });

  console.log('启动真实服务端…');
  const server = spawn(process.execPath, ['packages/server/src/index.ts'], {
    cwd: rootDir,
    stdio: 'ignore',
    env: { ...process.env, PORT: String(PORT), DATA_DIR, LOG_LEVEL: 'warn', E2E_JOIN_LIMIT_MAX: '1000' },
  });
  process.on('exit', () => { try { server.kill(); } catch { /* noop */ } });
  await waitServerReady(BASE_URL);
  console.log('服务端就绪，启动浏览器…');
  const browser = await chromium.launch({ headless: true });

  const scenarios = [
    {
      id: 'wake-solo',
      desc: '① 夜里 3 点你独醒·奶酪在',
      count: 5,
      viewOverrides: { phase: 'night', currentHour: 3, cheeseStolen: false },
    },
    {
      id: 'wake-missing',
      desc: '① 你 5 点独醒·奶酪已被偷·可偷看',
      count: 5,
      viewOverrides: {
        phase: 'night',
        currentHour: 5,
        cheeseStolen: true,
        me: { wakeHour: 5, cheeseWasMissing: true, canPeek: true },
      },
    },
    {
      id: 'roll-single',
      desc: '② 5–8 人局开局窗口（揭开自己点数）',
      count: 6,
      viewOverrides: { phase: 'night', currentHour: 0, deadlineAt: Date.now() + 17_000 },
    },
    {
      id: 'roll-pick',
      desc: '② 4 人局两骰自选',
      count: 4,
      viewOverrides: {
        phase: 'hour_choice',
        currentHour: 0,
        deadlineAt: Date.now() + 30_000,
        me: { wakeHour: 0, hourChoices: [3, 5] },
      },
    },
    {
      id: 'dawn',
      desc: '③ 天亮讨论（昼）',
      count: 5,
      viewOverrides: {
        phase: 'dawn',
        currentHour: 0,
        cheeseStolen: true,
        deadlineAt: Date.now() + 115_000,
        me: { cheeseWasMissing: true },
      },
    },
    {
      id: 'vote-marked',
      desc: '③ 投票中·你已指认·两席已投',
      count: 5,
      viewOverrides: {
        phase: 'vote',
        currentHour: 0,
        cheeseStolen: true,
        deadlineAt: Date.now() + 26_000,
        votes: { p2: { kind: 'accuse', targetPlayerId: 'p4' }, p1: { kind: 'abstain' } },
        me: { hasVoted: true },
      },
    },
    {
      id: 'reveal-village',
      desc: '④ 揭晓·村民胜（你 3 点独醒偷走，被投出）',
      count: 6,
      viewOverrides: {
        phase: 'game_over',
        currentHour: 0,
        cheeseStolen: true,
        deadlineAt: null,
        thiefCaught: true,
        winners: ['p1', 'p3', 'p4', 'p5', 'p6'],
        votes: {
          p1: { kind: 'accuse', targetPlayerId: 'p2' },
          p2: { kind: 'accuse', targetPlayerId: 'p4' },
          p3: { kind: 'accuse', targetPlayerId: 'p2' },
          p4: { kind: 'accuse', targetPlayerId: 'p2' },
          p5: { kind: 'abstain' },
          p6: { kind: 'accuse', targetPlayerId: 'p4' },
        },
        reveal: {
          thiefId: 'p2',
          stealHour: 3,
          wakeHours: { p1: 5, p2: 3, p3: 1, p4: 1, p5: 6, p6: 4 },
          accomplices: [],
          peeks: [{ viewer: 'p1', target: 'p3' }],
        },
        me: { isThief: true, hasVoted: true },
      },
    },
    {
      id: 'reveal-thief',
      desc: '④ 揭晓·大盗胜（投错人）',
      count: 6,
      viewOverrides: {
        phase: 'game_over',
        currentHour: 0,
        cheeseStolen: true,
        deadlineAt: null,
        thiefCaught: false,
        winners: ['p2'],
        votes: {
          p1: { kind: 'accuse', targetPlayerId: 'p4' },
          p2: { kind: 'accuse', targetPlayerId: 'p4' },
          p3: { kind: 'accuse', targetPlayerId: 'p4' },
          p4: { kind: 'accuse', targetPlayerId: 'p2' },
          p5: { kind: 'abstain' },
          p6: { kind: 'accuse', targetPlayerId: 'p2' },
        },
        reveal: {
          thiefId: 'p2',
          stealHour: 3,
          wakeHours: { p1: 5, p2: 3, p3: 1, p4: 1, p5: 6, p6: 4 },
          accomplices: [],
          peeks: [],
        },
        me: { isThief: true, hasVoted: true },
      },
    },
    {
      id: 'wake-8p-mobile',
      desc: '① 手机 8 人两行卡（用户复看过的版式）',
      count: 8,
      viewports: [{ name: '390x844', width: 390, height: 844 }],
      viewOverrides: { phase: 'night', currentHour: 3, cheeseStolen: false },
    },
  ];

  const only = process.argv[2];
  for (const scenario of scenarios) {
    if (only && scenario.id !== only) continue;
    try {
      await captureScenario(browser, scenario);
    } catch (err) {
      console.error(`场景 ${scenario.id} 失败：`, err);
    }
  }

  await browser.close();
  server.kill();
  console.log('完成。截图目录：', shotsDir);
}

await main();
