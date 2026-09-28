/**
 * 平台结算坞 · 真实 App 渲染截图组（第 2 轮验收）
 *
 * 与 scripts/capture-settlement-dock-shots.mjs（截方向稿 mock HTML）不同：
 * 本脚本启动真实 server + 真实构建产物（packages/client/dist），
 * 用 Playwright routeWebSocket 在浏览器侧Mock WS 协议（welcome/ack/room_snapshot/game_state），
 * 驱动真实 React 客户端渲染 POST_GAME 结算坞，再按场景截图。
 *
 * 场景（每个场景 1280x800 + 390x844 双档）：
 * - R1-light        奶酪大盗(浅) 5 人，自己未准备
 * - R2-light-meReady 奶酪大盗(浅) 5 人，自己已准备、只差 1 人
 * - R3-countdown    奶酪大盗(浅) 全员就绪倒计时（房主视角，数字 2）
 * - R4-menu         奶酪大盗(浅) ⋯菜单展开（房主）
 * - R5-dark         一智千金(深) 4 人，自己未准备
 * - R6-werewolf     狼人杀(深) 6 人全员就绪，非房主「等房主开局」
 * - R7-spectator    奶酪大盗(浅) 观战者视角
 * - R8-10p          奶酪大盗(浅) 10 人签到牌网格
 *
 * 运行：node scripts/capture-settlement-dock-real.mjs
 * 前置：已执行 npm run build -w @ldj/client（dist 为最新代码）。
 */
import path from 'node:path';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const shotsDir = path.join(rootDir, 'docs', 'plans', '2026-09-26-settlement-dock-visual', 'shots-real');
const PORT = 3199;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const DATA_DIR = path.join(rootDir, 'e2e', '.tmp-data-dock-shots');

const ME_STORAGE_KEY = 'ldj:session';
const PC_HOST_ENTERED_KEY = 'ldj_pc_host_entered';

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** 昵称池（真实感，含一个长昵称验证省略号） */
const NAMES = ['阿May', '老周', '小鱼干', '豆豆', '南风知我意', 'Kiki', '大熊', '橘子汽水', '阿杰', '墨墨', '阿紫', '老猫'];

function membersFor(count, { meReady = false, readyIds = [], hostIndex = 0 } = {}) {
  return Array.from({ length: count }, (_, i) => {
    const playerId = `p${i + 1}`;
    const ready = i === 0 ? meReady : readyIds.includes(playerId);
    return {
      playerId,
      nickname: NAMES[i] ?? `玩家${i + 1}`,
      seatRole: 'player',
      seat: i + 1,
      isHost: i === hostIndex,
      connectionStatus: 'CONNECTED',
      botKind: null,
      ready,
    };
  });
}

/** 奶酪大盗 game_over 视角（cheese_thief_classic_v1 / viewVersion 1） */
function cheeseGameOverView(playerIds, meId) {
  return {
    sessionId: 'session-dock-shots',
    status: 'FINISHED',
    moduleId: 'cheese-thief',
    rulesetId: 'cheese_thief_classic_v1',
    engineContractVersion: 2,
    viewVersion: 1,
    role: 'player',
    view: {
      gameId: 'cheese-thief',
      rulesetId: 'cheese_thief_classic_v1',
      schemaVersion: 1,
      phase: 'game_over',
      players: playerIds,
      cheeseStolen: true,
      mode: 'standard',
      currentHour: 6,
      roleCardsEnabled: true,
      revealedCat: null,
      revealedDog: null,
      dogFirstVoter: null,
      thiefCaught: true,
      winners: playerIds.filter((id) => id !== playerIds[1]),
      deadlineAt: null,
      votes: null,
      reveal: {
        thiefId: playerIds[1] ?? null,
        stealHour: 3,
        wakeHours: Object.fromEntries(playerIds.map((id, i) => [id, (i % 6) + 1])),
        accomplices: [],
        peeks: [],
      },
      me: {
        playerId: meId,
        wakeHour: 2,
        hourChoices: null,
        coWakers: [],
        cheeseWasMissing: true,
        isThief: false,
        isAccomplice: false,
        knownAccomplices: [],
        roleCard: 'none',
        canPeek: false,
        peekedHour: null,
        catPeekedHour: null,
        hasVoted: true,
      },
    },
  };
}

