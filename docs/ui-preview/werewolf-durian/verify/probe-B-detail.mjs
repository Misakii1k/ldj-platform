import { createRequire } from 'module';
import { rmSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';

const require = createRequire(path.resolve(process.cwd(), 'package.json'));
const { chromium } = require('playwright');

const REPO = path.resolve('D:/项目');
const DATA_DIR = path.join(REPO, 'e2e/.tmp-data-probe');
rmSync(DATA_DIR, { recursive: true, force: true });

const server = spawn(process.execPath, ['packages/server/src/index.ts'], {
  cwd: REPO, stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, PORT: '3178', DATA_DIR, LOG_LEVEL: 'warn', E2E_JOIN_LIMIT_MAX: '1000', NO_PROXY: '127.0.0.1,localhost' },
});

async function waitForHealth(timeoutMs = 30_000) {
  const s = Date.now();
  while (Date.now() - s < timeoutMs) {
    try {
      if ((await fetch('http://127.0.0.1:3178/health/live')).ok) return;
    } catch {
      // 服务尚未启动完成，继续轮询重试
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error('timeout');
}

(async () => {
  await waitForHealth();
  const browser = await chromium.launch({ args: ['--no-proxy-server'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript(() => sessionStorage.setItem('ldj_pc_host_entered', 'true'));
  const page = await ctx.newPage();
  await page.goto('http://127.0.0.1:3178');
  await page.waitForTimeout(1200);

  const full = await page.evaluate(() => document.body.innerText);
  console.log('=== 全文长度', full.length, '===');
  console.log('含「谁是卧底」?', full.includes('谁是卧底'));
  console.log('含「狼人杀」?', full.includes('狼人杀'));
  console.log('含「UNO」?', full.toUpperCase().includes('UNO'));
  console.log('含「斗地主」?', full.includes('斗地主'));

  const sels = ['.game-home-page', '.game-card', '.home-brand', '.werewolf-wing', '.tabletop-shell'];
  const counts = {};
  for (const s of sels) counts[s] = await page.locator(s).count();
  console.log('\n=== 旧测试使用的选择器命中数 ===');
  console.log(JSON.stringify(counts, null, 2));

  // 列出页面上所有可点击的游戏名（候选新结构）
  const heads = await page.evaluate(() =>
    Array.from(document.querySelectorAll('h1,h2,h3,h4,button')).map((e) => (e.textContent || '').trim()).filter((t) => t.length > 1 && t.length < 14).slice(0, 40)
  );
  console.log('\n=== 页面标题/按钮文案（前 40）===');
  console.log(JSON.stringify([...new Set(heads)], null, 0));

  await browser.close();
  server.kill('SIGTERM');
})().catch((e) => { console.error('FAILED', e); server.kill('SIGTERM'); process.exit(1); });