/**
 * 性能压测脚本（NFR-001~009 验证）。
 *
 * 模拟 12 路 WebSocket 连接 + 8 机器人，跑完 3 局「谁是卧底」完整对局，
 * 采集客户端侧请求延迟、RPS 与对局完成数。
 *
 * 约束：
 * - 仅用 Node 内置模块（Node 24+ 全局 WebSocket）
 * - .mjs（ESM）
 * - 不修改其他文件
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
const GLOBAL_TIMEOUT_MS = 10 * 60 * 1000;
const PER_GAME_TIMEOUT_MS = 120_000;
const P95_THRESHOLD_MS = 200;

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '../../..');
const SERVER_ENTRY = 'packages/server/src/index.ts';
const REPORT_PATH = resolve(PROJECT_ROOT, 'perf-report.json');
const DATA_PATH = resolve(PROJECT_ROOT, DATA_DIR);

// —— 全局指标 ——

let globalReqCounter = 0;
const sendTimestamps = new Map(); // requestId → sentAt
const latencies = []; // 每条 send→ack 的延迟（ms）
let totalMessagesSent = 0;

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
    env: { ...process.env, PORT: String(PORT), DATA_DIR, LOG_LEVEL: 'warn' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let serverCrashed = false;
  server.stdout.on('data', () => {
    // 静默：LOG_LEVEL=warn 已压制大部分输出
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

  // —— 三局完整对局 ——

  const totalStart = Date.now();
  let gamesCompleted = 0;
  const perGameDurations = [];

  for (let g = 0; g < MAX_GAMES; g++) {
    // 清空各客户端队列中残留的旧帧，避免 waitFor 拿到上一局的 game_over
    for (const c of clients) c.drainQueue();

    // 开局
    try {
      const ack = await host.request('room_command', { command: 'start_game' });
      if (ack.type === 'error') {
        console.error(`第 ${g + 1} 局开局失败: ${ack.payload?.code}`);
        break;
      }
    } catch (err) {
      console.error(`第 ${g + 1} 局开局异常: ${err.message}`);
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
      console.error(`第 ${g + 1} 局等待 game_over 超时: ${err.message}`);
    }

    const gameDuration = Date.now() - gameStart;
    perGameDurations.push(gameDuration);

    if (gameOver) {
      gamesCompleted++;
      console.log(`第 ${g + 1} 局完成（${(gameDuration / 1000).toFixed(1)}s）`);
    } else {
      console.error(`第 ${g + 1} 局未完成，终止测试`);
      break;
    }

    // 非最后一局：返回大厅准备下一局
    if (g < MAX_GAMES - 1) {
      try {
        const ack = await host.request('room_command', { command: 'return_to_lobby' });
        if (ack.type === 'error') {
          console.error(`返回大厅失败: ${ack.payload?.code}`);
          break;
        }
      } catch (err) {
        console.error(`返回大厅异常: ${err.message}`);
        break;
      }
      // 重置客户端自动出招状态
      for (const c of clients) {
        c.drainQueue();
      }
      await sleep(200);
    }
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
    },
    dataPoints: {
      latencies: sortedLatencies,
    },
    failureCriteria: {
      p95Exceeded: p95 > P95_THRESHOLD_MS,
      serverCrashed,
      gamesIncomplete: gamesCompleted < MAX_GAMES,
    },
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

  // —— 清理 ——

  await cleanup(server, clients);

  process.exit(exitCode);
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

main().catch((err) => {
  console.error('压测脚本异常:', err);
  process.exit(1);
});
