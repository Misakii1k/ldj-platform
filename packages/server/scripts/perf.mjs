/**
 * 性能压测脚本（NFR-001~009 验证）。
 *
 * 模拟 12 路 WebSocket 连接 + 8 机器人，跑完 3 局「谁是卧底」完整对局，
 * 采集客户端侧请求延迟、RPS、对局完成数，以及服务端 RSS/CPU 采样
 * （服务端以 PERF_STATS_INTERVAL_MS 启动，perf-stats 行由本脚本解析）。
 *
 * 约束：
 * - 仅用 Node 内置模块（Node 24+ 全局 WebSocket）
 * - .mjs（ESM）
 * - 不修改其他文件（报告写 perf-report.json 于仓库根）
 *
 * 用法：
 *   node packages/server/scripts/perf.mjs                    # 3 局基线（NFR-005）
 *   node packages/server/scripts/perf.mjs --long-run-minutes 30  # 30 分钟长跑（NFR-006）
 *
 * 适配说明：谁是卧底上限 12 人（minPlayers=4, maxPlayers=12），
 * 故 4 名真人玩家 + 8 名机器人 = 12 人参局，另有 8 路观战连接，合计 12 路 WebSocket。
 * 协议信封为 {v:1, type, requestId, payload}（非 task 描述中的 kind/seatId 字段）。
 */
import { spawn } from 'node:child_process';
import http from 'node:http';
import { writeFileSync, rmSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// —— 常量 ——

const PROTOCOL_VERSION = 1;
const PORT = 8089;
const HOST = '127.0.0.1';
const DATA_DIR = '.perf-data';
const HUMAN_PLAYERS = 4;
const SPECTATORS = 8;
const WS_CONNECTIONS = HUMAN_PLAYERS + SPECTATORS; // 12
const BOT_COUNT = 8;
const MAX_GAMES = 3;
const READY_TIMEOUT_MS = 30_000;
const GLOBAL_TIMEOUT_MS = 20 * 60 * 1000;
const PER_GAME_TIMEOUT_MS = 300_000;
const P95_THRESHOLD_MS = 200;
/** NFR-005：低资源主机完成 3 局后服务端 RSS ≤ 200 MB */
const SERVER_RSS_LIMIT_MB = 200;
/** NFR-006：30 分钟重复开局/结束，强制稳定期前后 RSS 增长 ≤ 30 MB */
const NFR006_GROWTH_LIMIT_MB = 30;
/** 服务端采样间隔：以 PERF_STATS_INTERVAL_MS 环境变量启动子进程 */
const PERF_STATS_INTERVAL_MS = 2000;

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '../../..');
const SERVER_ENTRY = 'packages/server/src/index.ts';
const REPORT_PATH = resolve(PROJECT_ROOT, 'perf-report.json');
const DATA_PATH = resolve(PROJECT_ROOT, DATA_DIR);
const CRASH_LOG_PATH = resolve(PROJECT_ROOT, '.perf-crash.log');

// —— 命令行参数 ——

/** 读取 --long-run-minutes <n>；未提供或非法返回 0（普通 3 局模式） */
function parseLongRunMinutes() {
  const args = process.argv.slice(2);
  const idx = args.indexOf('--long-run-minutes');
  if (idx === -1) return 0;
  const raw = args[idx + 1];
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

const LONG_RUN_MINUTES = parseLongRunMinutes();

// —— 全局指标 ——

let globalReqCounter = 0;
const sendTimestamps = new Map(); // requestId → sentAt
const latencies = []; // 每条 send→ack 的延迟（ms）
let totalMessagesSent = 0;
const failureReasons = []; // 首个失败原因（写入报告，避免 process.exit 丢弃缓冲 stdout）

function recordSend(requestId) {
  sendTimestamps.set(requestId, Date.now());
  totalMessagesSent++;
}

function recordAck(requestId) {
  const sentAt = sendTimestamps.get(requestId);
  if (sentAt !== undefined) {
    latencies.push(Date.now() - sentAt);
    sendTimestamps.delete(requestId);
  }
}

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// —— 健康检查轮询 ——

function checkReady() {
  return new Promise((resolveP, reject) => {
    const req = http.get(`http://${HOST}:${PORT}/health/ready`, (res) => {
      res.resume();
      res.on('end', () => resolveP(res.statusCode === 200));
    });
    req.on('error', reject);
    req.setTimeout(2000, () => {
      req.destroy();
      reject(new Error('timeout'));
    });
  });
}

async function waitForReady() {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      if (await checkReady()) return true;
    } catch {
      // 服务端尚未监听
    }
    await sleep(200);
  }
  return false;
}