/** 一智千金结算阶段视角（结构与 e2e/fixtures/wits-wagers.ts mockV3 完全同形，深表皮背景） */
function witsWagersSettlementView(playerIds, meId) {
  const scoreOf = (id) => ({ p1: 23, p2: 6, p3: 3, p4: 0 })[id] ?? 0;
  return {
    sessionId: 'session-dock-shots',
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
      phase: 'settlement',
      round: 1,
      totalRounds: 7,
      phaseEpoch: 4,
      roundToken: 'ww-tok-001',
      deadlineAt: Date.now() + 600_000,
      question: { prompt: '长江的总长度约为多少千米？', unit: '千米' },
      players: playerIds.map((id) => ({
        playerId: id,
        score: scoreOf(id),
        winningGuesses: id === meId ? 1 : 0,
        hasSubmitted: true,
        forfeited: false,
      })),
      board: [
        { id: 'lower', value: null, slot: 'LOWER', odds: 6, authors: [] },
        { id: 'g:5000', value: 5000, slot: 'L1', odds: 3, authors: ['p2'] },
        { id: 'g:6000', value: 6000, slot: 'C', odds: 2, authors: ['p1'] },
        { id: 'g:7000', value: 7000, slot: 'R1', odds: 3, authors: ['p3'] },
      ],
      publicBets: {
        p1: [
          { chipId: 'A', targetId: 'g:6000', extraStake: 4 },
          { chipId: 'B', targetId: null, extraStake: 0 },
        ],
      },
      revealed: {
        round: 1,
        question: {
          id: 'ww-geo-001',
          prompt: '长江的总长度约为多少千米？',
          unit: '千米',
          answer: 6300,
          sourceUrl: 'https://zh.wikipedia.org/wiki/%E9%95%BF%E6%B1%9F',
          sourceNote: '水利部官方数据',
          asOf: '2024',
          explanation: '长江全长约6300千米。',
          reviewed: true,
        },
        board: [
          { id: 'lower', value: null, slot: 'LOWER', odds: 6, authors: [] },
          { id: 'g:5000', value: 5000, slot: 'L1', odds: 3, authors: ['p2'] },
          { id: 'g:6000', value: 6000, slot: 'C', odds: 2, authors: ['p1'] },
          { id: 'g:7000', value: 7000, slot: 'R1', odds: 3, authors: ['p3'] },
        ],
        bets: {
          p1: [
            { chipId: 'A', targetId: 'g:6000', extraStake: 4 },
            { chipId: 'B', targetId: null, extraStake: 0 },
          ],
        },
        winningTargetIds: ['g:6000'],
        awardedAuthors: ['p1'],
        ledger: [
          {
            playerId: 'p1',
            scoreBefore: 10,
            reserved: 4,
            availableBefore: 6,
            winProfit: 10,
            loss: 0,
            authorBonus: 3,
            scoreAfter: 23,
            winningGuessIncrement: 1,
          },
        ],
      },
      history: [],
      result: null,
      me: {
        playerId: meId,
        submittedGuess: { value: 6000, origin: 'submitted' },
        guessRevision: 1,
        acceptedBets: [
          { chipId: 'A', targetId: 'g:6000', extraStake: 4 },
          { chipId: 'B', targetId: null, extraStake: 0 },
        ],
        betRevision: 1,
        reserved: 0,
        available: 23,
        canGuess: false,
        canBet: false,
      },
    },
  };
}

