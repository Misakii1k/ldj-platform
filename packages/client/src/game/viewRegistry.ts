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
import { parseDurianView } from './durian/types.ts';
import { parseLoveLetterView } from './loveletter/types.ts';
import { parseCheeseThiefView } from './cheese-thief/types.ts';
import { parseCheeseThiefSimView } from './cheese-thief/simTypes.ts';
import { parseGooseRelayView } from './goose-relay/types.ts';
import { parseGooseRelaySimView } from './goose-relay/simTypes.ts';
import { parseNightTestimonyView } from './night-testimony/types.ts';
import { parseNightTestimonySimView } from './night-testimony/simTypes.ts';
import { parseBellClashView } from './bell-clash/types.ts';
import { parseBellClashSimView } from './bell-clash/simTypes.ts';
import { parseEchoJudgeView } from './echo-judge/types.ts';
import { parseEchoJudgeSimView } from './echo-judge/simTypes.ts';
import { parseWitsWagersView } from './wits-wagers/types.ts';
import { parseWitsWagersSimView } from './wits-wagers/simTypes.ts';
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
  'uno:uno_platform_house_v1:2': {
    parsePlayerView: (view) => parseUnoHouseView(view, 'player'),
    parseSpectatorView: (view) => parseUnoHouseView(view, 'spectator'),
  },
  'werewolf:werewolf_platform_open_kill_v1:1': {
    parsePlayerView: (view) => parseWerewolfView(view, 'player'),
    parseSpectatorView: (view) => parseWerewolfView(view, 'spectator'),
  },
  'werewolf:werewolf_moderator_v1:1': {
    parsePlayerView: (view) => {
      if (typeof view !== 'object' || view === null || Array.isArray(view)) return null;
      const v = view as Record<string, unknown>;
      return v.rulesetId === 'werewolf_moderator_v1' ? view : null;
    },
    parseSpectatorView: (view) => {
      if (typeof view !== 'object' || view === null || Array.isArray(view)) return null;
      const v = view as Record<string, unknown>;
      return v.rulesetId === 'werewolf_moderator_v1' ? view : null;
    },
  },
  'landlord:landlord_platform_v1:1': {
    parsePlayerView: (view) => parseLandlordPlatformView(view, 'player'),
    parseSpectatorView: (view) => parseLandlordPlatformView(view, 'spectator'),
  },
  'durian:durian_orchard_v1:1': {
    parsePlayerView: (view) => parseDurianView(view, 'player'),
    parseSpectatorView: (view) => parseDurianView(view, 'spectator'),
  },
  'loveletter:loveletter_classic16_v1:2': {
    parsePlayerView: (view) => parseLoveLetterView(view, 'player'),
    parseSpectatorView: (view) => parseLoveLetterView(view, 'spectator'),
  },
  'cheese-thief:cheese_thief_classic_v1:1': {
    parsePlayerView: (view) => parseCheeseThiefView(view, 'player'),
    parseSpectatorView: (view) => parseCheeseThiefView(view, 'spectator'),
  },
  'cheese-thief:cheese_thief_sim_v1:1': {
    parsePlayerView: (view) => parseCheeseThiefSimView(view),
    parseSpectatorView: (view) => parseCheeseThiefSimView(view),
  },
  'goose-relay:goose_relay_classic_v1:2': {
    parsePlayerView: (view) => parseGooseRelayView(view, 'player'),
    parseSpectatorView: (view) => parseGooseRelayView(view, 'spectator'),
  },
  'goose-relay:goose_relay_sim_v1:1': {
    parsePlayerView: (view) => parseGooseRelaySimView(view),
    parseSpectatorView: (view) => parseGooseRelaySimView(view),
  },
  'night-testimony:night_testimony_v1:1': {
    parsePlayerView: (view) => parseNightTestimonyView(view, 'player'),
    parseSpectatorView: (view) => parseNightTestimonyView(view, 'spectator'),
  },
  'night-testimony:night_testimony_sim_v1:1': {
    parsePlayerView: (view) => parseNightTestimonySimView(view),
    parseSpectatorView: (view) => parseNightTestimonySimView(view),
  },
  'bell-clash:bell_clash_v1:1': {
    parsePlayerView: (view) => parseBellClashView(view, 'player'),
    parseSpectatorView: (view) => parseBellClashView(view, 'spectator'),
  },
  'bell-clash:bell_clash_sim_v1:1': {
    parsePlayerView: (view) => parseBellClashSimView(view),
    parseSpectatorView: (view) => parseBellClashSimView(view),
  },
  'echo-judge:echo_judge_v1:1': {
    parsePlayerView: (view) => parseEchoJudgeView(view, 'player'),
    parseSpectatorView: (view) => parseEchoJudgeView(view, 'spectator'),
  },
  'echo-judge:echo_judge_sim_v1:1': {
    parsePlayerView: (view) => parseEchoJudgeSimView(view),
    parseSpectatorView: (view) => parseEchoJudgeSimView(view),
  },
  'wits-wagers:wits_wagers_platform_v1:1': {
    parsePlayerView: (view) => parseWitsWagersView(view, 'player'),
    parseSpectatorView: (view) => parseWitsWagersView(view, 'spectator'),
  },
  'wits-wagers:wits_wagers_sim_v1:1': {
    parsePlayerView: (view) => parseWitsWagersSimView(view),
    parseSpectatorView: (view) => parseWitsWagersSimView(view),
  },
};

/** 已迁移到 V2 的游戏：缺失版本化判别符时必须失败关闭，不能静默降级。 */
const VERSIONED_MODULE_IDS = new Set(['undercover', 'uno', 'durian', 'loveletter', 'cheese-thief', 'goose-relay', 'night-testimony', 'bell-clash', 'echo-judge', 'wits-wagers']);

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
