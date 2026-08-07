/**
 * 版本化游戏视角解析注册表（D3 Task 9，D5 P1a 扩展）。
 * 以 moduleId + rulesetId + viewVersion 判别：只有注册的组合才走严格解析，
 * 未注册的 V2 游戏组合失败关闭；legacy 斗地主/狼人杀无判别符时保持兼容透传。
 */
import { parseUndercoverView } from './undercover/types.ts';
import { parseBlankView } from './undercover/types.ts';
import { parseUnoView } from './uno/types.ts';
import { parseUnoHouseView } from './uno/types.ts';
import { parseWerewolfView } from './werewolf/types.ts';
import { parseLandlordPlatformView } from './landlord/types.ts';
import type { GameStatePayload } from './types.ts';

interface GameViewParser {
  parsePlayerView(view: unknown): unknown | null;
  parseSpectatorView(view: unknown): unknown | null;
}

const REGISTRY: Readonly<Record<string, GameViewParser>> = {
  'undercover:undercover_classic_v1:1': {
    parsePlayerView: (view) => parseUndercoverView(view, 'player'),
    parseSpectatorView: (view) => parseUndercoverView(view, 'spectator'),
  },
  'undercover:undercover_blank_v1:1': {
    parsePlayerView: (view) => parseBlankView(view, 'player'),
    parseSpectatorView: (view) => parseBlankView(view, 'spectator'),
  },
  'uno:uno_legacy_platform_v1:1': {
    parsePlayerView: (view) => parseUnoView(view, 'player'),
    parseSpectatorView: (view) => parseUnoView(view, 'spectator'),
  },
  'uno:uno_platform_house_v1:1': {
    parsePlayerView: (view) => parseUnoHouseView(view, 'player'),
    parseSpectatorView: (view) => parseUnoHouseView(view, 'spectator'),
  },
  'werewolf:werewolf_platform_open_kill_v1:1': {
    parsePlayerView: (view) => parseWerewolfView(view, 'player'),
    parseSpectatorView: (view) => parseWerewolfView(view, 'spectator'),
  },
  'landlord:landlord_platform_v1:1': {
    parsePlayerView: (view) => parseLandlordPlatformView(view, 'player'),
    parseSpectatorView: (view) => parseLandlordPlatformView(view, 'spectator'),
  },
};

/** 已迁移到 V2 的游戏：缺失版本化判别符时必须失败关闭，不能静默降级。 */
const VERSIONED_MODULE_IDS = new Set(['undercover', 'uno']);

export type ViewParseResult =
  | { ok: true; view: unknown }
  | { ok: false };

export function parseGameView(payload: GameStatePayload): ViewParseResult {
  // 版本化判别符（engineContractVersion + viewVersion + rulesetId）决定是否走严格解析。
  // 狼人是混合模块：v2（open-kill）会话携带判别符 → 严格解析；legacy 会话缺失判别符 → 透传。
  const hasVersionedDiscriminator =
    payload.engineContractVersion === 2
    && typeof payload.viewVersion === 'number'
    && typeof payload.rulesetId === 'string';
  if (!hasVersionedDiscriminator) {
    if (VERSIONED_MODULE_IDS.has(payload.moduleId)) {
      // 已迁移的 V2 游戏缺失版本化判别符：失败关闭，不能静默降级。
      return { ok: false };
    }
    // legacy（斗地主/狼人杀）无版本化判别符时保持现有兼容路径。
    return { ok: true, view: payload.view };
  }
  const parser = REGISTRY[`${payload.moduleId}:${payload.rulesetId}:${payload.viewVersion}`];
  if (parser === undefined) return { ok: false };
  const parsed = payload.role === 'player'
    ? parser.parsePlayerView(payload.view)
    : parser.parseSpectatorView(payload.view);
  return parsed === null ? { ok: false } : { ok: true, view: parsed };
}
