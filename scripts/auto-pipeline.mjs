/**
 * Cloudflare Pages 一键部署管线（配合 CDP 调试模式的 Chrome 自动完成 OAuth 授权）。
 *
 * 步骤：
 *  1. wrangler login（自动在已运行的调试 Chrome 中点击 Allow）
 *  2. 确保 Pages 项目存在（项目名取自 wrangler.json）
 *  3. wrangler pages deploy（部署 packages/client/dist 与根目录 functions/ 边缘函数）
 *  4. 线上端点冒烟检查
 *
 * 用法：
 *   node scripts/auto-pipeline.mjs          # 全流程
 *   node scripts/auto-pipeline.mjs login    # 仅执行 OAuth 登录
 *
 * 前置条件：Chrome 以 --remote-debugging-port=9222 启动且已登录 Cloudflare。
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const only = process.argv[2] || '';
const pagesProject = JSON.parse(fs.readFileSync(path.join(root, 'wrangler.json'), 'utf8')).name;

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

async function connectToChrome() {
  const portFile = path.join(process.env.LOCALAPPDATA, 'Google/Chrome/User Data/DevToolsActivePort');
  if (!fs.existsSync(portFile)) {
    throw new Error('未找到 DevToolsActivePort：请先用 --remote-debugging-port=9222 启动 Chrome');
  }
  const lines = fs.readFileSync(portFile, 'utf8').trim().split('\n').map(l => l.trim());
  const wsUrl = 'ws://127.0.0.1:' + lines[0] + lines[1];
  return chromium.connectOverCDP(wsUrl, { timeout: 8000 });
}

async function autoClickAllow(authUrl) {
  const browser = await connectToChrome();
  try {
    const context = browser.contexts()[0];
    const page = await context.newPage();
    await page.goto(authUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
    const btn = page.locator('button:has-text("Allow"), button:has-text("Authorize"), button[type="submit"]').first();
    let clicked = false;
    for (let attempt = 0; attempt < 12 && !clicked; attempt++) {
      await sleep(1500);
      try {
        if (await btn.isVisible({ timeout: 1000 })) {
          console.log('[Auto-Pipeline] 找到授权按钮，自动点击…');
          await btn.click();
          clicked = true;
        }
      } catch {
        // 按钮尚未渲染，继续等待
      }
    }
    if (clicked) {
      console.log('[Auto-Pipeline] 已点击 Allow，等待 wrangler 本地回调…');
      await sleep(3000);
    } else {
      console.log(`[Auto-Pipeline] 未找到授权按钮（页面: ${await page.title().catch(() => '?')} / ${page.url()}）`);
      await page.screenshot({ path: path.join(root, 'cf-oauth.png') }).catch(() => undefined);
      console.log('[Auto-Pipeline] 已保存 cf-oauth.png，请在 Chrome 中手动完成 Cloudflare 授权。');
    }
  } finally {
    await browser.close();
  }
}

function runCommand(cmd, args, timeoutMs) {
  return new Promise((resolve, reject) => {
    console.log(`\n>>> ${cmd} ${args.join(' ')}`);
    const proc = spawn(cmd, args, { shell: true, cwd: root, stdio: 'inherit' });
    const timer = timeoutMs
      ? setTimeout(() => {
          console.error(`[Auto-Pipeline] 命令超时（${timeoutMs / 1000}s），终止：${cmd}`);
          proc.kill();
          reject(new Error('command timeout'));
        }, timeoutMs)
      : null;
    proc.on('exit', code => {
      if (timer) clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`${cmd} 退出码 ${code}`));
    });
    proc.on('error', err => {
      if (timer) clearTimeout(timer);
      reject(err);
    });
  });
}

async function wranglerLogin() {
  console.log('=== Step 1: Wrangler OAuth 登录 ===');
  const proc = spawn('npx', ['wrangler', 'login'], { shell: true, cwd: root });
  let authUrl = '';
  const detectUrl = data => {
    const str = data.toString();
    process.stdout.write(str);
    if (!authUrl) {
      const m = str.match(/https:\/\/dash\.cloudflare\.com\/oauth2\/auth[^\s]*/);
      if (m) {
        authUrl = m[0];
        console.log(`\n[Auto-Pipeline] 检测到 OAuth URL，1.5s 后自动授权：${authUrl}`);
        setTimeout(() => autoClickAllow(authUrl).catch(err => console.log('[Auto-Pipeline] 自动点击失败：', err.message)), 1500);
      }
    }
  };
  proc.stdout?.on('data', detectUrl);
  proc.stderr?.on('data', detectUrl);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      proc.kill();
      reject(new Error('wrangler login 等待授权超时（180s）'));
    }, 180_000);
    proc.on('exit', code => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`wrangler login 退出码 ${code}`));
    });
  });
  await runCommand('npx', ['wrangler', 'whoami']);
}

async function ensureProject() {
  console.log('\n=== Step 2: 确保 Pages 项目存在 ===');
  console.log(`项目名（wrangler.json）：${pagesProject}`);
  await runCommand('npx', ['wrangler', 'pages', 'project', 'create', pagesProject, '--production-branch', 'main'])
    .catch(err => console.log(`[Auto-Pipeline] 项目可能已存在，继续部署（${err.message}）`));
}

async function deploy() {
  console.log('\n=== Step 3: 部署 Cloudflare Pages ===');
  await runCommand('npx', ['wrangler', 'pages', 'deploy'], 300_000);
}

async function smoke() {
  console.log('\n=== Step 4: 线上端点冒烟检查 ===');
  await runCommand('node', ['scripts/check-release-endpoints.mjs'], 120_000);
}

async function main() {
  await wranglerLogin();
  if (only === 'login') return;
  await ensureProject();
  await deploy();
  await smoke();
  console.log(`\n[Auto-Pipeline] 全部完成！线上地址：https://${pagesProject}.pages.dev`);
}

main().catch(err => {
  console.error('[Auto-Pipeline] 管线失败：', err.message);
  process.exit(1);
});
