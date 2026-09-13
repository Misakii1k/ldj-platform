/**
 * 启动入口（FR-BOOT-001/002/004）。
 * 前台运行；SIGINT/SIGTERM 优雅停止；启动失败以非零退出码结束。
 */
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import qrcode from 'qrcode-terminal';
import { Bonjour, type Service } from 'bonjour-service';
import { loadConfig } from './config.ts';
import { createLogger } from './boot/logger.ts';
import { startPerfStats } from './boot/perfStats.ts';
import { buildEntryUrls } from './boot/lan.ts';
import { createApp, SERVER_VERSION } from './app.ts';

// APP 内嵌运行时由原生层注入 CLIENT_DIST_DIR；常规部署自动检测多级候选路径。
const clientDist = resolveClientDist();

function resolveClientDist(): string | undefined {
  if (process.env.CLIENT_DIST_DIR) {
    const custom = resolve(process.env.CLIENT_DIST_DIR);
    if (existsSync(custom)) return custom;
  }

  const candidates: string[] = [];

  try {
    const here = typeof __dirname !== 'undefined'
      ? __dirname
      : dirname(fileURLToPath(import.meta.url));
    candidates.push(
      resolve(here, '../../client/dist'),
      resolve(here, '../client/dist'),
      resolve(here, '../../packages/client/dist'),
      resolve(here, '../packages/client/dist'),
      resolve(here, 'client-dist'),
      resolve(here, 'client/dist'),
      resolve(here, '../client-dist'),
      resolve(here, 'android-assets/apphost/client-dist'),
    );
  } catch {
    // 打包为 CJS 时 import.meta.url 不可用
  }

  candidates.push(
    resolve(process.cwd(), 'packages/client/dist'),
    resolve(process.cwd(), '../client/dist'),
    resolve(process.cwd(), 'client-dist'),
    resolve(process.cwd(), 'client/dist'),
    resolve(process.cwd(), 'build/app-host/android-assets/apphost/client-dist'),
    resolve('packages/client/dist'),
  );

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return undefined;
}

/** 把实际监听端口与入口地址写给宿主（APP 原生层轮询读取；端口冲突自动换端口后以此为准） */
function writeBootInfo(dataDir: string | undefined, port: number, urls: ReturnType<typeof buildEntryUrls>, logger: ReturnType<typeof createLogger>): void {
  if (dataDir === undefined) return;
  try {
    mkdirSync(dataDir, { recursive: true });
    writeFileSync(resolve(dataDir, 'boot.json'), JSON.stringify({
      pid: process.pid,
      version: SERVER_VERSION,
      startedAt: new Date().toISOString(),
      port,
      local: urls.local,
      lan: urls.lan,
      qrTarget: urls.qrTarget,
      primaryType: urls.primaryType,
    }, null, 2));
  } catch (err) {
    logger.warn('boot_info_write_failed', { message: (err as Error).message });
  }
}

/** 停机/启动失败时删除 boot.json，避免宿主读到陈旧端口与地址误判"运行中" */
function removeBootInfo(dataDir: string | undefined): void {
  if (dataDir === undefined) return;
  try {
    rmSync(resolve(dataDir, 'boot.json'), { force: true });
  } catch {
    // 清理失败不影响停机
  }
}

// 嵌入运行时（APP 内嵌 node）的最后一道防线：请求级错误已有各自的 try/catch，
// 但仍不允许任何未捕获异常/拒绝击穿进程——LAN 上一个畸形请求不该干掉整局游戏。
process.on('uncaughtException', (err) => {
  console.error('uncaught_exception', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('unhandled_rejection', reason);
});

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config.logLevel, { app: 'ldj-server', version: SERVER_VERSION });

  // NFR-005/006：仅 PERF_STATS_INTERVAL_MS 设置时向 stdout 输出采样，供压测解析
  startPerfStats();
  if (clientDist) {
    logger.info('client_dist_resolved', { clientDist });
  } else {
    logger.warn('client_dist_not_found', { message: '未找到前端静态构建产物目录，将回退至占位页' });
  }

  const app = createApp(config, logger, clientDist);
  await app.listen();

  const urls = buildEntryUrls(app.port(), config.publicBaseUrl);
  writeBootInfo(config.dataDir, app.port(), urls, logger);
  logger.info('server_started', { port: app.port(), local: urls.local, lan: urls.lan });

  // mDNS 局域网自动发现（_ldj._tcp）；MDNS_DISABLE=1 可关闭
  let mdnsService: Service | null = null;
  let mdns: Bonjour | null = null;
  if (process.env.MDNS_DISABLE !== '1') {
    try {
      mdns = new Bonjour();
      mdnsService = mdns.publish({
        name: 'ldj-server',
        type: 'ldj',
        port: app.port(),
        txt: { app: 'ldj-platform', version: SERVER_VERSION },
      });
      logger.info('mdns_published', { type: 'ldj', port: app.port() });
    } catch (err) {
      logger.warn('mdns_publish_failed', { message: (err as Error).message });
    }
  }

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
    try {
      mdnsService?.stop();
      mdns?.destroy();
    } catch {
      // mDNS 清理失败不影响停机
    }
    void app
      .shutdown()
      .then(() => {
        removeBootInfo(config.dataDir);
        process.exit(0);
      })
      .catch((err: unknown) => {
        logger.error('shutdown_failed', { message: (err as Error).message });
        removeBootInfo(config.dataDir);
        process.exit(1);
      });
  };
  process.on('SIGINT', () => stop('SIGINT'));
  process.on('SIGTERM', () => stop('SIGTERM'));
}

main().catch((err: unknown) => {
  console.error('启动失败：', (err as Error).message);
  try {
    removeBootInfo(loadConfig().dataDir);
  } catch {
    // 配置本身非法时无法取得 dataDir，跳过清理
  }
  process.exit(1);
});