/** 狼人杀 legacy（schemaVersion 5）game_over 视角 */
function werewolfGameOverView(playerIds, meId) {
  const roles = {};
  playerIds.forEach((id, i) => {
    roles[id] = i < 2 ? 'wolf' : i === 2 ? 'seer' : 'villager';
  });
  return {
    sessionId: 'session-dock-shots',
    status: 'FINISHED',
    moduleId: 'werewolf',
    role: 'player',
    view: {
      gameId: 'werewolf',
      schemaVersion: 5,
      phase: 'game_over',
      day: 3,
      players: playerIds.map((id, i) => ({
        playerId: id,
        alive: i >= 2,
        seat: i + 1,
        forfeited: false,
        exitReason: i < 2 ? 'voted_out' : null,
        revealedRole: roles[id],
        idiotRevealed: false,
      })),
      config: {
        rulesetId: 'werewolf_legacy_platform_v2',
        preset: 'classic',
        pace: 'standard',
        witchSelfSave: 'first_night',
        winCondition: 'numbers',
        wolfKillScope: 'non_wolf',
        roles: { guard: false, hunter: false, idiot: false },
      },
      confirmedRolePlayerIds: playerIds,
      announcementConfirmedPlayerIds: playerIds,
      lastNightDeaths: [],
      speakingOrder: [],
      currentSpeakerId: null,
      lastWordsPlayerId: null,
      deadlineAt: null,
      votesSubmitted: 0,
      votesExpected: 0,
      runoffCandidates: [],
      lastVoteSummary: null,
      pendingShooterId: null,
      winner: 'village',
      aborted: false,
      reveal: { roles, voteHistory: [] },
      me: {
        playerId: meId,
        role: roles[meId] ?? 'villager',
        alive: true,
        forfeited: false,
        confirmedRole: true,
        confirmedAnnouncement: true,
        canAct: false,
        hasVoted: false,
        myVote: null,
        lastWordsPending: false,
        wolfTeammateIds: [],
        wolfVotes: {},
        hasNightVoted: false,
        seerResults: [],
        seerCheckedThisNight: false,
        nightVictimId: null,
        witchSaveUsed: false,
        witchPoisonUsed: false,
        witchSaveDecision: null,
        witchPoisonDecided: false,
        witchCanSelfSave: false,
        guardTargetId: null,
        guardDecided: false,
        lastGuardTargetId: null,
        pendingShoot: false,
        idiotRevealed: false,
      },
    },
  };
}

