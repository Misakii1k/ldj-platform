/**
 * WebSocket 接入（SPEC §9）：
 * Origin 校验 → welcome → 消息 envelope 校验 → 路由到命令执行链 → ack → 广播。
 * M2：join/resume/leave/room_command/chat_send/resync 全链路 + 会话接管 + 断线保留。
 * M3：game_action + 三类视角 game_state 定向下发 + 保留期扫描（§6.7）。
 */
import type http from 'node:http';
import { randomUUID } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import {
  clientEnvelopeSchema,
  createRoomPayloadSchema,
  joinRoomPayloadSchema,
  resumeRoomPayloadSchema,
  leaveRoomPayloadSchema,
  roomCommandPayloadSchema,
  chatSendPayloadSchema,
  resyncPayloadSchema,
  makeErrorPayload,
  MAX_MESSAGE_BYTES,
  PROTOCOL_VERSION,
  type ChatMessageView,
  type ErrorCode,
  type ServerEnvelope,
  type ServerMessageType,
} from '@ldj/shared';
import type { Logger } from '../boot/logger.ts';
import type { Db } from '../persistence/db.ts';
import { RoomCommandExecutor, CommandError } from '../core/executor.ts';
import { prepareCreateRoom, applyCreateRoom } from '../core/commands/createRoom.ts';
import { applyJoinRoom } from '../core/commands/joinRoom.ts';
import { applyResumeRoom } from '../core/commands/resumeRoom.ts';
import { applyLeaveRoom } from '../core/commands/leaveRoom.ts';
import { applyRoomCommand } from '../core/commands/roomCommand.ts';
import { applyChatSend, insertSystemChat, listChatAfter } from '../core/commands/chat.ts';
import {
  applyMarkDisconnected,
  applyAutoTransferHost,
  applyExpireReservations,
} from '../core/commands/presence.ts';
import { applyGameAction, type GameActionOutcome } from '../core/game/session.ts';
import { autoStartGame } from '../core/game/session.ts';
import { getGameModule, getDefaultRuleset, DEFAULT_GAME_ID } from '../core/game/registry.ts';
import { isVersionedEventEnvelope } from '../core/game/eventEnvelope.ts';
import { buildGameStatePayload, type GameStatePayload } from '../core/game/views.ts';
import { findRoomIdByCode } from '../core/roomLookup.ts';
import { buildRoomSnapshot } from '../core/snapshot.ts';
import { RateLimiter, DEFAULT_RULES } from './rateLimit.ts';

export interface WsGatewayDeps {
  server: http.Server;
  db: Db;
  executor: RoomCommandExecutor;
  logger: Logger;
  /** 额外允许的 Origin（开发模式） */
  allowedOrigins: string[];
  serverVersion: string;
  /** 房主断线自动转让延迟（FR-HOST-005，默认 30 秒；测试可缩短） */
  hostTransferDelayMs?: number;
  /** timers 表变更后回调（app 层接 TimerRunner.notifyChanged） */
  onTimersChanged?: () => void;
  /** 席位保留期扫描间隔（§6.7，默认 30 秒；测试可缩短） */
  reservationSweepMs?: number;
  /**
   * 大模型是否已配置（app 层接 LlmProvider.isAvailable）。
   * false 时房主添加 AI 玩家会被拒绝并说明原因，而不是加进来每步都回落规则策略。
   * 之所以是函数而不是布尔：设置面板改完就生效，静态值会让已连着的客户端一直用旧判断。
   */
  llmAvailable?: () => boolean;
  /**
   * 对局状态变化后触发机器人推进（app 层接 BotRunner.trigger）。
   * 纯函数 reduce 不能主动通知"轮到你了"，所以每次落库后都要问一遍。
   */
  onBotTrigger?: (roomId: string) => void;
  /** join/resume 限流配额覆盖（E2E/CI 放宽用；不设则用 DEFAULT_RULES.joinAttempt） */
  joinLimitMax?: number;
}

interface ConnectionState {
  connectionId: string;
  ip: string;
  roomId: string | null;
  playerId: string | null;
}

/** WebSocket 应用层关闭码 */
export const WS_CLOSE_KICKED = 4001;
export const WS_CLOSE_SESSION_REPLACED = 4002;
export const WS_CLOSE_ROOM_CLOSED = 4003;

const DEFAULT_HOST_TRANSFER_DELAY_MS = 30_000;
const DEFAULT_RESERVATION_SWEEP_MS = 30_000;
/** 全员就绪后自动开局倒计时（秒） */
export const AUTO_START_DELAY_MS = 5_000;
/** D3 重连只对最多 50 个房间序号的小缺口回放公开游戏事件。 */
export const MAX_PUBLIC_GAME_EVENT_REPLAY_GAP = 50;

interface GameResumeIdentity {
  readonly sessionId: string;
  readonly viewVersion: number;
}

/**
 * Origin 校验（SPEC §9.5）：
 * - 无 Origin（非浏览器客户端）放行；浏览器 WebSocket 总会携带 Origin。
 * - Origin 主机与请求 Host 主机一致放行（局域网同源访问）。
 * - 否则必须命中显式配置的允许列表。
 */
export function isOriginAllowed(
  origin: string | undefined,
  hostHeader: string | undefined,
  allowedOrigins: string[],
): boolean {
  if (origin === undefined) return true;
  try {
    const originUrl = new URL(origin);
    if (hostHeader !== undefined && originUrl.host === hostHeader) return true;
  } catch {
    return false;
  }
  return allowedOrigins.includes(origin);
}

