/**
 * E2E 共享运行环境常量。
 * playwright.config.ts 与各 spec 各自进程导入同一模块，保证 webServer 与测试指向同一套
 * 端口 / DATA_DIR / 数据库路径。
 */
import { fileURLToPath } from 'node:url';

/** 仓库根目录（D:\项目） */
export const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));
/** e2e 目录 */
export const E2E_DIR = fileURLToPath(new URL('..', import.meta.url));

/** E2E 服务端口（与执行计划约定一致） */
export const BASE_URL = 'http://127.0.0.1:3178';
export const WS_URL = 'ws://127.0.0.1:3178/ws';

/** 每次运行前由 start-server.mjs 清空的临时数据目录（不配任何 LLM env → llmAvailable=false） */
export const DATA_DIR = `${E2E_DIR}.tmp-data`;
export const DB_PATH = `${DATA_DIR}/platform.db`;

/** 浏览器 localStorage 里的会话键（对应 client connection/types.ts ME_STORAGE_KEY） */
export const ME_STORAGE_KEY = 'ldj:session';

/** 浏览器加入房间用的「会话」对象结构（对应 client connection/types.ts Me） */
export interface BrowserMe {
  playerId: string;
  resumeToken: string;
  roomCode: string;
  nickname: string;
  seatRole: 'player' | 'spectator';
}
