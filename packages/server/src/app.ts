/**
 * 服务组装：db → migrate → executor → http → ws → timer runner。
 * 与 index.ts 分离以便集成测试直接创建实例。
 */
import type http from 'node:http';
import type { AddressInfo } from 'node:net';
import { openDb, closeDb, type Db } from './persistence/db.ts';
import { migrate, integrityCheck } from './persistence/migrator.ts';
import { RoomCommandExecutor } from './core/executor.ts';
import { RoomQueues } from './core/queue.ts';
import { listOpenRoomSummaries } from './core/snapshot.ts';
import { runStartupRecovery } from './core/recovery.ts';
import { TimerRunner } from './core/game/timerRunner.ts';
import { BotRunner } from './core/game/botRunner.ts';
import { LlmProvider } from './core/game/llmProvider.ts';
import { resolveLlmConfig, getLlmSettingsView, updateLlmSettings } from './core/settings.ts';
import { createHttpServer } from './gateway/http.ts';
import { WsGateway } from './gateway/ws.ts';
import type { Logger } from './boot/logger.ts';
import type { ServerConfig } from './config.ts';

export const SERVER_VERSION = '0.1.0-m1';

const DYNAMIC_TEST_PORT_MIN = 10_000;
const DYNAMIC_TEST_PORT_SPAN = 10_000;
const DYNAMIC_TEST_PORT_RETRIES = 30;
let dynamicTestPortCursor = DYNAMIC_TEST_PORT_MIN + (process.pid % DYNAMIC_TEST_PORT_SPAN);

function nextDynamicTestPort(): number {
  const port = dynamicTestPortCursor;
  dynamicTestPortCursor += 1;
  if (dynamicTestPortCursor >= DYNAMIC_TEST_PORT_MIN + DYNAMIC_TEST_PORT_SPAN) {
    dynamicTestPortCursor = DYNAMIC_TEST_PORT_MIN;
  }
  return port;
}

function isListenRetryable(err: unknown): boolean {
  const code = typeof err === 'object' && err !== null ? (err as { code?: unknown }).code : undefined;
  return code === 'EADDRINUSE' || code === 'EACCES';
}

export interface App {
  db: Db;
  server: http.Server;
  ws: WsGateway;
  executor: RoomCommandExecutor;
  timerRunner: TimerRunner;
  botRunner: BotRunner;
  /** 实际监听端口（port=0 时由系统分配） */
  port: () => number;
  listen: () => Promise<void>;
  shutdown: () => Promise<void>;
}

