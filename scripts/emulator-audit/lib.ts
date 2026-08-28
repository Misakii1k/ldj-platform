/**
 * 模拟器视觉验收 PC 侧驱动共享库。
 * 复用 e2e/helpers 的 seedRoom + RoomDriver 模式，指向 dev 服务器（8080）。
 * 手机端（模拟器 WebView）经 UI 真实 join_room 进入房间，作为被验收的显示/操作端。
 */
import { seedRoom, type SeededRoom } from '../../e2e/helpers/dbClient.ts';
import { RoomDriver, WsClient, type Envelope } from '../../e2e/helpers/wsClient.ts';

export const DEV_WS_URL = 'ws://127.0.0.1:8080/ws';
export const DEV_DB_PATH = 'D:/项目/data/platform.db';

/** dev 服务器开着 LLM，绕过 e2e helper 的零-LLM 断言（视觉验收要真实体验，含 AI 发言） */
export async function connectDrive(url: string = DEV_WS_URL): Promise<WsClient> {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      const socket = new WebSocket(url);
      const client = new WsClient(socket);
      await client.waitFor((e) => e.type === 'welcome');
      return client;
    } catch (err) {
      if (attempt === 5) throw err;
      await new Promise((r) => setTimeout(r, 80));
    }
  }
  throw new Error('unreachable');
}

/** 以指定身份 resume（不加 LLM 断言）。 */
export async function resumeAs(roomCode: string, playerId: string, resumeToken: string): Promise<RoomDriver> {
  const client = await connectDrive();
  const ack = await client.request('resume_room', {
    roomCode,
    playerId,
    resumeToken,
    lastSeq: null,
    chatCursor: null,
  });
  if (ack.type === 'error') {
    client.close();
    throw new Error(`resume 失败：${JSON.stringify(ack.payload)}`);
  }
  await client.waitFor((e) => e.type === 'room_snapshot');
  return new RoomDriver(client, roomCode, playerId);
}

export interface RoomSetup {
  seeded: SeededRoom;
  host: RoomDriver;
  /** 除房主外已 seed 的席位（懒驱动：按需 resume） */
  seatTokens: { playerId: string; resumeToken: string; seat: number }[];
}

export async function setupRoom(options: {
  gameId: string;
  /** seed 席位数（含房主，不含手机玩家）；手机经 UI join 占第 count+1 席 */
  count: number;
  config: Record<string, unknown>;
}): Promise<RoomSetup> {
  const seeded = seedRoom(DEV_DB_PATH, {
    gameId: options.gameId,
    count: options.count,
    ready: true,
    config: options.config,
  });
  const host = await resumeAs(seeded.roomCode, seeded.hostId, seeded.hostResumeToken);
  return {
    seeded,
    host,
    seatTokens: seeded.players.slice(1).map((p) => ({ ...p })),
  };
}

export async function resumeSeat(setup: RoomSetup, seat: number): Promise<RoomDriver> {
  const token = setup.seatTokens[seat - 2]; // seat 1 = 房主；seat 2 起在 seatTokens[0]
  if (!token) throw new Error(`席位 ${seat} 未 seed`);
  return resumeAs(setup.seeded.roomCode, token.playerId, token.resumeToken);
}

export async function addBots(host: RoomDriver, count: number, kind: string = 'rule'): Promise<void> {
  for (let i = 0; i < count; i += 1) {
    const ack = await host.client.request('room_command', { command: 'add_bot', kind });
    if (ack.type !== 'ack') {
      throw new Error(`add_bot 失败：${JSON.stringify(ack.payload)}`);
    }
  }
}

export async function ackOf(p: Promise<Envelope>): Promise<Envelope> {
  const ack = await p;
  if (ack.type !== 'ack') {
    throw new Error(`命令被拒：${JSON.stringify(ack.payload)}`);
  }
  return ack;
}

/** 保存一帧截图诊断信息（几何测量用），打印 JSON */
export function printStep(msg: string): void {
  console.log(`[drive] ${new Date().toISOString()} ${msg}`);
}

/** 串行执行（避免触发服务端操作限流），RATE_LIMITED 按 retryAfterMs 重试 */
export async function paced(kind: string, fn: () => Promise<Envelope>, log: (m: string) => void = () => void 0): Promise<void> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const ack = await fn();
    if (ack.type === 'ack') return;
    const retryAfter = (ack.payload as { retryAfterMs?: number }).retryAfterMs;
    const code = String((ack.payload as { code?: string }).code ?? '');
    if (code === 'RATE_LIMITED' && attempt < 3) {
      await new Promise((r) => setTimeout(r, (retryAfter ?? 600) + 120));
      continue;
    }
    log(`${kind} 被拒：${JSON.stringify(ack.payload).slice(0, 160)}`);
    return;
  }
}

/** 等待下一帧并排空到最新 game_state（latestGameState 不消费最新帧，需引用判等跳出）。 */
export async function waitFreshState(driver: RoomDriver, timeoutMs = 150_000): Promise<Record<string, unknown> | null> {
  let env: Envelope;
  try {
    env = await driver.waitGameState(() => true, timeoutMs);
  } catch {
    return null;
  }
  for (;;) {
    const newer = driver.client.latestGameState(() => true);
    if (!newer || newer === env) break;
    env = newer;
  }
  return env.payload.view as Record<string, unknown>;
}