// —— 投票目标选取 ——

function pickVoteTarget(view, myId) {
  let candidates;
  if (view.phase === 'runoff_voting') {
    candidates = (view.runoffCandidates || []).filter((id) => id !== myId);
  } else {
    candidates = (view.players || [])
      .filter((p) => p.alive && p.playerId !== myId)
      .map((p) => p.playerId);
  }
  if (candidates.length === 0) return null;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

// —— 测试客户端 ——

class PerfClient {
  constructor(id, ws) {
    this.id = id;
    this.ws = ws;
    this.playerId = null;
    this.queue = [];
    this.waiters = [];
    this.closed = false;
    this.lastView = null;
    // 自动出招去重
    this.#inFlight = new Set();
    this.#lastPhase = null;
  }

  #inFlight;
  #lastPhase;

  /** 注册消息处理（构造后立即调用） */
  #onMessage(event) {
    let envelope;
    try {
      envelope = JSON.parse(event.data);
    } catch {
      return;
    }

    // 记录 ack/error 延迟
    if ((envelope.type === 'ack' || envelope.type === 'error') && envelope.requestId) {
      recordAck(envelope.requestId);
    }

    // 分发给等待者
    const idx = this.waiters.findIndex((w) => w.predicate(envelope));
    if (idx >= 0) {
      const [waiter] = this.waiters.splice(idx, 1);
      waiter.resolve(envelope);
    } else {
      this.queue.push(envelope);
    }

    // 跟踪对局视角并自动出招
    if (envelope.type === 'game_state' && envelope.payload?.view) {
      this.lastView = envelope.payload.view;
      this.#autoPlay(envelope.payload.view);
    }
  }

  #autoPlay(view) {
    if (!view.me) return; // 观战者不参局
    const myId = view.me.playerId;
    if (!myId || !view.me.alive) return;

    // 阶段切换时清理旧标记
    if (view.phase !== this.#lastPhase) {
      this.#lastPhase = view.phase;
      this.#inFlight.delete('confirm_word');
      this.#inFlight.delete('cast_vote');
    }

    switch (view.phase) {
      case 'word_reveal': {
        if (!view.me.confirmed && !this.#inFlight.has('confirm_word')) {
          this.#inFlight.add('confirm_word');
          this.#fireAction({ type: 'confirm_word' }, 'confirm_word');
        }
        break;
      }
      case 'speaking': {
        if (view.currentSpeakerId === myId) {
          const key = `finish_speech:${view.round}:${myId}`;
          if (!this.#inFlight.has(key)) {
            this.#inFlight.add(key);
            this.#fireAction({ type: 'finish_speech' }, key);
          }
        }
        break;
      }
      case 'voting':
      case 'runoff_voting': {
        if (!view.me.hasVoted && !this.#inFlight.has('cast_vote')) {
          const target = pickVoteTarget(view, myId);
          if (target) {
            this.#inFlight.add('cast_vote');
            this.#fireAction({ type: 'cast_vote', targetPlayerId: target }, 'cast_vote');
          }
        }
        break;
      }
    }
  }

  /** 发送 game_action 并在 ack/error 后清理去重标记 */
  #fireAction(action, key) {
    const requestId = this.send('game_action', action);
    this.waitFor((e) => e.requestId === requestId && (e.type === 'ack' || e.type === 'error'), 8000)
      .catch(() => {})
      .finally(() => {
        this.#inFlight.delete(key);
      });
  }

  /** 绑定底层 WebSocket 事件（构造后调用） */
  bind() {
    this.ws.addEventListener('message', (e) => this.#onMessage(e));
    this.ws.addEventListener('close', () => {
      this.closed = true;
      for (const w of this.waiters) w.reject(new Error('连接关闭'));
      this.waiters = [];
    });
    this.ws.addEventListener('error', () => {
      // 由 close 事件统一处理
    });
  }

  send(type, payload) {
    const requestId = `perf-${this.id}-${++globalReqCounter}`;
    recordSend(requestId);
    this.ws.send(JSON.stringify({ v: PROTOCOL_VERSION, type, requestId, payload }));
    return requestId;
  }

  async request(type, payload, timeoutMs = 10_000) {
    const requestId = this.send(type, payload);
    return this.waitFor(
      (e) => e.requestId === requestId && (e.type === 'ack' || e.type === 'error'),
      timeoutMs,
    );
  }

  async waitFor(predicate, timeoutMs = 10_000) {
    const idx = this.queue.findIndex(predicate);
    if (idx >= 0) return this.queue.splice(idx, 1)[0];
    return new Promise((resolveP, reject) => {
      const timer = setTimeout(() => reject(new Error('等待消息超时')), timeoutMs);
      this.waiters.push({
        predicate,
        resolve: (e) => {
          clearTimeout(timer);
          resolveP(e);
        },
        reject: (err) => {
          clearTimeout(timer);
          reject(err);
        },
      });
    });
  }

  /** 清空队列中残留的旧消息（新对局前调用） */
  drainQueue() {
    this.queue.length = 0;
  }
}

