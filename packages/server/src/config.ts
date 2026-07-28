/** 运行配置（SPEC §13.1：数据目录、端口、公开地址、日志级别通过环境变量设置） */
import { resolve } from 'node:path';

export interface ServerConfig {
  host: string;
  port: number;
  dbPath: string;
  /** 显式覆盖二维码地址（FR-BOOT-002） */
  publicBaseUrl: string | null;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  /** 额外允许的 Origin（开发模式例外，SPEC §9.5） */
  allowedOrigins: string[];
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const port = Number(env.PORT ?? 8080);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`非法端口：${env.PORT}`);
  }
  const dataDir = env.DATA_DIR ?? './data';
  const logLevel = env.LOG_LEVEL ?? 'info';
  if (!['debug', 'info', 'warn', 'error'].includes(logLevel)) {
    throw new Error(`非法日志级别：${logLevel}`);
  }
  return {
    host: env.HOST ?? '0.0.0.0',
    port,
    dbPath: env.DB_PATH ?? resolve(dataDir, 'platform.db'),
    publicBaseUrl: env.PUBLIC_BASE_URL ?? null,
    logLevel: logLevel as ServerConfig['logLevel'],
    allowedOrigins: (env.ALLOWED_ORIGINS ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  };
}
