#!/usr/bin/env node
/**
 * 聚乐桌 · 局域网独立主机一键启动脚本
 * 自动分析本机 Wi-Fi / 热点网卡，启动 HTTP + WebSocket 服务，并在控制台输出连网二维码。
 */
import { spawn } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

console.log('\n🎮 =========================================');
console.log('   聚乐桌 · 局域网桌游独立主机 (Host Server)  ');
console.log('   0 流量免装 APP · 扫码即玩 · 手机热点支持   ');
console.log('=========================================\n');

const serverProcess = spawn('npx', ['tsx', 'packages/server/src/index.ts'], {
  cwd: root,
  stdio: 'inherit',
  shell: true,
  env: {
    ...process.env,
  },
});

serverProcess.on('exit', (code) => {
  console.log(`主机服务已退出 (code: ${code})`);
});
