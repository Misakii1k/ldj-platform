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

/**
 * 清空临时数据目录。
 * Windows 上若上一轮运行留下的服务端进程/杀软仍持有 sqlite 句柄，rmSync 会抛 EPERM；
 * 此时重试若干次，仍失败则带警告继续启动：每个用例都会 seed 全新随机房间，
 * 残留旧库不会影响断言，比让整个 E2E 跑不起来更可取。
 */
function clearDataDir(dir) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      rmSync(dir, { recursive: true, force: true });
      return;
    } catch (err) {
      if (attempt === 4) {
        console.warn(`[start-server] 清理 ${dir} 失败（${err.code}），沿用既有数据目录继续启动`);
        return;
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250 * (attempt + 1));
    }
  }
}

clearDataDir(DATA_DIR);

const child = spawn(process.execPath, ['packages/server/src/index.ts'], {
  cwd: REPO_ROOT,
  stdio: 'inherit',
  env: {
    ...process.env,
    PORT: '3178',
    DATA_DIR,
    LOG_LEVEL: 'warn',
    // E2E 套件会大量 resume/join（全套件远超 10 次/分钟/IP 的生产限流）：
    // 放宽 join 限流配额，避免 CI 连跑被限流击穿。
    E2E_JOIN_LIMIT_MAX: '1000',
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
