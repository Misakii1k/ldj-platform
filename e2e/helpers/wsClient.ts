/**
 * Node 端原生 WebSocket 客户端（E2E 驱动服务端）。
 * Node ≥24 原生支持 globalThis.WebSocket；不引入 ws 依赖。
 * 复刻 packages/server/tests/gatewayGame.test.ts 的成熟模式：
 * 等 welcome、request 带 requestId/expectedSeq、waitFor 谓词队列、
 * createRoom/joinRoom/ready/startGame/gameAction/waitGameState。
 *
 * 说明：当前目录所有游戏 availability 均非 'playable'，create_room 会被建房准入拒绝，
 * 因此本辅助类的 createRoom 设计为「建房 + resume」两步：先由 dbClient.seedRoom
 * 直插房间，再经真实 WS resume_room 接管（与 gatewayGame.test.ts 完全一致）。
 */

export interface Envelope {
  v: number;
  type: string;
  requestId?: string;
  roomSeq?: number;
  payload: Record<string, unknown>;
}

interface Waiter {
  predicate: (e: Envelope) => boolean;
  resolve: (e: Envelope) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

let reqCounter = 0;

function delay(ms: number): Promise<void> {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

/** join/resume 被服务端限流拒绝时抛出；带 retryAfterMs 供退避重试。 */
export class RoomJoinError extends Error {
  readonly code: string;
  readonly retryAfterMs: number | undefined;

  constructor(ack: Envelope, action: string) {
    const code = String(ack.payload.code ?? 'UNKNOWN');
    const retryAfterMs = typeof ack.payload.retryAfterMs === 'number' ? ack.payload.retryAfterMs : undefined;
    super(`${action} 失败：${code} ${String(ack.payload.message ?? '')}`);
    this.name = 'RoomJoinError';
    this.code = code;
    this.retryAfterMs = retryAfterMs;
  }
}

export class WsClient {
  readonly socket: WebSocket;
  readonly #queue: Envelope[] = [];
  readonly #waiters: Waiter[] = [];

  private constructor(socket: WebSocket) {
    this.socket = socket;
    socket.addEventListener('message', (ev: MessageEvent) => {
      const envelope = JSON.parse(String(ev.data)) as Envelope;
      const idx = this.#waiters.findIndex((w) => w.predicate(envelope));
      if (idx >= 0) {
        const [waiter] = this.#waiters.splice(idx, 1);
        if (waiter) {
          clearTimeout(waiter.timer);
          waiter.resolve(envelope);
        }
      } else {
        this.#queue.push(envelope);
      }
    });
  }

  /** 建立连接并等待 welcome；EADDRINUSE 类瞬时错误小退避重试。 */
  static async connect(url: string): Promise<WsClient> {
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const socket = new WebSocket(url);
      const client = new WsClient(socket);
      try {
        const welcome = await Promise.race([
          client.waitFor((e) => e.type === 'welcome'),
          new Promise<never>((_, reject) => {
            socket.addEventListener('error', () => reject(new Error('ws connect failed')), { once: true });
          }),
        ]);
        if (welcome.payload.llmAvailable === true) {
          throw new Error('E2E 服务端意外启用了 LLM，必须保证零真实供应商调用');
        }
        return client;
      } catch (err) {
        socket.close();
        if (attempt === 5) throw err;
        await delay(50 + attempt * 30);
      }
    }
    throw new Error('unreachable connect retry state');
  }

  send(
    type: string,
    payload: unknown,
    extra: { requestId?: string; expectedSeq?: number } = {},
  ): string {
    const requestId = extra.requestId ?? `e2e-${++reqCounter}`;
    this.socket.send(JSON.stringify({
      v: 1,
      type,
      requestId,
      payload,
      ...(extra.expectedSeq === undefined ? {} : { expectedSeq: extra.expectedSeq }),
    }));
    return requestId;
  }

  waitFor(predicate: (e: Envelope) => boolean, timeoutMs = 8000): Promise<Envelope> {
    const idx = this.#queue.findIndex(predicate);
    if (idx >= 0) return Promise.resolve(this.#queue.splice(idx, 1)[0]!);
    return new Promise<Envelope>((resolvePromise, reject) => {
      const timer = setTimeout(() => {
        const i = this.#waiters.findIndex((w) => w.predicate === predicate);
        if (i >= 0) this.#waiters.splice(i, 1);
        reject(new Error('等待消息超时'));
      }, timeoutMs);
      this.#waiters.push({
        predicate,
        resolve: resolvePromise,
        reject,
        timer,
      });
    });
  }