/** 组装一次「Mock 服务端」的 WS 路由；返回 pushRoomSnapshot 用于场景中途改准备状态 */
async function routeMockServer(page, { roomStatus = 'POST_GAME', gameId, members, gamePayload, meId }) {
  let activeWs = null;
  let seq = 2;
  await page.addInitScript(
    ([meKey, meValue, hostKey]) => {
      localStorage.setItem(meKey, meValue);
      // eslint-disable-next-line no-undef -- 该回调在浏览器页面上下文执行
      sessionStorage.setItem(hostKey, 'true');
    },
    [
      ME_STORAGE_KEY,
      JSON.stringify({
        playerId: meId,
        resumeToken: 'dock-shots-token',
        roomCode: 'DOCK1',
        nickname: members.find((m) => m.playerId === meId)?.nickname ?? '我',
        seatRole: members.find((m) => m.playerId === meId)?.seatRole ?? 'player',
      }),
      PC_HOST_ENTERED_KEY,
    ],
  );

  await page.routeWebSocket(/.*\/ws.*/, (ws) => {
    activeWs = ws;
    ws.send(JSON.stringify({
      v: 1,
      type: 'welcome',
      serverNow: Date.now(),
      payload: { protocolVersion: 1, connectionId: 'c_dock_shots', serverVersion: '0.4.0', llmAvailable: false },
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
            payload: {
              roomCode: 'DOCK1',
              status: roomStatus,
              seq: 1,
              gameId,
              config: { gameConfig: {} },
              members,
            },
          }));
          if (gamePayload) {
            ws.send(JSON.stringify({
              v: 1, type: 'game_state', roomSeq: 2, serverNow: Date.now(),
              payload: gamePayload,
            }));
          }
          return;
        }
        // ready / start_game 等命令：直接 ack，避免 UI 卡 busy
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

  /** 场景中途推送新的 room_snapshot（如：先关终局遮罩，再触发全员就绪倒计时） */
  const pushRoomSnapshot = (nextMembers) => {
    if (!activeWs) throw new Error('WS 尚未连接，无法推送 room_snapshot');
    activeWs.send(JSON.stringify({
      v: 1, type: 'room_snapshot', roomSeq: seq, serverNow: Date.now(),
      payload: {
        roomCode: 'DOCK1',
        status: roomStatus,
        seq,
        gameId,
        config: { gameConfig: {} },
        members: nextMembers,
      },
    }));
    seq += 1;
  };

  return { pushRoomSnapshot };
}

async function waitServerReady(url, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${url}/health/live`);
      if (res.ok) return;
    } catch {
      // not ready
    }
    await delay(400);
  }
  throw new Error(`服务端 ${url} 未在 ${timeoutMs}ms 内就绪`);
}

async function captureScenario(browser, scenario) {
  const {
    id, desc, gameId, gamePayload, members, meId = 'p1',
    openMoreMenu = false, waitForDigit = null, expectDocOverflowCheck = true,
    allReadyMembers = null,
  } = scenario;

  for (const viewport of [
    { name: '1280x800', width: 1280, height: 800 },
    { name: '390x844', width: 390, height: 844 },
  ]) {
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
    const page = await context.newPage();
    const { pushRoomSnapshot } = await routeMockServer(page, { gameId, members, gamePayload, meId });
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });

    // 奶酪大盗终局会先弹「终局真相大揭秘」全屏遮罩（会挡住坞），先关掉它再截坞
    if (gameId === 'cheese-thief') {
      try {
        await page.waitForSelector('.cheese-reveal-overlay', { timeout: 8_000 });
        await page.click('.cheese-reveal-overlay button[aria-label="关闭"]', { timeout: 3_000 });
      } catch {
        // 遮罩未出现则忽略
      }
    }

    // 狼人杀终局会先弹「终局复盘」全屏弹窗（会挡住坞），先关掉它再截坞
    if (gameId === 'werewolf') {
      try {
        await page.waitForSelector('button[aria-label="关闭终局复盘"]', { timeout: 8_000 });
        await page.click('button[aria-label="关闭终局复盘"]', { timeout: 3_000 });
      } catch {
        // 弹窗未出现则忽略
      }
    }

    await page.waitForSelector('.settlement-dock', { timeout: 20_000 });
    await page.waitForSelector('.settlement-dock__slip', { timeout: 20_000 });

    // 倒计时场景：先稳定（关遮罩、动画播完），再推「全员就绪」快照让倒计时从头开始
    if (allReadyMembers) {
      await page.waitForTimeout(700);
      pushRoomSnapshot(allReadyMembers);
    }

    if (waitForDigit !== null) {
      // digit 为 2 的窗口只有 1 秒；错过则放宽到「出现任意倒计时数字」再截
      const hit = await page.waitForFunction(
        (digit) => document.querySelector('.settlement-dock__digit')?.textContent === String(digit),
        waitForDigit,
        { timeout: 8_000 },
      ).then(() => true).catch(() => false);
      if (!hit) {
        console.warn(`  [警告] ${id}: 未捕到倒计时数字 ${waitForDigit}，按当前数字截图`);
        await page.waitForSelector('.settlement-dock__digit', { timeout: 5_000 });
      } else {
        // 等 slam 砸入动画播完（520ms），避免截到半透明放大中间帧；数字 2 的窗口为 1 秒
        await page.waitForTimeout(560);
      }
    } else {
      // 等入场动画播完再截图
      await page.waitForTimeout(700);
    }

    if (openMoreMenu) {
      await page.click('.settlement-dock__btn--more');
      await page.waitForSelector('.settlement-dock__more-menu', { timeout: 5_000 });
      await page.waitForTimeout(250);
    }

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    );
    if (expectDocOverflowCheck && overflow) {
      console.warn(`  [警告] ${id} ${viewport.name}: 页面存在横向溢出`);
    }

    if (process.env.DOCK_PROBE === '1') {
      const info = await page.evaluate(() => {
        const board = document.querySelector('.settlement-dock__board')?.getBoundingClientRect();
        const menu = document.querySelector('.settlement-dock__more-menu')?.getBoundingClientRect();
        const tab = document.querySelector('.settlement-dock__tab')?.getBoundingClientRect();
        return {
          scrollW: document.documentElement.scrollWidth,
          clientW: document.documentElement.clientWidth,
          scrollX: window.scrollX,
          board: board && { left: Math.round(board.left), right: Math.round(board.right), top: Math.round(board.top) },
          tab: tab && { left: Math.round(tab.left), right: Math.round(tab.right) },
          menu: menu && { left: Math.round(menu.left), right: Math.round(menu.right) },
        };
      });
      console.log(`  [probe] ${id} ${viewport.name}: ${JSON.stringify(info)}`);
    }

    const file = path.join(shotsDir, `${id}-${viewport.name}.png`);
    await page.screenshot({ path: file });
    console.log(`已截 ${id} (${desc}) ${viewport.name} -> ${file}`);
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

  const fiveIds = ['p1', 'p2', 'p3', 'p4', 'p5'];
  const tenIds = Array.from({ length: 10 }, (_, i) => `p${i + 1}`);
  const sixIds = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'];

  const scenarios = [
    {
      id: 'R1-light',
      desc: '奶酪大盗(浅)·5人·自己未准备',
      gameId: 'cheese-thief',
      members: membersFor(5, { readyIds: ['p2', 'p3'] }),
      gamePayload: cheeseGameOverView(fiveIds, 'p1'),
    },
    {
      id: 'R2-light-meReady',
      desc: '奶酪大盗(浅)·自己已准备·就差豆豆',
      gameId: 'cheese-thief',
      members: membersFor(5, { meReady: true, readyIds: ['p2', 'p3', 'p5'] }),
      gamePayload: cheeseGameOverView(fiveIds, 'p1'),
    },
    {
      id: 'R3-countdown',
      desc: '奶酪大盗(浅)·全员就绪倒计时·房主视角数字2',
      gameId: 'cheese-thief',
      // 先以「差 1 人」进场（不触发倒计时），关遮罩后再推全员就绪快照
      members: membersFor(5, { meReady: true, readyIds: ['p2', 'p3', 'p4'] }),
      allReadyMembers: membersFor(5, { meReady: true, readyIds: ['p2', 'p3', 'p4', 'p5'] }),
      gamePayload: cheeseGameOverView(fiveIds, 'p1'),
      waitForDigit: 2,
      expectDocOverflowCheck: false,
    },
    {
      id: 'R4-menu',
      desc: '奶酪大盗(浅)·⋯菜单展开·房主',
      gameId: 'cheese-thief',
      members: membersFor(5, { readyIds: ['p2'] }),
      gamePayload: cheeseGameOverView(fiveIds, 'p1'),
      openMoreMenu: true,
    },
    {
      id: 'R5-dark',
      desc: '一智千金(深)·4人·自己未准备',
      gameId: 'wits-wagers',
      members: membersFor(4, { readyIds: ['p2'] }),
      gamePayload: witsWagersSettlementView(['p1', 'p2', 'p3', 'p4'], 'p1'),
    },
    {
      id: 'R6-werewolf',
      desc: '狼人杀(深)·6人全员就绪·非房主等房主开局',
      gameId: 'werewolf',
      members: membersFor(6, { meReady: true, readyIds: ['p1', 'p3', 'p4', 'p5', 'p6'], hostIndex: 1 }),
      gamePayload: werewolfGameOverView(sixIds, 'p1'),
      meId: 'p2',
    },
    {
      id: 'R7-spectator',
      desc: '奶酪大盗(浅)·观战者视角',
      gameId: 'cheese-thief',
      members: [
        ...membersFor(5, { readyIds: ['p2', 'p3'] }),
        { playerId: 'p9', nickname: '旁观者', seatRole: 'spectator', seat: null, isHost: false, connectionStatus: 'CONNECTED', botKind: null, ready: false },
      ],
      gamePayload: cheeseGameOverView(fiveIds, 'p1'),
      meId: 'p9',
    },
    {
      id: 'R8-10p',
      desc: '奶酪大盗(浅)·10人签到牌网格',
      gameId: 'cheese-thief',
      members: membersFor(10, { readyIds: ['p2', 'p3', 'p5', 'p7', 'p8', 'p10'] }),
      gamePayload: cheeseGameOverView(tenIds, 'p1'),
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

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
