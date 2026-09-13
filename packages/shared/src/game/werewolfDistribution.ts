/**
 * 狼人杀阵营分布与安全边界计算（纯函数共享模块）
 *
 * 核心设计：
 * 1. 各人数梯度拥有推荐黄金模板（6–8人 2狼、9–10人 3狼、11–12人 4狼）。
 * 2. 允许房主在安全区间（推荐值 ±1 狼）内微调，且严格满足狼人数 < 总人数的一半。
 * 3. 强制平民保底至少 2 人，防止屠边规则下首夜直接被秒杀崩盘。
 * 4. 记忆偏移（wolfDelta: -1 | 0 | 1），当房间人数变动时自动平移映射至新人数组合。
 */

export interface WerewolfWolfBounds {
  readonly base: number;
  readonly min: number;
  readonly max: number;
}

export interface WerewolfDistributionInput {
  readonly playerCount: number;
  readonly wolfDelta?: number;
  readonly guard?: boolean;
  readonly hunter?: boolean;
  readonly idiot?: boolean;
}

export type WerewolfSpecialRole = 'seer' | 'witch' | 'guard' | 'hunter' | 'idiot';

export interface WerewolfDistributionResult {
  readonly playerCount: number;
  readonly effectivePlayerCount: number;
  readonly baseWolves: number;
  readonly minWolves: number;
  readonly maxWolves: number;
  readonly wolfDelta: number;
  readonly effectiveWolfDelta: number;
  readonly wolfCount: number;
  readonly specials: readonly WerewolfSpecialRole[];
  readonly specialsCount: number;
  readonly villagerCount: number;
  readonly isValid: boolean;
  readonly error?: string;
  readonly canIncreaseWolves: boolean;
  readonly increaseDisabledReason?: string;
  readonly canDecreaseWolves: boolean;
  readonly decreaseDisabledReason?: string;
  readonly boardBadge: string;
}

/**
 * 计算当前人数下狼人数的基准推荐与安全区间。
 * 约束：狼人数严格小于 playerCount / 2。
 */
export function getWerewolfWolfBounds(playerCount: number): WerewolfWolfBounds {
  const effective = Math.max(5, Math.min(12, Math.floor(playerCount)));
  const base = effective >= 11 ? 4 : effective >= 9 ? 3 : effective >= 6 ? 2 : 1;
  const min = Math.max(1, base - 1);
  // 狼人数上限不能达到总人数的一半（即严格 < playerCount / 2）
  const maxCap = Math.floor((effective - 1) / 2);
  const max = Math.min(base + 1, maxCap);

  return { base, min, max };
}

/**
 * 解析计算阵营完整分布及各项安全指标。
 */
