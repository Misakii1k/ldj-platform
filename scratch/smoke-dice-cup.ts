/**
 * 骰盅 3D 引擎交互冒烟（一次性脚本，非测试套件）：
 * 起独立服务 → seed 5 人奶酪大盗房 → 开局 → 真实 Chromium 玩家页交互：
 * 静止 → 长按掀盖 → 摇骰中 → 落定 → 再掀盖，逐阶段截图 + 抓取点数文案。
 * 运行：npx tsx scratch/smoke-dice-cup.ts
 */
import { rmSync, mkdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { seedRoom } from '../e2e/helpers/dbClient.ts';
import { RoomDriver } from '../e2e/helpers/wsClient.ts';
import { BASE_URL, ME_STORAGE_KEY, WS_URL } from '../e2e/helpers/serverEnv.ts';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const DATA_DIR = join(REPO_ROOT, 'e2e', '.smoke-data');
const DB_PATH = join(DATA_DIR, 'platform.db');
const SHOTS_DIR = join(REPO_ROOT, 'scratch', 'shots');
mkdirSync(SHOTS_DIR, { recursive: true });
rmSync(DATA_DIR, { recursive: true, force: true });

const CHEESE_CONFIG = {
  rulesetId: 'cheese_thief_classic_v1',
  nightHourSeconds: 30,
  discussionSeconds: 30,
  voteSeconds: 30,
};

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
  throw new Error('smoke server 未就绪');
}

const server = spawn(process.execPath, ['packages/server/src/index.ts'], {
  cwd: REPO_ROOT,
  stdio: 'ignore',
  env: { ...process.env, PORT: '3178', DATA_DIR, LOG_LEVEL: 'warn' },
});

try {
  await waitAlive();

  const seeded = seedRoom(DB_PATH, { gameId: 'cheese-thief', count: 5, ready: true, config: CHEESE_CONFIG });
  const host = await RoomDriver.resume(WS_URL, seeded.roomCode, seeded.hostId, seeded.hostResumeToken);
  const readyAck = await host.ready();
  if (readyAck.type !== 'ack') throw new Error('ready failed');
  const startAck = await host.startGame(CHEESE_CONFIG);
  if (startAck.type !== 'ack') throw new Error(`start failed: ${JSON.stringify(startAck.payload)}`);

  const browser = await chromium.launch();
  const me = seeded.players[1]!;
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  page.on('console', (msg) => {
    const t = msg.text().slice(0, 160);
    console.log(`[browser ${msg.type()}]`, t);
  });
  page.on('websocket', (ws) => {
    console.log('[ws]', ws.url(), 'opened');
    ws.on('close', () => console.log('[ws] closed'));
  });
  await page.addInitScript(
    ([k, v]) => {
      localStorage.setItem(k, v);
    },
    [
      ME_STORAGE_KEY,
      JSON.stringify({
        playerId: me.playerId,
        resumeToken: me.resumeToken,
        roomCode: seeded.roomCode,
        nickname: '玩家2',
        seatRole: 'player',
      }),
    ]
  );
  await page.goto(BASE_URL);
  await page.waitForTimeout(300);
  console.log('[debug] localStorage right after goto:', await page.evaluate(() => localStorage.getItem('ldj:session')));
  try {
    await page.locator('.tabletop-shell').waitFor({ timeout: 20_000 });
  } catch {
    await page.screenshot({ path: join(SHOTS_DIR, 'smoke-debug-full.png'), fullPage: true });
    console.log('[debug] url:', page.url());
    console.log('[debug] localStorage:', await page.evaluate(() => localStorage.getItem('ldj:session')));
    console.log('[debug] body text:', (await page.locator('body').textContent())?.slice(0, 300));
    throw new Error('tabletop-shell 未出现，见 scratch/shots/smoke-debug-full.png');
  }
  await page.locator('.cheese-secret-card').waitFor({ timeout: 15_000 });

  const secretCard = page.locator('.cheese-secret-card');
  const cup = page.locator('.shared-dice-cup-wrapper');
  const hint = page.locator('.shared-cup-hint');

  // 1. 静止扣盖
  await page.waitForTimeout(600);
  await secretCard.screenshot({ path: join(SHOTS_DIR, 'smoke-1-idle.png') });
  console.log('[1] idle hint:', (await hint.textContent())?.trim());

  // 2. 长按掀盖（保持按住）
  await cup.dispatchEvent('pointerdown');
  await page.waitForTimeout(900);
  // 实测 3D 画布真实显示尺寸（诊断布局压缩）
  const rect = await page
    .locator('.three-dice-cup-canvas-wrapper canvas')
    .evaluate((el) => {
      const r = el.getBoundingClientRect();
      return { w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x), y: Math.round(r.y) };
    });
  console.log('[2] canvas rect:', JSON.stringify(rect));
  await page
    .locator('.three-dice-cup-canvas-wrapper canvas')
    .screenshot({ path: join(SHOTS_DIR, 'smoke-2-canvas-only.png') });
  await secretCard.screenshot({ path: join(SHOTS_DIR, 'smoke-2-lifted.png') });
  const liftedHint = (await hint.textContent())?.trim();
  console.log('[2] lifted hint:', liftedHint);
  await cup.dispatchEvent('pointerup');
  await page.waitForTimeout(700);

  // 3. 摇骰中
  const shakeBtn = page.locator('.shared-cup-shake-btn');
  await shakeBtn.click();
  await page.waitForTimeout(250);
  await secretCard.screenshot({ path: join(SHOTS_DIR, 'smoke-3-shaking.png') });
  console.log('[3] shaking hint:', (await hint.textContent())?.trim());

  // 4. 摇骰结束、落定
  await page.waitForTimeout(900);
  await secretCard.screenshot({ path: join(SHOTS_DIR, 'smoke-4-settled.png') });

  // 5. 再掀盖查看摇后点数
  await cup.dispatchEvent('pointerdown');
  await page.waitForTimeout(900);
  await secretCard.screenshot({ path: join(SHOTS_DIR, 'smoke-5-lifted-after.png') });
  const afterHint = (await hint.textContent())?.trim();
  console.log('[5] lifted-after hint:', afterHint);

  // 静止后确认无持续 rAF（按需渲染挂起）：统计页面 1 秒内的 rAF 帧数
  await page.waitForTimeout(2500);
  const rafCount = await page.evaluate(
    `new Promise((resolve) => {
      let n = 0;
      const t0 = performance.now();
      const tick = () => {
        n += 1;
        if (performance.now() - t0 < 1000) requestAnimationFrame(tick);
        else resolve(n);
      };
      requestAnimationFrame(tick);
    })`
  );
  console.log('[6] page-level rAF frames in 1s (idle):', rafCount, '(页面级参考值，非引擎专属)');

  await browser.close();
  host.client.close();
  console.log('SMOKE OK -> screenshots in scratch/shots/');
} finally {
  server.kill();
}
