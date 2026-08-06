/**
 * Playwright webServer 启动器：
 * 先清空 E2E 临时数据目录（保证每次运行全新数据库），再以本仓库真实入口启动服务端。
 * 实际服务端进程仍是 `node packages/server/src/index.ts`，本脚本只做目录准备与子进程托管。
 * 刻意不配任何 LLM 环境变量：服务端 llmAvailable=false，机器人一律走规则模式，
 * 自动化全程零真实供应商模型调用。
 */
import { rmSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));
// 与 serverEnv.ts 的 DATA_DIR 保持同一定义：`e2e/.tmp-data`
const DATA_DIR = fileURLToPath(new URL('../.tmp-data', import.meta.url));

rmSync(DATA_DIR, { recursive: true, force: true });

const child = spawn(process.execPath, ['packages/server/src/index.ts'], {
  cwd: REPO_ROOT,
  stdio: 'inherit',
  env: {
    ...process.env,
    PORT: '3178',
    DATA_DIR,
    LOG_LEVEL: 'warn',
  },
});

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 1);
});
child.on('error', (err) => {
  console.error('E2E 服务端启动失败：', err);
  process.exit(1);
});

function forward(signal) {
  child.kill(signal);
}
process.on('SIGTERM', () => forward('SIGTERM'));
process.on('SIGINT', () => forward('SIGINT'));
