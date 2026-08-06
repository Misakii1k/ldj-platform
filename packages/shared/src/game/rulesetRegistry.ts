/**
 * 共享规则集注册表（D4-F1）。
 *
 * 纯函数与类型实现：无 I/O、不依赖 zod。
 * - 目录层用它校验每个游戏的规则集声明（非空、每游戏唯一、必须有默认）；
 * - 服务端用它把 config.rulesetId 归一化为模块注册过的规则集。
 */

export type RulesetKind = 'legacy_compatibility' | 'platform_variant';

export interface GameRulesetEntry {
  readonly gameId: string;
  readonly rulesetId: string;
  readonly kind: RulesetKind;
  readonly defaultForGame: boolean;
}

export interface RulesetRegistry {
  /** 注册表条目的不可变快照（与输入数组相互独立）。 */
  readonly entries: readonly GameRulesetEntry[];
  /** 按游戏返回全部条目；未知游戏返回空数组。 */
  byGame(gameId: string): readonly GameRulesetEntry[];
  /** 解析 (gameId, rulesetId)；未注册则抛错。 */
  resolve(gameId: string, rulesetId: string): GameRulesetEntry;
  /** 返回游戏的默认规则集 ID；未注册则抛错。 */
  defaultRulesetId(gameId: string): string;
}

function assertNonEmptyString(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${label}不能为空`);
  }
}

export function buildRulesetRegistry(entries: readonly GameRulesetEntry[]): RulesetRegistry {
  if (!Array.isArray(entries)) {
    throw new TypeError('规则集注册表需要条目数组');
  }

  const frozenEntries: readonly GameRulesetEntry[] = Object.freeze(
    entries.map((entry) => Object.freeze({ ...entry })),
  );

  const byGameMap = new Map<string, readonly GameRulesetEntry[]>();
  const defaultIds = new Map<string, string>();
  const seen = new Set<string>();

  for (const entry of frozenEntries) {
    assertNonEmptyString(entry.gameId, '游戏 ID');
    assertNonEmptyString(entry.rulesetId, '规则集 ID');
    const key = `${entry.gameId}\u0000${entry.rulesetId}`;
    if (seen.has(key)) {
      throw new Error(`重复规则集条目：游戏 ${entry.gameId} 已注册 ${entry.rulesetId}`);
    }
    seen.add(key);
    const current = byGameMap.get(entry.gameId) ?? [];
    byGameMap.set(entry.gameId, Object.freeze([...current, entry]));
    if (entry.defaultForGame) {
      if (defaultIds.has(entry.gameId)) {
        throw new Error(`游戏 ${entry.gameId} 声明了多个默认规则集`);
      }
      defaultIds.set(entry.gameId, entry.rulesetId);
    }
  }

  for (const gameId of byGameMap.keys()) {
    const list = byGameMap.get(gameId) ?? [];
    if (list.length === 0) {
      throw new Error(`游戏 ${gameId} 出现但没有规则集条目`);
    }
    if (!defaultIds.has(gameId)) {
      throw new Error(`游戏 ${gameId} 缺少默认规则集`);
    }
  }

  return {
    entries: frozenEntries,
    byGame(gameId) {
      return byGameMap.get(gameId) ?? [];
    },
    resolve(gameId, rulesetId) {
      const found = byGameMap.get(gameId)?.find((entry) => entry.rulesetId === rulesetId);
      if (found === undefined) {
        throw new Error(`规则集 ${rulesetId} 未注册到游戏 ${gameId}`);
      }
      return found;
    },
    defaultRulesetId(gameId) {
      const defaultId = defaultIds.get(gameId);
      if (defaultId === undefined) {
        throw new Error(`游戏 ${gameId} 未注册默认规则集`);
      }
      return defaultId;
    },
  };
}

export interface RulesetConfigLike {
  readonly rulesetId?: unknown;
}

/**
 * 把开局配置归一化为模块注册过的规则集：
 * - config.rulesetId 为字符串且已注册时返回它；
 * - config.rulesetId 缺省时返回游戏默认规则集；
 * - config.rulesetId 存在但未注册时抛错。
 */
export function resolveRulesetIdentity(
  config: RulesetConfigLike | null | undefined,
  moduleRegisteredRulesets: readonly string[],
  gameDefaultRulesetId: string,
): string {
  const configured = config?.rulesetId;
  if (configured === undefined || configured === null) return gameDefaultRulesetId;
  if (typeof configured !== 'string') {
    throw new Error(`rulesetId 必须是字符串，收到：${String(configured)}`);
  }
  if (moduleRegisteredRulesets.includes(configured)) return configured;
  throw new Error(`规则集 ${configured} 未在模块注册表中声明`);
}

function isRulesetRegistry(value: readonly GameRulesetEntry[] | RulesetRegistry): value is RulesetRegistry {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 便捷函数：列出某款游戏已注册的全部规则集 ID（条目数组或注册表均可作为来源）。 */
export function listRulesetIdsForGame(
  source: readonly GameRulesetEntry[] | RulesetRegistry,
  gameId: string,
): readonly string[] {
  const entries = isRulesetRegistry(source) ? source.entries : source;
  return entries.filter((entry) => entry.gameId === gameId).map((entry) => entry.rulesetId);
}
