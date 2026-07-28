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
import { runStartupRecovery } from './core/recovery.ts';
import { TimerRunner } from './core/game/timerRunner.ts';
import { createHttpServer } from './gateway/http.ts';
import { WsGateway } from './gateway/ws.ts';
import type { Logger } from './boot/logger.ts';
import type { ServerConfig } from './config.ts';

export const SERVER_VERSION = '0.1.0-m1';

export interface App {
  db: Db;
  server: http.Server;
  ws: WsGateway;
  executor: RoomCommandExecutor;
  timerRunner: TimerRunner;
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
  const server = createHttpServer({ isReady: () => ready, staticDir });
  // ws 与 timerRunner 互相引用：ts 变更后 ws 通知 runner 对表，runner 到期后经 ws 广播
  // （闭包延迟求值：onTimersChanged 仅在对局事件后触发，彼时 timerRunner 已初始化）
  const ws = new WsGateway({
    server,
    db,
    executor,
    logger,
    allowedOrigins: config.allowedOrigins,
    serverVersion: SERVER_VERSION,
    onTimersChanged: () => timerRunner.notifyChanged(),
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

  let shutdownStarted = false;

  return {
    db,
    server,
    ws,
    executor,
    timerRunner,
    port: () => (server.address() as AddressInfo).port,
    listen: () =>
      new Promise<void>((resolvePromise, reject) => {
        server.once('error', reject);
        server.listen(config.port, config.host, () => resolvePromise());
      }),
    shutdown: async () => {
      if (shutdownStarted) return;
      shutdownStarted = true;
      ready = false;
      logger.info('shutdown_started');
      timerRunner.stop();
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