  /** 发请求并等待 ack / error（按 requestId 配对）。 */
  async request(
    type: string,
    payload: unknown,
    extra: { expectedSeq?: number } = {},
  ): Promise<Envelope> {
    const requestId = this.send(type, payload, extra);
    return this.waitFor((e) => e.requestId === requestId && (e.type === 'ack' || e.type === 'error'));
  }

  /** 等待满足谓词的新一帧 game_state（自动跳过队列中旧帧）。 */
  async waitGameState(
    predicate: (view: Record<string, unknown>) => boolean,
    timeoutMs = 8000,
  ): Promise<Envelope> {
    return this.waitFor(
      (e) => e.type === 'game_state' && predicate((e.payload.view ?? {}) as Record<string, unknown>),
      timeoutMs,
    );
  }

  close(): void {
    try {
      this.socket.close();
    } catch {
      // 已关闭
    }
  }
}

/** E2E 房主/玩家辅助：seed 后经真实 WS resume，再走房间/对局命令。 */
export class RoomDriver {
  readonly client: WsClient;
  readonly roomCode: string;
  readonly playerId: string;

  constructor(client: WsClient, roomCode: string, playerId: string) {
    this.client = client;
    this.roomCode = roomCode;
    this.playerId = playerId;
  }

  static async resume(
    url: string,
    roomCode: string,
    playerId: string,
    resumeToken: string,
  ): Promise<RoomDriver> {
    return this.#withJoinRetry(`resume:${playerId}`, async () => {
      const client = await WsClient.connect(url);
      const ack = await client.request('resume_room', {
        roomCode,
        playerId,
        resumeToken,
        lastSeq: null,
        chatCursor: null,
      });
      if (ack.type === 'error') {
        client.close();
        throw new RoomJoinError(ack, 'resume_room');
      }
      await client.waitFor((e) => e.type === 'room_snapshot');
      return new RoomDriver(client, roomCode, playerId);
    });
  }

  /** 直接 join_room（房主以外的新连接）。 */
  static async join(
    url: string,
    roomCode: string,
    nickname: string,
    options: { asSpectator?: boolean; ready?: boolean } = {},
  ): Promise<RoomDriver> {
    return this.#withJoinRetry(`join:${nickname}`, async () => {
      const client = await WsClient.connect(url);
      const ack = await client.request('join_room', {
        roomCode,
        nickname,
        ...(options.asSpectator ? { asSpectator: true } : {}),
      });
      if (ack.type === 'error') {
        client.close();
        throw new RoomJoinError(ack, 'join_room');
      }
      const playerId = String(ack.payload.playerId);
      if (options.ready) await client.request('room_command', { command: 'ready', ready: true });
      return new RoomDriver(client, roomCode, playerId);
    });
  }

  /** E2E 套件连跑会触发服务端 join 限流（10 次/分钟/IP，resume 与 join 共用同一限流器）；按 retryAfterMs 退避重试。 */
  static async #withJoinRetry<T>(tag: string, fn: () => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      try {
        return await fn();
      } catch (err) {
        if (!(err instanceof RoomJoinError) || err.retryAfterMs === undefined) throw err;
        if (attempt === 7) throw err;
        await delay(err.retryAfterMs + 150);
      }
    }
    throw new Error(`unreachable join retry state (${tag})`);
  }

  ready(ready = true): Promise<Envelope> {
    return this.client.request('room_command', { command: 'ready', ready });
  }

  startGame(gameConfig?: unknown): Promise<Envelope> {
    return this.client.request('room_command', {
      command: 'start_game',
      ...(gameConfig === undefined ? {} : { gameConfig }),
    });
  }

  abortGame(): Promise<Envelope> {
    return this.client.request('room_command', { command: 'abort_game' });
  }

  gameAction(payload: unknown): Promise<Envelope> {
    return this.client.request('game_action', payload);
  }

  waitGameState(predicate: (view: Record<string, unknown>) => boolean, timeoutMs = 8000): Promise<Envelope> {
    return this.client.waitGameState(predicate, timeoutMs);
  }
}
