import { createRequire } from 'module';
import { rmSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';

const require = createRequire(path.resolve(process.cwd(), 'package.json'));
const { chromium } = require('playwright');

const REPO = path.resolve('D:/项目');
const DATA_DIR = path.join(REPO, 'e2e/.tmp-data-probe');
rmSync(DATA_DIR, { recursive: true, force: true });

console.log('启动服务端（端口 3178）...');
const server = spawn(process.execPath, ['packages/server/src/index.ts'], {
  cwd: REPO,
  stdio: ['ignore', 'pipe', 'pipe'],
  env: {
    ...process.env,
    PORT: '3178',
    DATA_DIR,
    LOG_LEVEL: 'warn',
    E2E_JOIN_LIMIT_MAX: '1000',
    NO_PROXY: '127.0.0.1,localhost',
  },
});
server.stderr.on('data', (d) => process.stderr.write('[srv] ' + d));

async function waitForHealth(baseUrl, timeoutMs = 30_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(`${baseUrl}/health/live`);
      if (r.ok) return;
    } catch {
      // 服务尚未启动完成，继续轮询重试
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('服务未在 ' + timeoutMs + 'ms 内就绪');
}

const BASE = 'http://127.0.0.1:3178';

(async () => {
  await waitForHealth(BASE);
  console.log('服务已就绪。');

  const browser = await chromium.launch({ args: ['--no-proxy-server'] });

  // ---- Probe A：默认行为（无 sessionStorage 预置）----
  console.log('\n[Probe A] 浏览器未预置 ldj_pc_host_entered');
  const ctxA = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const pageA = await ctxA.newPage();
  await pageA.goto(BASE);
  await pageA.waitForTimeout(800);
  const aBody = await pageA.evaluate(() => document.body.innerText.slice(0, 220));
  const aHasWho = aBody.includes('谁是卧底');
  const aHasHost = aBody.includes('聚乐桌游') && (aBody.includes('桌面大屏') || aBody.includes('电脑主机') || aBody.includes('进入大厅'));
  console.log('  body 前 220 字:', JSON.stringify(aBody));
  console.log('  → 含「谁是卧底」?', aHasWho, '| 含「主机入口」?', aHasHost);
  await pageA.screenshot({ path: 'C:/Users/87850/.workbuddy-ai/tmp/probe-A-default.png' });
  await ctxA.close();

  // ---- Probe B：测试侧方案 addInitScript 预置 ----
  console.log('\n[Probe B] 浏览器预置 ldj_pc_host_entered=true');
  const ctxB = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await ctxB.addInitScript(() => sessionStorage.setItem('ldj_pc_host_entered', 'true'));
  const pageB = await ctxB.newPage();
  await pageB.goto(BASE);
  await pageB.waitForTimeout(800);
  const bBody = await pageB.evaluate(() => document.body.innerText.slice(0, 220));
  const bHasWho = bBody.includes('谁是卧底');
  const bHasHost = bBody.includes('聚乐桌游') && (bBody.includes('桌面大屏') || bBody.includes('电脑主机') || bBody.includes('进入大厅'));
  console.log('  body 前 220 字:', JSON.stringify(bBody));
  console.log('  → 含「谁是卧底」?', bHasWho, '| 含「主机入口」?', bHasHost);
  await pageB.screenshot({ path: 'C:/Users/87850/.workbuddy-ai/tmp/probe-B-fixed.png' });
  await ctxB.close();

  await browser.close();

  console.log('\n=== 结论 ===');
  console.log('根因 A 证实:', !aHasWho && aHasHost ? '是（默认行为会落在主机入口）' : '否（默认已显示游戏首页，根因 A 失效）');
  console.log('方案 1 (test-side addInitScript) 解锁游戏首页:', bHasWho && !bHasHost ? '是（17 个用例可恢复）' : '否（仍卡主机入口或游戏首页未渲染）');

  // Stop server
  server.kill('SIGTERM');
})().catch(async (e) => {
  console.error('FAILED', e);
  server.kill('SIGTERM');
  process.exit(1);
});