// —— 连接客户端 ——

function connectClient(id) {
  return new Promise((resolveP, reject) => {
    const ws = new WebSocket(`ws://${HOST}:${PORT}/`);
    const client = new PerfClient(id, ws);
    client.bind();
    const timer = setTimeout(() => {
      reject(new Error(`客户端 ${id} 连接超时`));
    }, 5000);
    ws.addEventListener('open', () => {
      clearTimeout(timer);
      // 等待 welcome 帧
      client
        .waitFor((e) => e.type === 'welcome', 5000)
        .then(() => resolveP(client))
        .catch(reject);
    });
    ws.addEventListener('error', () => {
      clearTimeout(timer);
      reject(new Error(`客户端 ${id} WebSocket 连接错误`));
    });
  });
}

// —— 主流程 ——

async function main() {
  console.log('启动服务端子进程...');

  const server = spawn('node', [SERVER_ENTRY], {
    cwd: PROJECT_ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      DATA_DIR,
      LOG_LEVEL: 'warn',
      PERF_STATS_INTERVAL_MS: String(PERF_STATS_INTERVAL_MS),
      // 12 人合法秒加超过防爆破 join 配额（10 次/分/IP），压测场景放宽
      E2E_JOIN_LIMIT_MAX: '100',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let serverCrashed = false;
  // 服务端采样：解析 [perf-stats] rss=<bytes> cpu=<百分比> 行；其余输出保持静默
  const serverStats = []; // { rss, cpu, t }
  let serverStdoutBuf = '';
  server.stdout.on('data', (chunk) => {
    serverStdoutBuf += chunk.toString();
    let nl;
    while ((nl = serverStdoutBuf.indexOf('\n')) !== -1) {
      const line = serverStdoutBuf.slice(0, nl).trim();
      serverStdoutBuf = serverStdoutBuf.slice(nl + 1);
      const m = line.match(/^\[perf-stats\] rss=(\d+) cpu=([\d.]+)$/);
      if (m) serverStats.push({ rss: Number(m[1]), cpu: Number(m[2]), t: Date.now() });
    }
  });
  server.stderr.on('data', (chunk) => {
    const text = chunk.toString().trim();
    if (text) console.error('[server]', text);
  });
  server.on('exit', (code, signal) => {
    if (signal !== 'SIGTERM' && signal !== 'SIGKILL') {
      serverCrashed = true;
      console.error(`服务端子进程异常退出: code=${code} signal=${signal}`);
    }
  });

  // 全局超时兜底
  const globalTimer = setTimeout(async () => {
    console.error('全局超时（10 分钟），强制退出');
    await cleanup(server, []);
    process.exit(1);
  }, GLOBAL_TIMEOUT_MS);
  globalTimer.unref();

  // 等待服务端就绪
  const ready = await waitForReady();
  if (!ready) {
    console.error('服务端在 30 秒内未就绪');
    await cleanup(server, []);
    process.exit(1);
  }

  console.log('服务端已就绪，开始连接 12 路 WebSocket...');

  // 连接 12 个客户端
  const clients = [];
  for (let i = 0; i < WS_CONNECTIONS; i++) {
    try {
      clients.push(await connectClient(i));
    } catch (err) {
      console.error(`客户端 ${i} 连接失败: ${err.message}`);
      await cleanup(server, clients);
      process.exit(1);
    }
  }

  console.log('12 路 WebSocket 连接已建立，开始创建房间...');

  // 检查 LLM 是否可用（从 welcome 帧读取）
  const host = clients[0];
  // welcome 帧已在连接时消费，从队列中找 llmAvailable 信息
  // 简化：默认 LLM 不可用（未配置 LLM_BASE_URL），全部用 rule 机器人
  const llmAvailable = false;

  // 房主建房
  let roomCode;
  try {
    const createAck = await host.request('create_room', {
      nickname: '房主',
      gameId: 'undercover',
    });
    if (createAck.type === 'error') throw new Error(createAck.payload?.code ?? 'create_room 失败');
    roomCode = createAck.payload.roomCode;
    host.playerId = createAck.payload.playerId;
  } catch (err) {
    console.error(`建房失败: ${err.message}`);
    await cleanup(server, clients);
    process.exit(1);
  }

  console.log(`房间已创建: ${roomCode}，开始加入玩家...`);

  // 3 名真人玩家加入（房主已是第 1 名）
  for (let i = 1; i < HUMAN_PLAYERS; i++) {
    try {
      const ack = await clients[i].request('join_room', {
        roomCode,
        nickname: `玩家${i + 1}`,
      });
      if (ack.type === 'error') throw new Error(ack.payload?.code ?? 'join_room 失败');
      clients[i].playerId = ack.payload.playerId;
    } catch (err) {
      console.error(`玩家 ${i + 1} 加入失败: ${err.message}`);
      await cleanup(server, clients);
      process.exit(1);
    }
  }

  // 8 名观战者加入
  for (let i = HUMAN_PLAYERS; i < WS_CONNECTIONS; i++) {
    try {
      const ack = await clients[i].request('join_room', {
        roomCode,
        nickname: `观众${i - HUMAN_PLAYERS + 1}`,
        asSpectator: true,
      });
      if (ack.type === 'error') throw new Error(ack.payload?.code ?? 'join_room (spectator) 失败');
      clients[i].playerId = ack.payload.playerId;
    } catch (err) {
      console.error(`观众 ${i - HUMAN_PLAYERS + 1} 加入失败: ${err.message}`);
      await cleanup(server, clients);
      process.exit(1);
    }
  }

  console.log('4 名玩家 + 8 名观战者已加入，开始添加 8 个机器人...');

  // 添加 8 个机器人（LLM 可用时 4 rule + 4 llm，否则全 rule）
  const llmBotCount = llmAvailable ? 4 : 0;
  const ruleBotCount = BOT_COUNT - llmBotCount;
  for (let i = 0; i < ruleBotCount; i++) {
    try {
      const ack = await host.request('room_command', { command: 'add_bot', kind: 'rule' });
      if (ack.type === 'error') throw new Error(ack.payload?.code ?? 'add_bot(rule) 失败');
    } catch (err) {
      console.error(`添加 rule 机器人 ${i + 1} 失败: ${err.message}`);
      await cleanup(server, clients);
      process.exit(1);
    }
  }
  for (let i = 0; i < llmBotCount; i++) {
    try {
      const ack = await host.request('room_command', { command: 'add_bot', kind: 'llm' });
      if (ack.type === 'error') throw new Error(ack.payload?.code ?? 'add_bot(llm) 失败');
    } catch (err) {
      console.error(`添加 llm 机器人 ${i + 1} 失败: ${err.message}`);
      await cleanup(server, clients);
      process.exit(1);
    }
  }

  console.log(`8 个机器人已添加（rule=${ruleBotCount}, llm=${llmBotCount}），开始三局对局...`);

  // 每局前 4 名真人玩家准备（ready 为全员命令；机器人加入时 ready=1 且跨局保持）
  async function readyHumans() {
    for (let i = 0; i < HUMAN_PLAYERS; i++) {
      try {
        const ack = await clients[i].request('room_command', { command: 'ready', ready: true });
        if (ack.type === 'error') throw new Error(ack.payload?.code ?? 'ready 失败');
      } catch (err) {
        console.error(`玩家 ${i + 1} 准备失败: ${err.message}`);
        return false;
      }
    }
    return true;
  }

  // —— 完整对局（默认 3 局；长跑模式持续到 --long-run-minutes 截止） ——

  const totalStart = Date.now();
  const longRunDeadline = LONG_RUN_MINUTES > 0 ? totalStart + LONG_RUN_MINUTES * 60_000 : 0;
  let gamesCompleted = 0;
  const perGameDurations = [];
  // NFR-006 稳定期采样：长跑模式下首局完成与最后一局完成的 RSS
  let stabilizationStartRss = null;
  let stabilizationEndRss = null;
  // NFR-005 采样：第 3 局完成时的服务端 RSS
  let rssAfterThirdGame = null;

  const latestServerRss = () =>
    serverStats.length > 0 ? serverStats[serverStats.length - 1].rss : null;

  for (let g = 0; ; g++) {
    const wantMinGames = g < MAX_GAMES;
    const wantLongRun = longRunDeadline !== 0 && Date.now() < longRunDeadline;
    if (!wantMinGames && !wantLongRun) break;

    // 清空各客户端队列中残留的旧帧，避免 waitFor 拿到上一局的 game_over
    for (const c of clients) c.drainQueue();

    // 每局开局前准备真人（return_to_lobby 已重置真人 ready；机器人保持就绪）
    if (!(await readyHumans())) {
      console.error('真人准备失败，终止测试');
      failureReasons.push(`第 ${g + 1} 局真人准备失败`);
      break;
    }

    // 开局
    try {
      const ack = await host.request('room_command', { command: 'start_game' });
      if (ack.type === 'error') {
        const reason = `第 ${g + 1} 局开局失败: ${ack.payload?.code} ${ack.payload?.message ?? ''}`;
        console.error(reason);
        failureReasons.push(reason);
        break;
      }
    } catch (err) {
      const reason = `第 ${g + 1} 局开局异常: ${err.message}`;
      console.error(reason);
      failureReasons.push(reason);
      break;
    }

    const gameStart = Date.now();

    // 等待 game_over（房主监听 game_state）
    let gameOver = false;
    try {
      await host.waitFor(
        (e) => e.type === 'game_state' && e.payload?.view?.phase === 'game_over',
        PER_GAME_TIMEOUT_MS,
      );
      gameOver = true;
    } catch (err) {
      const reason = `第 ${g + 1} 局等待 game_over 超时: ${err.message}`;
      console.error(reason);
      failureReasons.push(reason);
    }

    const gameDuration = Date.now() - gameStart;
    perGameDurations.push(gameDuration);

    if (gameOver) {
      gamesCompleted++;
      console.log(`第 ${g + 1} 局完成（${(gameDuration / 1000).toFixed(1)}s）`);
      if (stabilizationStartRss === null) stabilizationStartRss = latestServerRss();
      stabilizationEndRss = latestServerRss();
      if (gamesCompleted === MAX_GAMES && rssAfterThirdGame === null) {
        rssAfterThirdGame = latestServerRss();
      }
    } else {
      console.error(`第 ${g + 1} 局未完成，终止测试`);
      break;
    }

    // 还有下一局才返回大厅；无下一局则结束
    const willContinue =
      g + 1 < MAX_GAMES || (longRunDeadline !== 0 && Date.now() < longRunDeadline);
    if (!willContinue) break;

    try {
      const ack = await host.request('room_command', { command: 'return_to_lobby' });
      if (ack.type === 'error') {
        const reason = `返回大厅失败: ${ack.payload?.code} ${ack.payload?.message ?? ''}`;
        console.error(reason);
        failureReasons.push(reason);
        break;
      }
    } catch (err) {
      const reason = `返回大厅异常: ${err.message}`;
      console.error(reason);
      failureReasons.push(reason);
      break;
    }
    // 重置客户端自动出招状态
    for (const c of clients) {
      c.drainQueue();
    }
    await sleep(200);
  }

  const totalDurationMs = Date.now() - totalStart;
  clearTimeout(globalTimer);

  // —— 计算指标 ——

  const sortedLatencies = [...latencies].sort((a, b) => a - b);
  const p50 = percentile(sortedLatencies, 0.5);
  const p95 = percentile(sortedLatencies, 0.95);
  const p99 = percentile(sortedLatencies, 0.99);
  const totalDurationS = totalDurationMs / 1000;
  const rps = totalDurationS > 0 ? totalMessagesSent / totalDurationS : 0;
  const memMB = process.memoryUsage().rss / (1024 * 1024);

  // —— 服务端采样统计（NFR-005/006） ——

  const rssSamples = serverStats.map((s) => s.rss);
  const serverRssFirst = rssSamples.length > 0 ? rssSamples[0] : 0;
  const serverRssEnd = rssSamples.length > 0 ? rssSamples[rssSamples.length - 1] : 0;
  const serverRssPeak = rssSamples.length > 0 ? Math.max(...rssSamples) : 0;
  const serverRssAfter3GamesMB = (rssAfterThirdGame ?? serverRssEnd) / (1024 * 1024);
  const serverRssGrowthMB = (serverRssEnd - serverRssFirst) / (1024 * 1024);
  const cpuAvgPct =
    serverStats.length > 0
      ? serverStats.reduce((acc, s) => acc + s.cpu, 0) / serverStats.length
      : 0;
  const stabilityGrowthMB =
    stabilizationStartRss !== null && stabilizationEndRss !== null
      ? (stabilizationEndRss - stabilizationStartRss) / (1024 * 1024)
      : 0;

  // —— 输出报告 ——

  console.log();
  console.log('=== 性能报告 ===');
  console.log(`对局完成数: ${gamesCompleted}`);
  console.log(`总消息数: ${totalMessagesSent}`);
  console.log(`总耗时: ${totalDurationS.toFixed(2)}s`);
  console.log(`RPS: ${rps.toFixed(2)}`);
  console.log(`延迟 p50: ${p50}ms`);
  console.log(`延迟 p95: ${p95}ms`);
  console.log(`延迟 p99: ${p99}ms`);
  console.log(`客户端进程内存: ${memMB.toFixed(1)} MB`);
  console.log(`服务端采样数: ${serverStats.length}`);
  console.log(`服务端 RSS（第 3 局后）: ${serverRssAfter3GamesMB.toFixed(1)} MB`);
  console.log(`服务端 RSS 峰值: ${(serverRssPeak / (1024 * 1024)).toFixed(1)} MB`);
  console.log(`服务端 RSS 增长: ${serverRssGrowthMB.toFixed(1)} MB`);
  console.log(`服务端 CPU 平均占用: ${cpuAvgPct.toFixed(2)}%`);
  if (LONG_RUN_MINUTES > 0) {
    console.log(`长跑稳定期 RSS 增长: ${stabilityGrowthMB.toFixed(1)} MB`);
  }
  if (perGameDurations.length > 0) {
    console.log(
      `各局耗时: ${perGameDurations.map((d) => (d / 1000).toFixed(1) + 's').join(', ')}`,
    );
  }

  // 写 JSON 报告
  const report = {
    timestamp: new Date().toISOString(),
    config: {
      wsConnections: WS_CONNECTIONS,
      humanPlayers: HUMAN_PLAYERS,
      spectators: SPECTATORS,
      bots: BOT_COUNT,
      ruleBots: ruleBotCount,
      llmBots: llmBotCount,
      maxGames: MAX_GAMES,
    },
    results: {
      gamesCompleted,
      totalMessages: totalMessagesSent,
      totalDurationMs,
      rps: Number(rps.toFixed(2)),
      latency: { p50, p95, p99 },
      clientMemoryMB: Number(memMB.toFixed(2)),
      perGameDurationsMs: perGameDurations,
      serverRssAfter3GamesMB: Number(serverRssAfter3GamesMB.toFixed(2)),
      serverRssEndMB: Number((serverRssEnd / (1024 * 1024)).toFixed(2)),
      serverRssPeakMB: Number((serverRssPeak / (1024 * 1024)).toFixed(2)),
      serverRssGrowthMB: Number(serverRssGrowthMB.toFixed(2)),
      serverCpuAvgPct: Number(cpuAvgPct.toFixed(2)),
      stabilityGrowthMB: Number(stabilityGrowthMB.toFixed(2)),
    },
    serverSampling: {
      enabled: serverStats.length > 0,
      intervalMs: PERF_STATS_INTERVAL_MS,
      samples: serverStats.length,
      longRunMinutes: LONG_RUN_MINUTES,
    },
    dataPoints: {
      latencies: sortedLatencies,
    },
    failureCriteria: {
      p95Exceeded: p95 > P95_THRESHOLD_MS,
      serverCrashed,
      gamesIncomplete: gamesCompleted < MAX_GAMES,
      serverRssExceeded: serverRssAfter3GamesMB > SERVER_RSS_LIMIT_MB,
      stabilityGrowthExceeded: LONG_RUN_MINUTES > 0 && stabilityGrowthMB > NFR006_GROWTH_LIMIT_MB,
    },
    failureReasons,
  };
  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  console.log(`\n详细报告已写入: ${REPORT_PATH}`);

  // —— 失败判定 ——

  let exitCode = 0;
  if (p95 > P95_THRESHOLD_MS) {
    console.error(`失败: p95 延迟 ${p95}ms > ${P95_THRESHOLD_MS}ms`);
    exitCode = 1;
  }
  if (serverCrashed) {
    console.error('失败: 服务端子进程崩溃');
    exitCode = 1;
  }
  if (gamesCompleted < MAX_GAMES) {
    console.error(`失败: 对局完成数 ${gamesCompleted} < ${MAX_GAMES}`);
    exitCode = 1;
  }
  if (serverRssAfter3GamesMB > SERVER_RSS_LIMIT_MB) {
    console.error(
      `失败: NFR-005 服务端 RSS ${serverRssAfter3GamesMB.toFixed(1)}MB > ${SERVER_RSS_LIMIT_MB}MB`,
    );
    exitCode = 1;
  }
  if (LONG_RUN_MINUTES > 0 && stabilityGrowthMB > NFR006_GROWTH_LIMIT_MB) {
    console.error(
      `失败: NFR-006 稳定期 RSS 增长 ${stabilityGrowthMB.toFixed(1)}MB > ${NFR006_GROWTH_LIMIT_MB}MB`,
    );
    exitCode = 1;
  }

  // —— 清理 ——

  await cleanup(server, clients);

  // 用 exitCode 让进程自然退出（冲洗 stdout 缓冲），而非 process.exit 直接截断
  process.exitCode = exitCode;
}

// —— 清理 ——

async function cleanup(server, clients) {
  // 关闭所有 WS 连接
  for (const c of clients) {
    try {
      if (c.ws.readyState === WebSocket.OPEN) c.ws.close();
    } catch {
      // 忽略
    }
  }

  // 终止服务端子进程：SIGTERM → 等 1 秒 → SIGKILL 兜底
  try {
    server.kill('SIGTERM');
  } catch {
    // 忽略
  }
  await sleep(1000);
  try {
    server.kill('SIGKILL');
  } catch {
    // 忽略
  }

  // 删除 .perf-data 目录
  try {
    rmSync(DATA_PATH, { recursive: true, force: true });
  } catch {
    // 忽略
  }
}

// —— 入口 ——

process.on('unhandledRejection', (reason) => {
  const msg = `unhandledRejection: ${reason instanceof Error ? reason.stack : String(reason)}`;
  console.error(msg);
  try {
    writeFileSync(CRASH_LOG_PATH, msg);
  } catch {
    // 忽略
  }
  process.exit(1);
});

main().catch((err) => {
  const msg = `压测脚本异常: ${err instanceof Error ? err.stack : String(err)}`;
  console.error(msg);
  try {
    writeFileSync(CRASH_LOG_PATH, msg);
  } catch {
    // 忽略
  }
  process.exit(1);
});
