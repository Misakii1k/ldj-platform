/**
 * 机器人 WS 全链路测试（复现"添加机器人失败：请求格式有误"）。
 * bots.test.ts 直接调 applyRoomCommand，绕过了 WS 的 zod 校验层，
 * 所以这条路径此前没有任何覆盖。这里走真实 WebSocket。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { PROTOCOL_VERSION } from '@ldj/shared';
import { createApp, type App } from '../src/app.ts';
import { createLogger } from '../src/boot/logger.ts';
import type { ServerConfig } from '../src/config.ts';

function testConfig(llmBaseUrl: string | null = null): ServerConfig {
  return {
    host: '127.0.0.1',
    port: 0,
    dbPath: ':memory:',
    publicBaseUrl: null,
    logLevel: 'error',
    allowedOrigins: [],
    llm: { baseUrl: llmBaseUrl, apiKey: null, model: 'test-model', timeoutMs: 5000 },
    adminToken: null,
  };
}

async function startApp(llmBaseUrl: string | null = null): Promise<App> {
  const logger = createLogger('error', {}, () => {});
  const app = createApp(testConfig(llmBaseUrl), logger);
  await app.listen();
  return app;
}

interface Envelope {
  v: number;
  type: string;
  requestId?: string;
  roomSeq?: number;
  payload: Record<string, unknown>;
}

let reqCounter = 0;

class Client {
  readonly socket: WebSocket;
  readonly #queue: Envelope[] = [];
  #waiters: { predicate: (e: Envelope) => boolean; resolve: (e: Envelope) => void }[] = [];

  private constructor(socket: WebSocket) {
    this.socket = socket;
    socket.on('message', (raw) => {
      const envelope = JSON.parse((raw as Buffer).toString()) as Envelope;
      const idx = this.#waiters.findIndex((w) => w.predicate(envelope));
      if (idx >= 0) {
        const [waiter] = this.#waiters.splice(idx, 1);
        waiter!.resolve(envelope);
      } else {
        this.#queue.push(envelope);
      }
    });
  }

  static async connect(app: App): Promise<Client> {
    const socket = new WebSocket(`ws://127.0.0.1:${app.port()}/`);
    const client = new Client(socket);
    await client.waitFor((e) => e.type === 'welcome');
    return client;
  }

  async waitFor(predicate: (e: Envelope) => boolean, timeoutMs = 4000): Promise<Envelope> {
    const idx = this.#queue.findIndex(predicate);
    if (idx >= 0) return this.#queue.splice(idx, 1)[0]!;
    return new Promise<Envelope>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#waiters = this.#waiters.filter((w) => w.resolve !== wrapped);
        reject(new Error('等待消息超时'));
      }, timeoutMs);
      const wrapped = (e: Envelope): void => {
        clearTimeout(timer);
        resolve(e);
      };
      this.#waiters.push({ predicate, resolve: wrapped });
    });
  }

  /** 发一条并等它的 ack 或 error */
  async request(type: string, payload: unknown): Promise<Envelope> {
    const requestId = `gbot-${++reqCounter}`;
    this.socket.send(JSON.stringify({ v: PROTOCOL_VERSION, type, requestId, payload }));
    return this.waitFor((e) => e.requestId === requestId && (e.type === 'ack' || e.type === 'error'));
  }

  close(): void {
    this.socket.close();
  }
}

/** 建房并返回房主客户端 */
async function createRoom(app: App): Promise<{ host: Client; roomCode: string }> {
  const host = await Client.connect(app);
  const created = await host.request('create_room', { nickname: '房主' });
  assert.equal(created.type, 'ack', `建房失败：${JSON.stringify(created.payload)}`);
  return { host, roomCode: String(created.payload.roomCode) };
}

test('WS add_bot：房主添加规则机器人应成功并广播快照', async () => {
  const app = await startApp();
  try {
    const { host } = await createRoom(app);

    const ack = await host.request('room_command', { command: 'add_bot', kind: 'rule' });
    assert.equal(
      ack.type,
      'ack',
      `add_bot 应成功，实际收到 ${ack.type}：${JSON.stringify(ack.payload)}`,
    );

    const snapshot = await host.waitFor(
      (e) => e.type === 'room_snapshot' && (e.payload.members as unknown[]).length === 2,
    );
    const members = snapshot.payload.members as { nickname: string; botKind: string | null }[];
    const bot = members.find((m) => m.botKind !== null);
    assert.ok(bot, '快照里应有一个机器人成员');
    assert.equal(bot.botKind, 'rule');
    assert.match(bot.nickname, /^机器人/);
    host.close();
  } finally {
    await app.shutdown();
  }
});

test('WS add_bot：不带 kind 字段时默认 rule（客户端可省略）', async () => {
  const app = await startApp();
  try {
    const { host } = await createRoom(app);
    const ack = await host.request('room_command', { command: 'add_bot' });
    assert.equal(ack.type, 'ack', `省略 kind 应成功，实际：${JSON.stringify(ack.payload)}`);
    host.close();
  } finally {
    await app.shutdown();
  }
});

test('WS add_bot：未配置大模型时 llm 机器人被明确拒绝', async () => {
  const app = await startApp();
  try {
    const { host } = await createRoom(app);
    const err = await host.request('room_command', { command: 'add_bot', kind: 'llm' });
    assert.equal(err.type, 'error');
    assert.equal(err.payload.code, 'ACTION_NOT_ALLOWED');
    host.close();
  } finally {
    await app.shutdown();
  }
});

test('WS welcome：llmAvailable 反映服务端配置', async () => {
  const off = await startApp();
  try {
    const socket = new WebSocket(`ws://127.0.0.1:${off.port()}/`);
    const client = await (async (): Promise<Envelope> => {
      const c = new Promise<Envelope>((resolve) => {
        socket.once('message', (raw) => resolve(JSON.parse((raw as Buffer).toString()) as Envelope));
      });
      return c;
    })();
    assert.equal(client.payload.llmAvailable, false);
    socket.close();
  } finally {
    await off.shutdown();
  }

  const on = await startApp('http://127.0.0.1:9/v1');
  try {
    const socket = new WebSocket(`ws://127.0.0.1:${on.port()}/`);
    const welcome = await new Promise<Envelope>((resolve) => {
      socket.once('message', (raw) => resolve(JSON.parse((raw as Buffer).toString()) as Envelope));
    });
    assert.equal(welcome.payload.llmAvailable, true);
    socket.close();
  } finally {
    await on.shutdown();
  }
});

test('WS remove_bot：移除后快照回到只有房主', async () => {
  const app = await startApp();
  try {
    const { host } = await createRoom(app);
    await host.request('room_command', { command: 'add_bot', kind: 'rule' });
    await host.waitFor((e) => e.type === 'room_snapshot' && (e.payload.members as unknown[]).length === 2);

    const ack = await host.request('room_command', { command: 'remove_bot' });
    assert.equal(ack.type, 'ack', `remove_bot 应成功：${JSON.stringify(ack.payload)}`);
    const snapshot = await host.waitFor(
      (e) => e.type === 'room_snapshot' && (e.payload.members as unknown[]).length === 1,
    );
    assert.equal((snapshot.payload.members as unknown[]).length, 1);
    host.close();
  } finally {
    await app.shutdown();
  }
});
