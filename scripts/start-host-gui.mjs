#!/usr/bin/env node
/**
 * 聚乐桌游 · 局域网独立主机启动脚本 (PC Host)
 * 自动分析本机 Wi-Fi / 热点网卡，启动 HTTP + WebSocket 服务，并在控制台输出连网二维码与自动打开浏览器大屏。
 */
import { spawn, execSync, exec } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

// 1. 检查依赖与前端构建产物
const nodeModules = resolve(root, 'node_modules');
if (!existsSync(nodeModules)) {
  console.log('⚡ 首次运行，正在自动安装项目依赖，请稍候...');
  execSync('npm install', { cwd: root, stdio: 'inherit' });
}

const clientDist = resolve(root, 'packages/client/dist/index.html');
if (!existsSync(clientDist)) {
  console.log('⚡ 检测到前端构建产物缺失，正在自动执行打包...');
  execSync('npm run build', { cwd: root, stdio: 'inherit' });
}

console.log('\n========================================================');
console.log('   🎮 聚乐桌游 · 局域网独立主机服务器 (PC Host Server)');
console.log('   · 免外网 0 流量 · 局域网/热点极速联机 · 手机即专属手牌');
console.log('   · 电脑端专属：超大桌台看板 + 局域网二维码即刻展示');
console.log('========================================================\n');

function openBrowser(url) {
  const platform = process.platform;
  try {
    if (platform === 'win32') {
      // Windows: 优先使用 start URL，若出错回退 rundll32 与 PowerShell Start-Process
      exec(`start ${url}`, (err1) => {
        if (err1) {
          exec(`rundll32 url.dll,FileProtocolHandler "${url}"`, (err2) => {
            if (err2) {
              exec(`powershell -NoProfile -Command "Start-Process '${url}'"`);
            }
          });
        }
      });
    } else if (platform === 'darwin') {
      exec(`open "${url}"`);
    } else {
      exec(`xdg-open "${url}"`);
    }
  } catch {
    // 忽略无法自动打开浏览器的场景
  }
}

// 2. 直接使用 Node 启动服务端（Node 24 原生支持 TypeScript，秒级就绪）
const serverProcess = spawn('node', ['packages/server/src/index.ts'], {
  cwd: root,
  stdio: 'inherit',
  env: {
    ...process.env,
  },
});

let browserOpened = false;

// 3. 轮询本地端口直至服务就绪，自动调起浏览器
async function checkAndOpenBrowser() {
  const ports = [8080, 8081, 8082, 3000];
  const startTime = Date.now();

  while (Date.now() - startTime < 60_000 && !browserOpened) {
    await new Promise((r) => setTimeout(r, 400));
    for (const port of ports) {
      try {
        const res = await fetch(`http://127.0.0.1:${port}/health/live`, { signal: AbortSignal.timeout(500) });
        if (res.ok && !browserOpened) {
          browserOpened = true;
          const hostUrl = `http://localhost:${port}`;
          console.log(`\n🚀 [主机已就绪] 正在自动在默认浏览器中打开主机大屏：${hostUrl}`);
          console.log(`👉 提示：若浏览器未自动弹出，您可直接在浏览器访问：${hostUrl}\n`);
          openBrowser(hostUrl);
          return;
        }
      } catch {
        // 服务还未就绪，继续尝试
      }
    }
  }
}

void checkAndOpenBrowser();

serverProcess.on('exit', (code) => {
  console.log(`\n主机服务已停止 (退出码: ${code ?? 0})`);
  process.exit(code ?? 0);
});

process.on('SIGINT', () => {
  serverProcess.kill('SIGINT');
  process.exit(0);
});

process.on('SIGTERM', () => {
  serverProcess.kill('SIGTERM');
  process.exit(0);
});