export class WsGateway {
  readonly #wss: WebSocketServer;
  readonly #deps: WsGatewayDeps;
  readonly #states = new WeakMap<WebSocket, ConnectionState>();
  /** roomId → 订阅该房间广播的连接 */
  readonly #roomSubscribers = new Map<string, Set<WebSocket>>();
  /** `${roomId}/${playerId}` → 当前活跃连接（会话接管，FR-ID-004） */
  readonly #playerSockets = new Map<string, WebSocket>();
  /** roomId → 房主断线自动转让计时器 */
  readonly #hostTransferTimers = new Map<string, ReturnType<typeof setTimeout>>();
  /** roomId → 全员就绪自动开局计时器 */
  readonly #autoStartTimers = new Map<string, ReturnType<typeof setTimeout>>();
  readonly #messageLimiter = new RateLimiter(DEFAULT_RULES.messagesPerConnection);
  readonly #chatLimiter = new RateLimiter(DEFAULT_RULES.chat);
  readonly #gameActionLimiter = new RateLimiter(DEFAULT_RULES.gameAction);
  readonly #joinLimiter: RateLimiter;
  readonly #reservationSweeper: ReturnType<typeof setInterval>;
  #sweeping = false;

  constructor(deps: WsGatewayDeps) {
    this.#deps = deps;
    // join/resume 限流配额覆盖（E2E/CI 放宽用；不设则用 DEFAULT_RULES.joinAttempt）
    const joinMax = deps.joinLimitMax ?? DEFAULT_RULES.joinAttempt.max;
    this.#joinLimiter = new RateLimiter(
      joinMax === DEFAULT_RULES.joinAttempt.max
        ? DEFAULT_RULES.joinAttempt
        : { windowMs: DEFAULT_RULES.joinAttempt.windowMs, max: joinMax },
    );
    this.#deps = deps;
    this.#wss = new WebSocketServer({
      server: deps.server,
      maxPayload: MAX_MESSAGE_BYTES,
      verifyClient: (info: { origin?: string; req: http.IncomingMessage }, done) => {
        const ok = isOriginAllowed(
          info.origin === '' ? undefined : info.origin,
          info.req.headers.host,
          deps.allowedOrigins,
        );
        if (!ok) {
          deps.logger.warn('ws_origin_rejected', { origin: info.origin });
        }
        done(ok, 403, 'Forbidden');
      },
    });
    this.#wss.on('connection', (socket, req) => this.#onConnection(socket, req));

    // 席位保留期扫描（§6.7）：到期成员 EXPIRED + 对局内投递 player_forfeited
    this.#reservationSweeper = setInterval(() => {
      void this.#sweepReservations();
    }, deps.reservationSweepMs ?? DEFAULT_RESERVATION_SWEEP_MS);
    this.#reservationSweeper.unref?.();
  }

  async #sweepReservations(): Promise<void> {
    if (this.#sweeping) return;
    this.#sweeping = true;
    try {
      const rooms = this.#deps.db
        .prepare(
          `SELECT DISTINCT room_id FROM room_members
           WHERE connection_status = 'DISCONNECTED_RESERVED'
             AND reserved_until IS NOT NULL AND reserved_until < ?`,
        )
        .all(Date.now()) as { room_id: string }[];
      for (const { room_id: roomId } of rooms) {
        try {
          const result = await this.#deps.executor.executeInternal({
            roomId,
            handler: (tx) => applyExpireReservations(tx, roomId),
          });
          if (!result) continue;
          this.broadcastToRoom(roomId, 'room_snapshot', result.outcome.snapshot, result.roomSeq);
          this.#broadcastChat(roomId, result.outcome.sysChats);
          if (result.outcome.forfeit) {
            this.applyGameOutcome(roomId, result.outcome.forfeit);
          }
          this.#checkAutoStart(roomId);
        } catch (err) {
          this.#deps.logger.error('reservation_sweep_failed', {
            roomId,
            message: (err as Error).message,
          });
        }
      }
    } finally {
      this.#sweeping = false;
    }
  }

  #onConnection(socket: WebSocket, req: http.IncomingMessage): void {
    const state: ConnectionState = {
      connectionId: `c_${randomUUID()}`,
      ip: req.socket.remoteAddress ?? 'unknown',
      roomId: null,
      playerId: null,
    };
    this.#states.set(socket, state);
    const log = this.#deps.logger.child({ connectionId: state.connectionId });
    log.info('ws_connected');

    this.#send(socket, 'welcome', {
      protocolVersion: PROTOCOL_VERSION,
      connectionId: state.connectionId,
      serverVersion: this.#deps.serverVersion,
      // 能力位：没配大模型时客户端不显示"加 AI 玩家"按钮
      llmAvailable: this.#llmAvailable(),
    });

    socket.on('message', (data) => {
      void this.#onMessage(socket, state, log, data as Buffer);
    });
    socket.on('close', () => {
      void this.#onClose(socket, state, log);
    });
    socket.on('error', (err) => {
      log.warn('ws_error', { message: (err as Error).message });
    });
  }

  /** 断线处理（FR-REC-004、FR-HOST-005） */
  async #onClose(socket: WebSocket, state: ConnectionState, log: Logger): Promise<void> {
    log.info('ws_closed');
    const { roomId, playerId } = state;
    if (roomId === null) return;
    this.#roomSubscribers.get(roomId)?.delete(socket);
    if (playerId === null) return;

    const key = `${roomId}/${playerId}`;
    // 会话已被新连接接管：旧连接关闭不影响成员在场状态
    if (this.#playerSockets.get(key) !== socket) return;
    this.#playerSockets.delete(key);

    try {
      const result = await this.#deps.executor.executeInternal({
        roomId,
        handler: (tx) => applyMarkDisconnected(tx, roomId, playerId),
      });
      if (!result) return;
      this.broadcastToRoom(roomId, 'room_snapshot', result.outcome.snapshot, result.roomSeq);
      this.#checkAutoStart(roomId);
      if (result.outcome.wasHost) {
        this.#scheduleHostTransfer(roomId, playerId);
      }
    } catch (err) {
      log.error('disconnect_mark_failed', { message: (err as Error).message });
    }
  }

  /** 房主断线 → 延迟自动转让（FR-HOST-005）；房主及时回归则事务内自动放弃 */
  #scheduleHostTransfer(roomId: string, disconnectedHostId: string): void {
    const existing = this.#hostTransferTimers.get(roomId);
    if (existing) clearTimeout(existing);
    const delay = this.#deps.hostTransferDelayMs ?? DEFAULT_HOST_TRANSFER_DELAY_MS;
    const timer = setTimeout(() => {
      this.#hostTransferTimers.delete(roomId);
      void this.#deps.executor
        .executeInternal({
          roomId,
          handler: (tx) => applyAutoTransferHost(tx, roomId, disconnectedHostId),
        })
        .then((result) => {
          if (result) {
            this.broadcastToRoom(roomId, 'room_snapshot', result.outcome.snapshot, result.roomSeq);
            this.#checkAutoStart(roomId);
          }
        })
        .catch((err: Error) => {
          this.#deps.logger.error('host_transfer_failed', { message: err.message });
        });
    }, delay);
    this.#hostTransferTimers.set(roomId, timer);
  }

  /** 取消房间的自动开局倒计时 */
  #clearAutoStart(roomId: string): void {
    const timer = this.#autoStartTimers.get(roomId);
    if (timer) {
      clearTimeout(timer);
      this.#autoStartTimers.delete(roomId);
    }
  }

  /**
   * 全员就绪自动开局（房间级"准备"机制）：
   * LOBBY/POST_GAME 且在线玩家数达标且全部就绪 → 启动 5 秒倒计时自动开局；
   * 期间条件被破坏（取消准备/加入离开/配置变更/开局了）→ 取消倒计时。
   * 每次广播 room_snapshot 后调用，以新快照为准做幂等判定。
   */
  #checkAutoStart(roomId: string): void {
    const row = this.#deps.db
      .prepare(
        `SELECT r.status AS status, r.game_id AS game_id,
                COUNT(CASE WHEN m.seat_role = 'player' AND m.connection_status = 'CONNECTED' AND m.ready = 1 THEN 1 END) AS ready_online,
                COUNT(CASE WHEN m.seat_role = 'player' AND m.connection_status = 'CONNECTED' THEN 1 END) AS online
         FROM rooms r
         LEFT JOIN room_members m ON m.room_id = r.id
         WHERE r.id = ?`,
      )
      .get(roomId) as
      | { status: string; game_id: string | null; ready_online: number; online: number }
      | undefined;
    if (!row) {
      this.#clearAutoStart(roomId);
      return;
    }
    if (row.status !== 'LOBBY' && row.status !== 'POST_GAME') {
      this.#clearAutoStart(roomId);
      return;
    }
    const moduleId = row.game_id ?? DEFAULT_GAME_ID;
    const module = getGameModule(moduleId, getDefaultRuleset(moduleId));
    if (
      !module ||
      row.online < module.manifest.minPlayers ||
      row.online > module.manifest.maxPlayers ||
      row.ready_online !== row.online ||
      row.online === 0
    ) {
      this.#clearAutoStart(roomId);
      return;
    }
    if (this.#autoStartTimers.has(roomId)) return; // 已在倒计时
    const timer = setTimeout(() => {
      this.#autoStartTimers.delete(roomId);
      void this.#deps.executor
        .executeInternal({
          roomId,
          handler: (tx) => autoStartGame(tx, roomId),
        })
        .then((result) => {
          if (!result || result.outcome === null) return;
          this.broadcastToRoom(
            roomId,
            'room_snapshot',
            buildRoomSnapshot(this.#deps.db, roomId),
            result.roomSeq,
          );
          this.applyGameOutcome(roomId, result.outcome.begin);
        })
        .catch((err: Error) => {
          this.#deps.logger.error('auto_start_failed', { message: err.message });
        });
    }, AUTO_START_DELAY_MS);
    this.#autoStartTimers.set(roomId, timer);
  }

  async #onMessage(
    socket: WebSocket,
    state: ConnectionState,
    log: Logger,
    data: Buffer,
  ): Promise<void> {
    const limit = this.#messageLimiter.tryAcquire(state.connectionId);
    if (!limit.ok) {
      this.#sendError(socket, undefined, 'RATE_LIMITED', { retryAfterMs: limit.retryAfterMs });
      return;
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(data.toString('utf8'));
    } catch {
      this.#sendError(socket, undefined, 'INVALID_MESSAGE');
      return;
    }

    const parsed = clientEnvelopeSchema.safeParse(parsedJson);
    if (!parsed.success) {
      // 协议版本不符给出更精确的错误码
      const maybeV = (parsedJson as { v?: unknown } | null)?.v;
      const code: ErrorCode =
        typeof maybeV === 'number' && maybeV !== PROTOCOL_VERSION
          ? 'UNSUPPORTED_PROTOCOL'
          : 'INVALID_MESSAGE';
      this.#sendError(socket, undefined, code);
      return;
    }
    const envelope = parsed.data;
    log.debug('ws_message', { type: envelope.type, requestId: envelope.requestId });

    try {
      switch (envelope.type) {
        case 'create_room':
          await this.#handleCreateRoom(socket, state, envelope.requestId, envelope.payload);
          break;
        case 'join_room':
          await this.#handleJoinRoom(socket, state, envelope.requestId, envelope.payload);
          break;
        case 'resume_room':
          await this.#handleResumeRoom(socket, state, envelope.requestId, envelope.payload);
          break;
        case 'leave_room':
          await this.#handleLeaveRoom(socket, state, envelope.requestId, envelope.payload);
          break;
        case 'room_command':
          await this.#handleRoomCommand(
            socket,
            state,
            envelope.requestId,
            envelope.payload,
            envelope.expectedSeq,
          );
          break;
        case 'game_action':
          await this.#handleGameAction(
            socket,
            state,
            envelope.requestId,
            envelope.payload,
            envelope.expectedSeq,
          );
          break;
        case 'chat_send':
          await this.#handleChatSend(socket, state, envelope.requestId, envelope.payload);
          break;
        case 'resync':
          this.#handleResync(socket, state, envelope.requestId, envelope.payload);
          break;
        default:
          this.#sendError(socket, envelope.requestId, 'ACTION_NOT_ALLOWED');
      }
    } catch (err) {
      if (err instanceof CommandError) {
        // STALE_CLIENT_STATE 附带当前房间序号，客户端据此 resync（§9.4）
        const currentSeq =
          err.code === 'STALE_CLIENT_STATE' && state.roomId !== null
            ? this.#currentRoomSeq(state.roomId)
            : undefined;
        this.#sendError(socket, envelope.requestId, err.code, {
          message: err.message,
          ...(currentSeq !== undefined ? { currentSeq } : {}),
        });
      } else {
        log.error('command_failed', {
          type: envelope.type,
          requestId: envelope.requestId,
          message: (err as Error).message,
        });
        this.#sendError(socket, envelope.requestId, 'INTERNAL_ERROR');
      }
    }
  }

  /** 大模型当前是否可用；deps 没给（老测试夹具）按未配置处理 */
  #llmAvailable(): boolean {
    return this.#deps.llmAvailable?.() === true;
  }

  #currentRoomSeq(roomId: string): number | undefined {
    const row = this.#deps.db.prepare('SELECT seq FROM rooms WHERE id = ?').get(roomId) as
      | { seq: number }
      | undefined;
    return row?.seq;
  }

  /** 连接与房间/玩家会话绑定；接管旧连接（FR-ID-004） */
  #bindPlayer(socket: WebSocket, state: ConnectionState, roomId: string, playerId: string): void {
    const key = `${roomId}/${playerId}`;
    const old = this.#playerSockets.get(key);
    if (old !== undefined && old !== socket && old.readyState === WebSocket.OPEN) {
      this.#send(old, 'session_replaced', makeErrorPayload('SESSION_REPLACED'));
      // 先解除旧连接的会话归属，避免其 close 回调把成员标记为断线
      const oldState = this.#states.get(old);
      if (oldState) {
        oldState.roomId = null;
        oldState.playerId = null;
      }
      this.#roomSubscribers.get(roomId)?.delete(old);
      old.close(WS_CLOSE_SESSION_REPLACED, 'session replaced');
    }
    this.#playerSockets.set(key, socket);
    state.roomId = roomId;
    state.playerId = playerId;
    let subs = this.#roomSubscribers.get(roomId);
    if (!subs) {
      subs = new Set();
      this.#roomSubscribers.set(roomId, subs);
    }
    subs.add(socket);
  }

  /** 解绑连接与房间（leave / kick / close_room 后调用） */
  #unbindPlayer(socket: WebSocket, state: ConnectionState): void {
    if (state.roomId !== null && state.playerId !== null) {
      const key = `${state.roomId}/${state.playerId}`;
      if (this.#playerSockets.get(key) === socket) this.#playerSockets.delete(key);
    }
    if (state.roomId !== null) {
      this.#roomSubscribers.get(state.roomId)?.delete(socket);
    }
    state.roomId = null;
    state.playerId = null;
  }

  async #handleCreateRoom(
    socket: WebSocket,
    state: ConnectionState,
    requestId: string,
    rawPayload: unknown,
  ): Promise<void> {
    const payload = createRoomPayloadSchema.safeParse(rawPayload);
    if (!payload.success) {
      this.#sendError(socket, requestId, 'INVALID_MESSAGE');
      return;
    }

    const { roomId } = prepareCreateRoom();
    const result = await this.#deps.executor.executeCreate({
      roomId,
      actorScope: `conn:${state.connectionId}`,
      requestId,
      handler: (tx) => applyCreateRoom(tx, roomId, payload.data),
    });

    this.#bindPlayer(socket, state, roomId, result.outcome.playerId);

    // 事务已提交 → ack（含一次性 resumeToken）→ 广播快照
    this.#send(socket, 'ack', {
      roomId: result.outcome.roomId,
      roomCode: result.outcome.roomCode,
      playerId: result.outcome.playerId,
      resumeToken: result.outcome.resumeToken,
    }, { requestId, roomSeq: result.roomSeq });

    this.broadcastToRoom(roomId, 'room_snapshot', result.outcome.snapshot, result.roomSeq);
    this.#checkAutoStart(roomId);
  }

  async #handleJoinRoom(
    socket: WebSocket,
    state: ConnectionState,
    requestId: string,
    rawPayload: unknown,
  ): Promise<void> {
    // 加入/密码尝试限流（SPEC §9.5：10 次/分钟/IP）
    const limit = this.#joinLimiter.tryAcquire(state.ip);
    if (!limit.ok) {
      this.#sendError(socket, requestId, 'RATE_LIMITED', { retryAfterMs: limit.retryAfterMs });
      return;
    }
    const payload = joinRoomPayloadSchema.safeParse(rawPayload);
    if (!payload.success) {
      this.#sendError(socket, requestId, 'INVALID_MESSAGE');
      return;
    }
    const roomId = findRoomIdByCode(this.#deps.db, payload.data.roomCode);
    if (roomId === null) {
      this.#sendError(socket, requestId, 'ROOM_NOT_FOUND');
      return;
    }

    const result = await this.#deps.executor.executeOnRoom({
      roomId,
      actorScope: `conn:${state.connectionId}`,
      requestId,
      handler: (tx) => {
        const joined = applyJoinRoom(tx, roomId, payload.data);
        const sysChat = insertSystemChat(tx, roomId, `${payload.data.nickname} 加入了房间`);
        return { ...joined, sysChat };
      },
    });

    this.#bindPlayer(socket, state, roomId, result.outcome.playerId);

    this.#send(socket, 'ack', {
      roomId: result.outcome.roomId,
      roomCode: result.outcome.roomCode,
      playerId: result.outcome.playerId,
      seatRole: result.outcome.seatRole,
      resumeToken: result.outcome.resumeToken,
    }, { requestId, roomSeq: result.roomSeq });

    if (!result.replayed) {
      this.broadcastToRoom(roomId, 'room_snapshot', result.outcome.snapshot, result.roomSeq);
      this.#broadcastChat(roomId, [result.outcome.sysChat]);
    }
    this.#checkAutoStart(roomId);

    // Late joiners during an active game need their current player/spectator view immediately;
    // otherwise the client can enter the room but stay stuck on the game loading screen until
    // the next game event happens. 附带本次 join 提交后的房间序号作为基线。
    this.#sendCurrentGameState(socket, roomId, result.outcome.playerId, requestId, result.roomSeq);
  }

  async #handleResumeRoom(
    socket: WebSocket,
    state: ConnectionState,
    requestId: string,
    rawPayload: unknown,
  ): Promise<void> {
    const limit = this.#joinLimiter.tryAcquire(state.ip);
    if (!limit.ok) {
      this.#sendError(socket, requestId, 'RATE_LIMITED', { retryAfterMs: limit.retryAfterMs });
      return;
    }
    const payload = resumeRoomPayloadSchema.safeParse(rawPayload);
    if (!payload.success) {
      this.#sendError(socket, requestId, 'INVALID_MESSAGE');
      return;
    }
    const roomId = findRoomIdByCode(this.#deps.db, payload.data.roomCode);
    if (roomId === null) {
      this.#sendError(socket, requestId, 'ROOM_NOT_FOUND');
      return;
    }

    const result = await this.#deps.executor.executeOnRoom({
      roomId,
      actorScope: `player:${payload.data.playerId}`,
      requestId,
      handler: (tx) => applyResumeRoom(tx, roomId, payload.data),
    });

    // 房主回归：取消待执行的自动转让
    const timer = this.#hostTransferTimers.get(roomId);
    if (timer) {
      clearTimeout(timer);
      this.#hostTransferTimers.delete(roomId);
    }

    this.#bindPlayer(socket, state, roomId, result.outcome.playerId);

    this.#send(socket, 'ack', {
      roomId: result.outcome.roomId,
      roomCode: result.outcome.roomCode,
      playerId: result.outcome.playerId,
      seatRole: result.outcome.seatRole,
    }, { requestId, roomSeq: result.roomSeq });

    // 房间级广播：成员回到 CONNECTED 对所有订阅者可见（FR-REC-004）
    this.broadcastToRoom(roomId, 'room_snapshot', result.outcome.snapshot, result.roomSeq);
    // 恢复者补发统一基线：权威快照 → 可选公开事件增量 → 最新个人/观战视角 → 聊天增量。
    // 快照已随房间广播下发，这里不再重复发送。
    this.#sendResyncBundle(socket, state, requestId, {
      ...payload.data,
      game: payload.data.game ?? null,
    }, { includeSnapshot: false });
  }

  async #handleLeaveRoom(
    socket: WebSocket,
    state: ConnectionState,
    requestId: string,
    rawPayload: unknown,
  ): Promise<void> {
    const payload = leaveRoomPayloadSchema.safeParse(rawPayload ?? {});
    if (!payload.success) {
      this.#sendError(socket, requestId, 'INVALID_MESSAGE');
      return;
    }
    const { roomId, playerId } = state;
    if (roomId === null || playerId === null) {
      this.#sendError(socket, requestId, 'ACTION_NOT_ALLOWED');
      return;
    }

    const result = await this.#deps.executor.executeOnRoom({
      roomId,
      actorScope: `player:${playerId}`,
      requestId,
      handler: (tx) => {
        const nickname = this.#nicknameOf(roomId, playerId);
        const left = applyLeaveRoom(tx, roomId, playerId);
        const sysChat = insertSystemChat(tx, roomId, `${nickname ?? '玩家'} 离开了房间`);
        return { ...left, sysChat };
      },
    });

    this.#send(socket, 'ack', { left: true, mode: result.outcome.mode }, { requestId, roomSeq: result.roomSeq });
    this.#unbindPlayer(socket, state);

    if (!result.replayed) {
      this.broadcastToRoom(roomId, 'room_snapshot', result.outcome.snapshot, result.roomSeq);
      this.#broadcastChat(roomId, [result.outcome.sysChat]);
    }
    this.#checkAutoStart(roomId);
  }

  async #handleRoomCommand(
    socket: WebSocket,
    state: ConnectionState,
    requestId: string,
    rawPayload: unknown,
    expectedSeq: number | undefined,
  ): Promise<void> {
    const payload = roomCommandPayloadSchema.safeParse(rawPayload);
    if (!payload.success) {
      this.#sendError(socket, requestId, 'INVALID_MESSAGE');
      return;
    }
    const { roomId, playerId } = state;
    if (roomId === null || playerId === null) {
      this.#sendError(socket, requestId, 'ACTION_NOT_ALLOWED');
      return;
    }

    const result = await this.#deps.executor.executeOnRoom({
      roomId,
      actorScope: `player:${playerId}`,
      requestId,
      handler: (tx) => {
        // 状态依赖型命令的乐观并发检查（§9.4）：expectedSeq 必须等于当前 seq
        if (expectedSeq !== undefined && expectedSeq !== tx.roomSeq - 1) {
          throw new CommandError('STALE_CLIENT_STATE');
        }
        const kickedNickname =
          payload.data.command === 'kick_player'
            ? this.#nicknameOf(roomId, payload.data.targetPlayerId)
            : null;
        const outcome = applyRoomCommand(tx, roomId, playerId, payload.data, {
          llmAvailable: this.#llmAvailable(),
        });
        let sysChat: ChatMessageView | null = null;
        if (outcome.kickedPlayerId !== undefined) {
          sysChat = insertSystemChat(tx, roomId, `${kickedNickname ?? '玩家'} 被移出房间`);
        } else if (outcome.bot) {
          // 加/减机器人也发一条系统提示：房间里的人需要知道多了个"人"
          const verb = outcome.bot.kind === null ? '离开了房间' : '加入了房间';
          sysChat = insertSystemChat(tx, roomId, `${outcome.bot.nickname} ${verb}`);
        }
        return { ...outcome, sysChat };
      },
    });

    this.#send(socket, 'ack', { command: result.outcome.command }, { requestId, roomSeq: result.roomSeq });
    if (result.replayed) return;

    // 被踢者：先移出订阅，再广播新快照，最后断开（FR-HOST-002）
    if (result.outcome.kickedPlayerId !== undefined) {
      const kickedKey = `${roomId}/${result.outcome.kickedPlayerId}`;
      const kickedSocket = this.#playerSockets.get(kickedKey);
      if (kickedSocket) {
        this.#playerSockets.delete(kickedKey);
        const kickedState = this.#states.get(kickedSocket);
        if (kickedState) {
          kickedState.roomId = null;
          kickedState.playerId = null;
        }
        this.#roomSubscribers.get(roomId)?.delete(kickedSocket);
        kickedSocket.close(WS_CLOSE_KICKED, 'kicked');
      }
    }

    this.broadcastToRoom(roomId, 'room_snapshot', result.outcome.snapshot, result.roomSeq);
    this.#checkAutoStart(roomId);
    if (result.outcome.sysChat) {
      this.#broadcastChat(roomId, [result.outcome.sysChat]);
    }

    // 开局（FR-HOST-001）：定向下发三类视角 + begin 产生的事件/系统消息/计时器对表
    if (result.outcome.gameStarted) {
      this.applyGameOutcome(roomId, result.outcome.gameStarted.begin);
    }
    // 终止（FR-HOST-002）：内核级 ABORTED，广播终局视角与系统提示
    if (result.outcome.gameAborted) {
      this.broadcastGameViews(roomId);
      this.#broadcastChat(roomId, [result.outcome.gameAborted.sysChat]);
      this.#deps.onTimersChanged?.();
    }

    // 关闭房间：广播后断开所有订阅连接
    if (result.outcome.closed === true) {
      const timer = this.#hostTransferTimers.get(roomId);
      if (timer) {
        clearTimeout(timer);
        this.#hostTransferTimers.delete(roomId);
      }
      this.#clearAutoStart(roomId);
      const subs = this.#roomSubscribers.get(roomId);
      if (subs) {
        for (const sub of [...subs]) {
          const subState = this.#states.get(sub);
          if (subState) this.#unbindPlayer(sub, subState);
          sub.close(WS_CLOSE_ROOM_CLOSED, 'room closed');
        }
        this.#roomSubscribers.delete(roomId);
      }
    }
  }

  /** game_action（§9.2）：透传给模块 reduce；成功后定向广播各自视角 */
  async #handleGameAction(
    socket: WebSocket,
    state: ConnectionState,
    requestId: string,
    rawPayload: unknown,
    expectedSeq: number | undefined,
  ): Promise<void> {
    const { roomId, playerId } = state;
    if (roomId === null || playerId === null) {
      this.#sendError(socket, requestId, 'ACTION_NOT_ALLOWED');
      return;
    }

    const limit = this.#gameActionLimiter.tryAcquire(`${roomId}/${playerId}`);
    if (!limit.ok) {
      this.#sendError(socket, requestId, 'RATE_LIMITED', { retryAfterMs: limit.retryAfterMs });
      return;
    }

    const result = await this.#deps.executor.executeOnRoom({
      roomId,
      actorScope: `player:${playerId}`,
      requestId,
      receiptOutcome: (outcome: GameActionOutcome) => ({
        ...outcome,
        publicEvents: [],
        privateEvents: [],
        events: [],
        systemChats: [],
      }),
      handler: (tx) => {
        // receipt 查询由 executor 在进入 handler 前完成，因此相同 requestId 的重试
        // 即使携带过期 expectedSeq，也会优先返回第一次已提交的 ACK。
        if (expectedSeq !== undefined && expectedSeq !== tx.roomSeq - 1) {
          throw new CommandError('STALE_CLIENT_STATE');
        }
        return applyGameAction(tx, roomId, playerId, rawPayload, requestId);
      },
    });

    this.#send(socket, 'ack', { seq: result.outcome.seq, finished: result.outcome.finished }, {
      requestId,
      roomSeq: result.roomSeq,
    });
    if (result.replayed) return;
    this.applyGameOutcome(roomId, result.outcome);
  }
  /**
   * 一次已落库的对局变更 → 对外同步（也供 TimerRunner 回调复用）：
   * 各订阅者定向 game_state + 公开 game_event + 系统聊天 +
   * 终局时房间快照（IN_GAME → POST_GAME）+ 计时器对表。
   */
  applyGameOutcome(roomId: string, outcome: GameActionOutcome): void {
    this.broadcastGameViews(roomId, outcome.roomSeq);
    this.#broadcastGameEvents(roomId, outcome);
    if (outcome.systemChats.length > 0) {
      this.#broadcastChat(roomId, outcome.systemChats);
    }
    if (outcome.finished) {
      const snapshot = buildRoomSnapshot(this.#deps.db, roomId);
      this.broadcastToRoom(roomId, 'room_snapshot', snapshot, snapshot.seq);
      this.#checkAutoStart(roomId);
    }
    if (outcome.timersChanged) {
      this.#deps.onTimersChanged?.();
    }
    // 机器人推进：本局还没结束就问一遍"有没有机器人该动了"。
    // 放在广播之后，真人先看到刚发生的事，再看到机器人的响应。
    if (!outcome.finished && !outcome.aborted) {
      this.#deps.onBotTrigger?.(roomId);
    }
  }

  /**
   * 按接收者分流版本化事件：公开事件对全房间可见，私有事件只发送 event 本体给目标玩家。
   * recipients 永不进入 wire；观战者和非目标玩家只会看到公开事件。
   */
  #broadcastGameEvents(roomId: string, outcome: GameActionOutcome): void {
    const subs = this.#roomSubscribers.get(roomId);
    if (!subs) return;
    for (const socket of subs) {
      if (socket.readyState !== WebSocket.OPEN) continue;
      const state = this.#states.get(socket);
      if (!state) continue;
      const privateEvents = state.playerId === null
        ? []
        : outcome.privateEvents
            .filter((entry) => entry.recipients.includes(state.playerId!))
            .map((entry) => entry.event);
      const events = [...outcome.publicEvents, ...privateEvents];
      if (events.length === 0) continue;
      this.#send(socket, 'game_event', {
        sessionId: outcome.sessionId,
        moduleId: outcome.moduleId,
        seq: outcome.seq,
        ...(outcome.rulesetId === null ? {} : { rulesetId: outcome.rulesetId }),
        ...(outcome.viewVersion === null ? {} : { viewVersion: outcome.viewVersion }),
        events,
      }, { roomSeq: outcome.roomSeq });
    }
  }

  /** 向房间每个订阅者按其身份下发 game_state（G-04：视角白名单在服务端完成） */
  broadcastGameViews(roomId: string, roomSeq?: number): void {
    const subs = this.#roomSubscribers.get(roomId);
    if (!subs) return;
    for (const socket of subs) {
      if (socket.readyState !== WebSocket.OPEN) continue;
      const st = this.#states.get(socket);
      if (!st) continue;
      const payload = buildGameStatePayload(this.#deps.db, roomId, st.playerId);
      if (payload) this.#send(socket, 'game_state', payload, roomSeq === undefined ? {} : { roomSeq });
    }
  }

  async #handleChatSend(
    socket: WebSocket,
    state: ConnectionState,
    requestId: string,
    rawPayload: unknown,
  ): Promise<void> {
    const payload = chatSendPayloadSchema.safeParse(rawPayload);
    if (!payload.success) {
      this.#sendError(socket, requestId, 'INVALID_MESSAGE');
      return;
    }
    const { roomId, playerId } = state;
    if (roomId === null || playerId === null) {
      this.#sendError(socket, requestId, 'ACTION_NOT_ALLOWED');
      return;
    }
    // 聊天限流（FR-CHAT-003：5 条/10 秒/玩家）
    const limit = this.#chatLimiter.tryAcquire(`${roomId}/${playerId}`);
    if (!limit.ok) {
      this.#sendError(socket, requestId, 'RATE_LIMITED', { retryAfterMs: limit.retryAfterMs });
      return;
    }

    // 聊天走独立游标，不推动 roomSeq（§9.1）
    const result = await this.#deps.executor.executeOnRoom({
      roomId,
      actorScope: `player:${playerId}`,
      requestId,
      bumpSeq: false,
      handler: (tx) => applyChatSend(tx, roomId, playerId, payload.data.text),
    });

    this.#send(socket, 'ack', { cursor: result.outcome.cursor }, { requestId });
    if (!result.replayed) {
      this.#broadcastChat(roomId, [result.outcome]);
    }
  }

  #sendCurrentGameState(
    socket: WebSocket,
    roomId: string,
    playerId: string | null,
    requestId: string,
    roomSeq: number,
  ): GameStatePayload | null {
    const gameState = buildGameStatePayload(this.#deps.db, roomId, playerId);
    if (gameState) this.#send(socket, 'game_state', gameState, { requestId, roomSeq });
    return gameState;
  }

  #replayPublicGameEvents(
    socket: WebSocket,
    roomId: string,
    requestId: string,
    lastSeq: number | null,
    identity: GameResumeIdentity | null,
    gameState: GameStatePayload | null,
    currentRoomSeq: number,
  ): void {
    if (
      lastSeq === null
      || identity === null
      || gameState === null
      || gameState.engineContractVersion !== 2
      || gameState.viewVersion !== identity.viewVersion
      || gameState.sessionId !== identity.sessionId
    ) return;
    const gap = currentRoomSeq - lastSeq;
    if (gap <= 0 || gap > MAX_PUBLIC_GAME_EVENT_REPLAY_GAP) return;

    const rows = this.#deps.db.prepare(
      `SELECT seq, events_json
       FROM game_events
       WHERE session_id = ?
       ORDER BY seq ASC`,
    ).all(identity.sessionId) as { seq: number; events_json: string }[];
    const replayable = rows.flatMap((row) => {
      const parsed = JSON.parse(row.events_json) as unknown;
      if (!isVersionedEventEnvelope(parsed)) return [];
      if (parsed.roomSeq <= lastSeq || parsed.roomSeq > currentRoomSeq) return [];
      return [{ sessionSeq: row.seq, envelope: parsed }];
    });
    let previousRoomSeq = lastSeq;
    for (const entry of replayable) {
      if (entry.envelope.roomSeq <= previousRoomSeq) return;
      previousRoomSeq = entry.envelope.roomSeq;
    }
    for (const entry of replayable) {
      if (entry.envelope.publicEvents.length === 0) continue;
      this.#send(socket, 'game_event', {
        sessionId: identity.sessionId,
        moduleId: gameState.moduleId,
        seq: entry.sessionSeq,
        rulesetId: entry.envelope.rulesetId,
        viewVersion: identity.viewVersion,
        events: entry.envelope.publicEvents,
      }, { requestId, roomSeq: entry.envelope.roomSeq });
    }
  }

  #sendResyncBundle(
    socket: WebSocket,
    state: ConnectionState,
    requestId: string,
    input: {
      readonly lastSeq: number | null;
      readonly chatCursor: number | null;
      readonly game: GameResumeIdentity | null;
    },
    options: { readonly includeSnapshot?: boolean } = {},
  ): void {
    const roomId = state.roomId;
    if (roomId === null) return;
    const snapshot = buildRoomSnapshot(this.#deps.db, roomId);
    if (options.includeSnapshot !== false) {
      this.#send(socket, 'room_snapshot', snapshot, { requestId, roomSeq: snapshot.seq });
    }
    const gameState = buildGameStatePayload(this.#deps.db, roomId, state.playerId);
    this.#replayPublicGameEvents(
      socket,
      roomId,
      requestId,
      input.lastSeq,
      input.game,
      gameState,
      snapshot.seq,
    );
    if (gameState) this.#send(socket, 'game_state', gameState, { requestId, roomSeq: snapshot.seq });
    const missed = listChatAfter(this.#deps.db, roomId, input.chatCursor);
    if (missed.length > 0) {
      this.#send(socket, 'chat_batch', { messages: missed }, { requestId });
    }
  }

  /** resync：只读直查，不入队（§9.2） */
  #handleResync(
    socket: WebSocket,
    state: ConnectionState,
    requestId: string,
    rawPayload: unknown,
  ): void {
    const payload = resyncPayloadSchema.safeParse(rawPayload);
    if (!payload.success) {
      this.#sendError(socket, requestId, 'INVALID_MESSAGE');
      return;
    }
    const { roomId } = state;
    if (roomId === null) {
      this.#sendError(socket, requestId, 'ACTION_NOT_ALLOWED');
      return;
    }
    this.#sendResyncBundle(socket, state, requestId, {
      ...payload.data,
      game: payload.data.game ?? null,
    });
  }

  #nicknameOf(roomId: string, playerId: string): string | null {
    const row = this.#deps.db
      .prepare('SELECT nickname FROM room_members WHERE room_id = ? AND player_id = ?')
      .get(roomId, playerId) as { nickname: string } | undefined;
    return row?.nickname ?? null;
  }

  #broadcastChat(roomId: string, messages: ChatMessageView[]): void {
    this.broadcastToRoom(roomId, 'chat_batch', { messages });
  }

  broadcastToRoom(
    roomId: string,
    type: ServerMessageType,
    payload: unknown,
    roomSeq?: number,
  ): void {
    const subs = this.#roomSubscribers.get(roomId);
    if (!subs) return;
    for (const socket of subs) {
      if (socket.readyState === WebSocket.OPEN) {
        this.#send(socket, type, payload, roomSeq === undefined ? {} : { roomSeq });
      }
    }
  }

  #send(
    socket: WebSocket,
    type: ServerMessageType,
    payload: unknown,
    extra: { requestId?: string; roomSeq?: number } = {},
  ): void {
    if (socket.readyState !== WebSocket.OPEN) return;
    const envelope: ServerEnvelope = {
      v: PROTOCOL_VERSION,
      type,
      serverNow: Date.now(),
      payload,
      ...(extra.requestId !== undefined ? { requestId: extra.requestId } : {}),
      ...(extra.roomSeq !== undefined ? { roomSeq: extra.roomSeq } : {}),
    };
    socket.send(JSON.stringify(envelope));
  }

  #sendError(
    socket: WebSocket,
    requestId: string | undefined,
    code: ErrorCode,
    overrides?: { message?: string; retryAfterMs?: number; currentSeq?: number },
  ): void {
    this.#send(socket, 'error', makeErrorPayload(code, overrides), { requestId });
  }

  /** 优雅关闭：停止接收新连接并关闭现有连接（FR-BOOT-004） */
  async close(): Promise<void> {
    clearInterval(this.#reservationSweeper);
    for (const timer of this.#hostTransferTimers.values()) {
      clearTimeout(timer);
    }
    this.#hostTransferTimers.clear();
    for (const timer of this.#autoStartTimers.values()) {
      clearTimeout(timer);
    }
    this.#autoStartTimers.clear();
    for (const client of this.#wss.clients) {
      client.close(1001, 'server shutting down');
    }
    await new Promise<void>((resolvePromise, reject) => {
      this.#wss.close((err) => (err ? reject(err) : resolvePromise()));
    });
  }
}
