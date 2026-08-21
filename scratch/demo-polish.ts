/**
 * 骰盅/卡牌打磨效果演示（一次性脚本）：
 * 独立演示服务（127.0.0.1:3178，临时数据目录）+ 两个真实 Chromium 窗口：
 *   窗口1 奶酪大盗 —— 3D 骰盅：长按掀盖弹簧过冲 / 摇骰物理+碰撞音 / 落定动画 / 材质光影
 *   窗口2 UNO —— 扇形手牌：hover 邻卡联动 / 选中上浮放大 / 出牌飞出
 * 关闭两个浏览器窗口后脚本自动退出并清理服务。
 */
import { rmSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { seedRoom } from '../e2e/helpers/dbClient.ts';
import { RoomDriver } from '../e2e/helpers/wsClient.ts';
import { BASE_URL, ME_STORAGE_KEY, WS_URL } from '../e2e/helpers/serverEnv.ts';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const DATA_DIR = join(REPO_ROOT, 'e2e', '.demo-data');
const DB_PATH = join(DATA_DIR, 'platform.db');
rmSync(DATA_DIR, { recursive: true, force: true });

async function waitAlive(timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE_URL}/health/live`);
      if (res.ok) return;
    } catch {
      // not yet
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error('demo server 未就绪');
}

const server = spawn(process.execPath, ['packages/server/src/index.ts'], {
  cwd: REPO_ROOT,
  stdio: 'ignore',
  env: { ...process.env, PORT: '3178', DATA_DIR, LOG_LEVEL: 'warn' },
});

function sessionInit(
  me: { playerId: string; resumeToken: string },
  roomCode: string,
  nickname: string
): [[string, string]] {
  return [
    [
      ME_STORAGE_KEY,
      JSON.stringify({ ...me, roomCode, nickname, seatRole: 'player' }),
    ],
  ];
}

try {
  await waitAlive();

  // ── 演示1：奶酪大盗（3D 骰盅）──
  const CHEESE_CONFIG = {
    rulesetId: 'cheese_thief_classic_v1',
    hourChoiceSeconds: 15,
    nightHourSeconds: 45,
    discussionSeconds: 120,
    voteSeconds: 60,
  };
  const cheese = seedRoom(DB_PATH, {
    gameId: 'cheese-thief',
    count: 5,
    ready: true,
    config: CHEESE_CONFIG,
  });
  const cheeseHost = await RoomDriver.resume(
    WS_URL, cheese.roomCode, cheese.hostId, cheese.hostResumeToken
  );
  const cheeseStart = await cheeseHost.startGame(CHEESE_CONFIG);
  if (cheeseStart.type !== 'ack') {
    throw new Error(`cheese start 失败: ${JSON.stringify(cheeseStart.payload)}`);
  }
  cheeseHost.client.close();
  const cheeseMe = cheese.players[1]!;
  console.log(`[demo] 奶酪大盗房间就绪 ${cheese.roomCode}（浏览器座位：玩家2）`);

  // ── 演示2：UNO（扇形手牌，房主 + 3 个规则机器人陪练）──
  let uno: ReturnType<typeof seedRoom> | null = null;
  try {
    uno = seedRoom(DB_PATH, {
      gameId: 'uno',
      count: 1,
      ready: true,
      config: { rulesetId: 'uno_platform_house_v1' },
    });
    const unoHost = await RoomDriver.resume(
      WS_URL, uno.roomCode, uno.hostId, uno.hostResumeToken
    );
    for (let i = 0; i < 3; i++) {
      const ack = await unoHost.client.request('room_command', {
        command: 'add_bot',
        kind: 'rule',
      });
      if (ack.type !== 'ack') throw new Error(`add_bot 失败: ${JSON.stringify(ack.payload)}`);
    }
    const unoStart = await unoHost.startGame({
      rulesetId: 'uno_platform_house_v1',
      mode: 'individual',
      roundCount: 1,
    });
    if (unoStart.type !== 'ack') {
      throw new Error(`uno start 失败: ${JSON.stringify(unoStart.payload)}`);
    }
    await unoHost.waitGameState((v) => v.phase === 'round_playing', 15_000).catch(() => null);
    unoHost.client.close();
    console.log(`[demo] UNO 房间就绪 ${uno.roomCode}（浏览器座位：房主 + 3 机器人）`);
  } catch (err) {
    console.warn('[demo] UNO 演示跳过：', err);
    uno = null;
  }

  // ── 打开真实浏览器窗口 ──
  const browser = await chromium.launch({ headless: false });
  const openPages: import('@playwright/test').Page[] = [];

  // 窗口1：奶酪大盗（主演示：3D 骰盅）
  try {
    const cheeseCtx = await browser.newContext({ viewport: { width: 1150, height: 820 } });
    const cheesePage = await cheeseCtx.newPage();
    await cheesePage.addInitScript(
      ([k, v]) => localStorage.setItem(k, v),
      sessionInit(cheeseMe, cheese.roomCode, '玩家2')[0]
    );
    await cheesePage.goto(BASE_URL);
    await cheesePage.locator('.cheese-secret-card').waitFor({ timeout: 30_000 });
    openPages.push(cheesePage);
    await cheesePage.bringToFront();
    console.log('[demo] 窗口1：奶酪大盗 3D 骰盅已就绪');
  } catch (err) {
    console.warn('[demo] 骰盅窗口未就绪：', String(err).slice(0, 120));
  }

  // 窗口2：UNO（扇形手牌动效）
  if (uno) {
    try {
      await new Promise((r) => setTimeout(r, 1500));
      const unoCtx = await browser.newContext({ viewport: { width: 1150, height: 820 } });
      const unoPage = await unoCtx.newPage();
      await unoPage.addInitScript(
        ([k, v]) => localStorage.setItem(k, v),
        sessionInit(uno.players[0]!, uno.roomCode, '房主')[0]
      );
      await unoPage.goto(BASE_URL);
      await unoPage.locator('.tabletop-shell').waitFor({ timeout: 30_000 });
      await unoPage.locator('.card-fan-item').first().waitFor({ timeout: 15_000 }).catch(() => null);
      openPages.push(unoPage);
      console.log('[demo] 窗口2：UNO 扇形手牌已就绪');
    } catch (err) {
      console.warn('[demo] UNO 窗口未就绪（被关闭或加载失败）：', String(err).slice(0, 120));
    }
  }

  if (openPages.length === 0) throw new Error('没有任何演示窗口存活');
  console.log('DEMO READY —— 关闭全部浏览器窗口后自动结束');

  // 挂起直到所有窗口都被关闭
  await new Promise<void>((resolve) => {
    const check = () => {
      if (openPages.every((p) => p.isClosed())) resolve();
    };
    for (const p of openPages) p.on('close', check);
    check();
  });
  console.log('[demo] 浏览器已全部关闭，清理退出');
} finally {
  server.kill();
}
