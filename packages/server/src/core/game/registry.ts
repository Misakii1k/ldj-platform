/** 游戏模块注册表：按 (gameId, rulesetId) 元组解析（D4-F1）。
 *  历史模块与已迁移的版本化模块并行注册；同一 game 可同时承载 legacy 与新规则集。 */
import type { AnyGameModuleV2, GameModule } from '@ldj/shared';
import { resolveRulesetIdentity } from '@ldj/shared';
import {
  undercoverModule,
  undercoverVersionedModule,
  blankModule,
} from '@ldj/game-undercover/server';
import { unoVersionedModule, unoHouseModule } from '@ldj/game-uno/server';
import { landlordModule } from '@ldj/game-landlord/server';
import { werewolfModule } from '@ldj/game-werewolf/server';
import type { SessionRow } from './session.ts';

export type ErasedGameModule = GameModule<unknown, unknown, unknown, unknown, unknown, unknown, unknown>;
export type RegisteredGameModule = ErasedGameModule | AnyGameModuleV2;

/** legacy 模块的规则集别名：迁移回填与恢复期按此把 module_id 归一化为权威 ruleset_id。
 *  狼人杀 legacy 模块同时承载两个已注册规则集（config.rulesetId 区分），因此注册两条。 */
const LEGACY_RULESET_ALIASES: Readonly<Record<string, readonly string[]>> = {
  landlord: ['landlord_legacy_platform_v1'],
  werewolf: ['werewolf_legacy_platform_v2', 'werewolf_platform_open_kill_v1'],
};

const MODULES: RegisteredGameModule[] = [
  undercoverVersionedModule,
  blankModule,
  unoVersionedModule,
  unoHouseModule,
  landlordModule,
  werewolfModule,
];

function keyOf(gameId: string, rulesetId: string): string {
  return `${gameId}\u0000${rulesetId}`;
}

const REGISTRY = new Map<string, RegisteredGameModule>();
for (const module of MODULES) {
  const gameId = module.manifest.id;
  const rulesets =
    'identity' in module
      ? (module.registeredRulesets ?? [module.identity.rulesetId])
      : (LEGACY_RULESET_ALIASES[gameId] ?? []);
  if (rulesets.length === 0) throw new Error(`模块 ${gameId} 没有声明规则集`);
  for (const rulesetId of rulesets) {
    const key = keyOf(gameId, rulesetId);
    if (REGISTRY.has(key)) throw new Error(`重复注册 (${gameId}, ${rulesetId})`);
    REGISTRY.set(key, module);
  }
}

export const DEFAULT_GAME_ID = undercoverModule.manifest.id;

export function getDefaultRuleset(gameId: string): string {
  const module = MODULES.find((m) => m.manifest.id === gameId);
  if ('identity' in (module ?? {}) && typeof (module as AnyGameModuleV2).defaultRulesetId === 'string') {
    return (module as AnyGameModuleV2).defaultRulesetId;
  }
  const fallback = LEGACY_RULESET_ALIASES[gameId]?.[0];
  if (fallback !== undefined) return fallback;
  throw new Error(`游戏 ${gameId} 没有默认规则集`);
}

/** 按 (gameId, rulesetId) 精确解析；省略 rulesetId 时用该游戏默认规则集（兼容旧调用）。 */
export function getGameModule(gameId: string, rulesetId?: string): RegisteredGameModule | undefined {
  const resolved = rulesetId ?? getDefaultRuleset(gameId);
  return REGISTRY.get(keyOf(gameId, resolved));
}

/** 会话级解析：以持久化 ruleset_id 为权威，绝不使用当前目录默认值猜测历史会话。 */
export function getSessionGameModule(session: SessionRow): RegisteredGameModule | undefined {
  if (session.ruleset_id === undefined || session.ruleset_id === null || session.ruleset_id === '') {
    return undefined;
  }
  return getGameModule(session.module_id, session.ruleset_id);
}

/** 开局配置 → 权威规则集：config.rulesetId 已注册则采用，否则使用游戏默认。 */
export function resolveRulesetForStart(
  gameId: string,
  config: unknown,
): string {
  // 一个游戏可并行注册多个规则集模块（classic + blank、uno 双模块等）；
  // 开局解析须聚合该游戏全部模块声明的规则集，而非只看默认模块。
  const registered: string[] = [];
  for (const module of MODULES) {
    if (module.manifest.id !== gameId) continue;
    registered.push(
      ...('identity' in module
        ? (module.registeredRulesets ?? [module.identity.rulesetId])
        : (LEGACY_RULESET_ALIASES[gameId] ?? [])),
    );
  }
  if (registered.length === 0) throw new Error(`未注册的游戏模块：${gameId}`);
  return resolveRulesetIdentity(
    config as { rulesetId?: unknown } | null | undefined,
    registered,
    getDefaultRuleset(gameId),
  );
}

export function listGameManifests(): RegisteredGameModule['manifest'][] {
  // 一个游戏可并行注册多个规则集模块（如 undercover classic + blank、uno 双模块）；
  // 目录按游戏去重，保留首个注册模块的 manifest。
  const seen = new Set<string>();
  const manifests: RegisteredGameModule['manifest'][] = [];
  for (const module of MODULES) {
    if (seen.has(module.manifest.id)) continue;
    seen.add(module.manifest.id);
    manifests.push(module.manifest);
  }
  return manifests;
}
