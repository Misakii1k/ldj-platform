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

/**
 * 浏览器 sessionStorage 里的「电脑主机已进入大厅」标记
 * （对应 client app/AppModeContext.tsx）。
 *
 * 内嵌主机应用上线后，浏览器访问 localhost 默认先渲染主机控制台大屏；
 * E2E 直接验证对局界面，必须预置此标记跳过控制台，否则一切
 * `.tabletop-shell` 断言都会停在主机大屏上超时。
 */
export const PC_HOST_ENTERED_KEY = 'ldj_pc_host_entered';

/**
 * 注入 E2E 所需的浏览器存储：会话身份 + 跳过主机控制台。
 * 所有直接验证对局界面的 spec 都应改用它，避免各自遗漏主机门控。
 */
export async function seedBrowserSession(
  page: { addInitScript(fn: (args: [string, string, string]) => void, args: [string, string, string]): Promise<void> },
  me: Record<string, unknown>,
): Promise<void> {
  await page.addInitScript(
    ([meKey, meValue, hostKey]) => {
      localStorage.setItem(meKey, meValue);
      sessionStorage.setItem(hostKey, 'true');
    },
    [ME_STORAGE_KEY, JSON.stringify({ seatRole: 'player', ...me }), PC_HOST_ENTERED_KEY],
  );
}

/**
 * 只跳过电脑主机控制台大屏，不碰会话身份。
 * 供已有自定义 localStorage 注入逻辑的 spec 追加调用，
 * 避免改动它们各自的 me 结构。必须在 page.goto 之前调用。
 */
export async function skipPcHostConsole(
  page: { addInitScript(fn: (key: string) => void, arg: string): Promise<void> },
): Promise<void> {
  await page.addInitScript((hostKey) => {
    sessionStorage.setItem(hostKey, 'true');
  }, PC_HOST_ENTERED_KEY);
}

/** 浏览器加入房间用的「会话」对象结构（对应 client connection/types.ts Me） */
export interface BrowserMe {
  playerId: string;
  resumeToken: string;
  roomCode: string;
  nickname: string;
  seatRole: 'player' | 'spectator';
}
