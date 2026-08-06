/**
 * game_state 公共载荷与谁是卧底视角兼容出口（D3 Task 9 收敛后）。
 * 严格解析器已下沉到 game/undercover/types.ts 与 game/uno/types.ts，
 * 这里只保留游戏无关的 payload 校验与旧引用出口。
 */

export type {
  GameReveal,
  PlayerSelfView,
  PublicPlayerInfo,
  UndercoverPhase,
  UndercoverPlayerView,
  UndercoverRole,
  VoteSummary,
} from './undercover/types.ts';

import { parseUndercoverView } from './undercover/types.ts';
import type { UndercoverPlayerView } from './undercover/types.ts';
import { parseTabletopView, TABLETOP_VIEW_VERSION, type StandardTabletopViewV1 } from '@ldj/shared';

// —— 轻量运行时类型守卫（不引入 zod，避免新增依赖） ——

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isString(v: unknown): v is string {
  return typeof v === 'string';
}

function isNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/** game_state envelope 的 payload 结构（与服务端 views.ts 对齐） */
export interface GameStatePayload {
  sessionId: string;
  moduleId: string;
  status: string;
  role: 'player' | 'spectator';
  rulesetId?: string;
  engineContractVersion?: number;
  viewVersion?: number;
  /** D4-T：模块声明桌面契约时下发标准桌面视角 */
  tabletopVersion?: number;
  tabletop?: StandardTabletopViewV1;
  view: unknown;
}

/** 解析 game_state payload；失败返回 null（客户端降级显示） */
export function parseGameStatePayload(v: unknown): GameStatePayload | null {
  if (!isObject(v)) return null;
  const {
    sessionId,
    moduleId,
    status,
    role,
    rulesetId,
    engineContractVersion,
    viewVersion,
    tabletopVersion,
    tabletop,
    view,
  } = v;
  if (!isString(sessionId) || !isString(moduleId) || !isString(status)) return null;
  if (role !== 'player' && role !== 'spectator') return null;
  if (rulesetId !== undefined && !isString(rulesetId)) return null;
  if (engineContractVersion !== undefined && !isNumber(engineContractVersion)) return null;
  if (viewVersion !== undefined && !isNumber(viewVersion)) return null;
  // D4-T：声明桌面契约的帧必须携带合法标准视角，非法即失败关闭。
  let parsedTabletop: StandardTabletopViewV1 | undefined;
  if (tabletop !== undefined) {
    if (!isNumber(tabletopVersion) || tabletopVersion !== TABLETOP_VIEW_VERSION) return null;
    try {
      parsedTabletop = parseTabletopView(tabletop);
    } catch {
      return null;
    }
  }
  return {
    sessionId,
    moduleId,
    status,
    role,
    ...(rulesetId === undefined ? {} : { rulesetId }),
    ...(engineContractVersion === undefined ? {} : { engineContractVersion }),
    ...(viewVersion === undefined ? {} : { viewVersion }),
    ...(parsedTabletop === undefined
      ? {}
      : { tabletopVersion: TABLETOP_VIEW_VERSION, tabletop: parsedTabletop }),
    view,
  };
}

/** 兼容出口：UI 侧按卧底玩家视角消费（渲染层再校验一次，双保险） */
export function asPlayerView(view: unknown): UndercoverPlayerView | null {
  const parsed = parseUndercoverView(view, 'player');
  if (parsed === null) return null;
  if ('me' in parsed) return parsed;
  return { ...parsed, me: null };
}