export function createApp(
  config: ServerConfig,
  logger: Logger,
  staticDir?: string,
  tuning?: { hostTransferDelayMs?: number; reservationSweepMs?: number },
): App {
  const db = openDb({ path: config.dbPath });
  if (!integrityCheck(db)) {
    closeDb(db);
    throw new Error('数据库完整性检查失败');
  }
  const appliedVersions = migrate(db);
  if (appliedVersions.length > 0) {
    logger.info('db_migrated', { versions: appliedVersions });
  }
  // 启动恢复（§10.4）：重置成员连接状态、校验快照、补执行到期计时器。
  // 在接受新连接之前同步完成，保证玩家重连时对局已恢复至 ACTIVE。
  runStartupRecovery(db, logger);
  let ready = true;

  const executor = new RoomCommandExecutor(db, new RoomQueues());

  // 大模型客户端：配置来自「库优先、环境变量兜底」，没配 baseUrl 时 provider 内部为 null，
  // 此时 AI 玩家无法加入，已在房间里的 llm 机器人退化为规则策略（不会卡住对局）。
  // 用 provider 而不是裸客户端：设置面板改完要立即生效，不能要求重启。
  const llm = new LlmProvider(resolveLlmConfig(db, config.llm), logger, {
    allowPrivateNetwork: config.allowPrivateLlmUpstream,
  });
  if (llm.isAvailable()) {
    logger.info('llm_enabled', { model: llm.config().model });
  }

  const server = createHttpServer({
    isReady: () => ready,
    listOpenRooms: () => listOpenRoomSummaries(db),
    staticDir,
    readLlmSettings: () => getLlmSettingsView(db, config.llm),
    readLlmConfig: () => {
      const current = resolveLlmConfig(db, config.llm);
      return {
        provider: current.provider,
        baseUrl: current.baseUrl,
        apiKey: current.apiKey,
        model: current.model,
        thinkingDepth: current.thinkingDepth,
        timeoutMs: current.timeoutMs,
      };
    },
    writeLlmSettings: (patch) => {
      // 先落库拿到合并后的配置，再换掉客户端 —— 顺序反了会在校验失败时留下脏客户端
      const next = updateLlmSettings(db, patch, config.llm);
      llm.update(next);
      return getLlmSettingsView(db, config.llm);
    },
    adminToken: config.adminToken,
    allowedOrigins: config.allowedOrigins,
    allowPrivateLlmUpstream: config.allowPrivateLlmUpstream,
  });
  // ws 与 timerRunner 互相引用：ts 变更后 ws 通知 runner 对表，runner 到期后经 ws 广播
  // （闭包延迟求值：onTimersChanged 仅在对局事件后触发，彼时 timerRunner 已初始化）
  const ws = new WsGateway({
    server,
    db,
    executor,
    logger,
    allowedOrigins: config.allowedOrigins,
    serverVersion: SERVER_VERSION,
    llmAvailable: () => llm.isAvailable(),
    onTimersChanged: () => timerRunner.notifyChanged(),
    onBotTrigger: (roomId) => botRunner.trigger(roomId),
    ...(tuning?.hostTransferDelayMs !== undefined
      ? { hostTransferDelayMs: tuning.hostTransferDelayMs }
      : {}),
    ...(tuning?.reservationSweepMs !== undefined
      ? { reservationSweepMs: tuning.reservationSweepMs }
      : {}),
  });
  const timerRunner = new TimerRunner(db, executor, (roomId, outcome) => {
    try {
      ws.applyGameOutcome(roomId, outcome);
    } catch (err) {
      logger.error('timer_outcome_broadcast_failed', { roomId, message: (err as Error).message });
    }
  });
  // 启动即对表：崩溃重启后自然补执行到期计时器（§10.4）
  timerRunner.start();

  // 机器人驱动器：纯函数 reduce 不会主动通知"轮到你了"，
  // 所以由 ws.applyGameOutcome 每次对局变化后 trigger 一次（见上方 onBotTrigger）。
  const botRunner = new BotRunner({
    db,
    executor,
    logger,
    // 每次决策前问一次 provider，而不是构造时抓一个引用：设置改了就用新的
    llm: () => llm.current(),
    onOutcome: (roomId, outcome) => {
      try {
        ws.applyGameOutcome(roomId, outcome);
      } catch (err) {
        logger.error('bot_outcome_broadcast_failed', { roomId, message: (err as Error).message });
      }
    },
  });

  let shutdownStarted = false;

  return {
    db,
    server,
    ws,
    executor,
    timerRunner,
    botRunner,
    port: () => (server.address() as AddressInfo).port,
    listen: () =>
      new Promise<void>((resolvePromise, reject) => {
        const listenOnPort = (port: number, attempt: number): void => {
          const onError = (err: Error): void => {
            server.off('listening', onListening);
            if (config.port === 0 && attempt < DYNAMIC_TEST_PORT_RETRIES && isListenRetryable(err)) {
              listenOnPort(nextDynamicTestPort(), attempt + 1);
              return;
            }
            reject(err);
          };
          const onListening = (): void => {
            server.off('error', onError);
            resolvePromise();
          };
          server.once('error', onError);
          server.once('listening', onListening);
          server.listen(port, config.host);
        };
        listenOnPort(config.port === 0 ? nextDynamicTestPort() : config.port, 0);
      }),
    shutdown: async () => {
      if (shutdownStarted) return;
      shutdownStarted = true;
      ready = false;
      logger.info('shutdown_started');
      timerRunner.stop();
      // 停在 ws.close() 之前：驱动器还在跑时不该再有新动作落库
      botRunner.stop();
      await ws.close();
      await new Promise<void>((resolvePromise) => {
        server.close(() => resolvePromise());
        // 兜底：强制断开残留 keep-alive 连接
        server.closeAllConnections?.();
      });
      closeDb(db);
      logger.info('shutdown_completed');
    },
  };
}