export function calculateWerewolfDistribution(input: WerewolfDistributionInput): WerewolfDistributionResult {
  const { playerCount, guard = false, hunter = false, idiot = false } = input;
  const rawDelta = typeof input.wolfDelta === 'number' && !Number.isNaN(input.wolfDelta) ? Math.trunc(input.wolfDelta) : 0;
  // 规范化 delta 范围为 -1, 0, 1
  const wolfDelta = Math.max(-1, Math.min(1, rawDelta));

  // 参考人数：若处于有效区间 5~12 人内则为实际人数，否则参考最低开局人数 6 人
  const effectivePlayerCount = playerCount >= 5 && playerCount <= 12 ? Math.floor(playerCount) : 6;
  const bounds = getWerewolfWolfBounds(effectivePlayerCount);

  // 计算应用偏移量后的实际狼人数
  const clampedWolves = Math.max(bounds.min, Math.min(bounds.max, bounds.base + wolfDelta));
  const effectiveWolfDelta = clampedWolves - bounds.base;

  // 基础神职必带预言家 + 女巫
  const specials: WerewolfSpecialRole[] = ['seer', 'witch'];
  if (guard) specials.push('guard');
  if (hunter) specials.push('hunter');
  if (idiot) specials.push('idiot');

  const specialsCount = specials.length;
  const villagerCount = effectivePlayerCount - clampedWolves - specialsCount;

  // 校验规则：平民至少保底 2 人
  let isValid = true;
  let error: string | undefined;

  if (clampedWolves + specialsCount > effectivePlayerCount) {
    isValid = false;
    error = `扩展角色卡数超过玩家总人数（超载 ${clampedWolves + specialsCount - effectivePlayerCount} 张），请关闭部分扩展神职。`;
  } else if (villagerCount < 2) {
    isValid = false;
    error = `平民数量不足（当前 ${Math.max(0, villagerCount)} 人，需保底 2 人），请减少狼人或关闭部分扩展神职。`;
  }

  // 增加狼人按钮状态及原因
  let canIncreaseWolves = false;
  let increaseDisabledReason: string | undefined;
  if (clampedWolves >= bounds.max) {
    increaseDisabledReason = '已达安全上限';
  } else if (villagerCount <= 2) {
    increaseDisabledReason = '平民需保底 2 人';
  } else {
    canIncreaseWolves = true;
  }

  // 减少狼人按钮状态及原因
  let canDecreaseWolves = false;
  let decreaseDisabledReason: string | undefined;
  if (clampedWolves <= bounds.min) {
    decreaseDisabledReason = '已达安全下限';
  } else {
    canDecreaseWolves = true;
  }

  // 计算板子命名 Badge
  let boardBadge = '';
  if (isValid) {
    if (effectivePlayerCount === 6 && clampedWolves === 2 && specialsCount === 2) {
      boardBadge = '经典 2-2-2 微型板子';
    } else if (effectivePlayerCount === 6 && clampedWolves === 1 && specialsCount === 3) {
      boardBadge = '娱乐 1-3-2 单狼板子';
    } else if (effectivePlayerCount === 8 && clampedWolves === 2 && hunter && !guard && !idiot) {
      boardBadge = '标准 2-3-3 双狼板子';
    } else if (effectivePlayerCount === 9 && clampedWolves === 3 && hunter && !guard && !idiot) {
      boardBadge = '黄金 3-3-3 标准板子';
    } else if (effectivePlayerCount === 10 && clampedWolves === 3 && hunter && guard && !idiot) {
      boardBadge = '标准 3-4-3 板子';
    } else if (effectivePlayerCount === 11 && clampedWolves === 4 && hunter && guard && !idiot) {
      boardBadge = '标准 4-4-3 竞技板子';
    } else if (effectivePlayerCount === 12 && clampedWolves === 4 && hunter && guard && !idiot) {
      boardBadge = '殿堂 4-4-4 终极标准板子';
    } else if (effectivePlayerCount === 12 && clampedWolves === 4 && hunter && guard && idiot) {
      boardBadge = '12 人 4-5-3 大神板子';
    } else if (effectiveWolfDelta > 0) {
      boardBadge = `高压强狼 ${clampedWolves}-${specialsCount}-${villagerCount} 板子`;
    } else if (effectiveWolfDelta < 0) {
      boardBadge = `好人微优 ${clampedWolves}-${specialsCount}-${villagerCount} 板子`;
    } else {
      boardBadge = `标准 ${clampedWolves}-${specialsCount}-${villagerCount} 板子`;
    }
  }

  return {
    playerCount,
    effectivePlayerCount,
    baseWolves: bounds.base,
    minWolves: bounds.min,
    maxWolves: bounds.max,
    wolfDelta,
    effectiveWolfDelta,
    wolfCount: clampedWolves,
    specials,
    specialsCount,
    villagerCount,
    isValid,
    error,
    canIncreaseWolves,
    increaseDisabledReason,
    canDecreaseWolves,
    decreaseDisabledReason,
    boardBadge,
  };
}

/**
 * 校验在当前配置下，开启某个扩展神职是否会突破保底线。
 */
export function canEnableWerewolfSpecial(
  input: WerewolfDistributionInput,
  specialKey: 'guard' | 'hunter' | 'idiot'
): { allowed: boolean; reason?: string } {
  if (input[specialKey]) return { allowed: true };

  const current = calculateWerewolfDistribution(input);
  // 若当前平民已经 <= 2 人，则再增加 1 个神职将使平民 < 2 人
  if (current.villagerCount <= 2) {
    return {
      allowed: false,
      reason: '平民需保底 2 人',
    };
  }

  return { allowed: true };
}
