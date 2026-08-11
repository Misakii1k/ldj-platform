/**
 * 启动入口（FR-BOOT-001/002/004）。
 * 前台运行；SIGINT/SIGTERM 优雅停止；启动失败以非零退出码结束。
 */
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import qrcode from 'qrcode-terminal';
import { loadConfig } from './config.ts';
import { createLogger } from './boot/logger.ts';
import { startPerfStats } from './boot/perfStats.ts';
import { buildEntryUrls } from './boot/lan.ts';
import { createApp, SERVER_VERSION } from './app.ts';

const here = dirname(fileURLToPath(import.meta.url));
const clientDist = resolve(here, '../../client/dist');

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config.logLevel, { app: 'ldj-server', version: SERVER_VERSION });

  // NFR-005/006：仅 PERF_STATS_INTERVAL_MS 设置时向 stdout 输出采样，供压测解析
  startPerfStats();

  const app = createApp(config, logger, existsSync(clientDist) ? clientDist : undefined);
  await app.listen();

  const urls = buildEntryUrls(app.port(), config.publicBaseUrl);
  logger.info('server_started', { port: app.port(), local: urls.local, lan: urls.lan });

  // 面向主机操作者的入口信息（非结构化，方便扫码）
  console.log('\n=== 局域网桌游平台已启动 ===');
  console.log(`本机访问：${urls.local}`);
  if (urls.lan.length === 0) {
    console.log('未检测到局域网地址；其他设备可能无法访问（检查网络连接）');
  } else {
    for (const url of urls.lan) console.log(`局域网访问：${url}`);
    if (urls.lan.length > 1) {
      console.log('检测到多个网卡；可用 PUBLIC_BASE_URL 环境变量指定二维码地址');
    }
  }
  console.log(`\n手机扫码加入（${urls.qrTarget}）：`);
  qrcode.generate(urls.qrTarget, { small: true });
  console.log('按 Ctrl+C 停止服务\n');

  const stop = (signal: string): void => {
    logger.info('signal_received', { signal });
    void app
      .shutdown()
      .then(() => process.exit(0))
      .catch((err: unknown) => {
        logger.error('shutdown_failed', { message: (err as Error).message });
        process.exit(1);
      });
  };
  process.on('SIGINT', () => stop('SIGINT'));
  process.on('SIGTERM', () => stop('SIGTERM'));
}

main().catch((err: unknown) => {
  console.error('启动失败：', (err as Error).message);
  process.exit(1);
});
