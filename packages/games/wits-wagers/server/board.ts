export type TargetId = 'lower' | `g:${number}`;
export type Slot = 'L3' | 'L2' | 'L1' | 'C' | 'R1' | 'R2' | 'R3';
export type EdgeSlot = 'LOWER';
export type ChipId = 'A' | 'B';
export type GuessOrigin = 'submitted';

export interface BoardTarget {
  id: TargetId;
  value: number | null;
  slot: Slot | EdgeSlot;
  odds: number;
  authors: string[];
}

export interface PlayerGuessInput {
  playerId?: string;
  value: number;
  origin?: GuessOrigin;
}

export interface ChipBet {
  chipId: ChipId;
  targetId: TargetId | null;
  extraStake: number;
}

export type BetPair = [ChipBet, ChipBet];

/** 「更低」边缘槽的固定赔率（原版桌游同档：比所有答案都小 6:1） */
export const EDGE_ODDS = 6;

export function isEdgeTarget(id: TargetId): id is 'lower' {
  return id === 'lower';
}

/** 槽位的中文名，服务端日志与 bot 提示词共用。 */
export function targetLabel(target: Pick<BoardTarget, 'id' | 'value'>): string {
  if (target.id === 'lower') return '更低';
  return String(target.value);
}

/** 01 §3 常量槽位与赔率表（唯一事实源，禁止公式推导） */
interface SlotAllocation {
  slots: readonly Slot[];
  odds: readonly number[];
}

const SLOT_TABLE: Record<number, SlotAllocation> = {
  1: {
    slots: ['C'],
    odds: [2],
  },
  2: {
    slots: ['L1', 'R1'],
    odds: [3, 3],
  },
  3: {
    slots: ['L1', 'C', 'R1'],
    odds: [3, 2, 3],
  },
  4: {
    slots: ['L2', 'L1', 'R1', 'R2'],
    odds: [4, 3, 3, 4],
  },
  5: {
    slots: ['L2', 'L1', 'C', 'R1', 'R2'],
    odds: [4, 3, 2, 3, 4],
  },
  6: {
    slots: ['L3', 'L2', 'L1', 'R1', 'R2', 'R3'],
    odds: [5, 4, 3, 3, 4, 5],
  },
  7: {
    slots: ['L3', 'L2', 'L1', 'C', 'R1', 'R2', 'R3'],
    odds: [5, 4, 3, 2, 3, 4, 5],
  },
};

/**
 * 根据本轮全部**真实提交**的猜测构建版图槽位与赔率。
 * 按照 01 §3（2026-09-22 二次修订）：
 * 1. 提取所有猜测值，去重并升序排序；
 * 2. 查表确定每个唯一值的槽位与净赢赔率；
 * 3. 归集各槽位作者；
 * 4. 版图最左放唯一的边缘槽 'lower'（答案低于全部猜测），赔率恒为 6；
 *    右端没有对应卡——与原版桌游一致，答案再高也由最大的猜测卡按距离取胜。
 *
 * 超时未答的玩家不在本轮版图上出现，调用方负责过滤。
 */
export function buildBoard(
  guesses: readonly (number | PlayerGuessInput)[],
): BoardTarget[] {
  if (!guesses || guesses.length === 0) {
    throw new Error('buildBoard requires at least one guess');
  }

  // 1. 规范化输入并归集到数值分组
  interface ValueGroup {
    value: number;
    authors: string[];
  }

  const valueMap = new Map<number, ValueGroup>();

  for (let i = 0; i < guesses.length; i++) {
    const item = guesses[i];
    if (item === undefined) {
      continue;
    }
    const value = typeof item === 'number' ? item : item.value;
    const playerId = typeof item === 'number' ? `p${i + 1}` : (item.playerId ?? `p${i + 1}`);

    let group = valueMap.get(value);
    if (!group) {
      group = { value, authors: [] };
      valueMap.set(value, group);
    }

    if (playerId && !group.authors.includes(playerId)) {
      group.authors.push(playerId);
    }
  }

  // 2. 升序排序唯一值
  const sortedValues = Array.from(valueMap.keys()).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const uniqueCount = sortedValues.length;

  const allocation = SLOT_TABLE[uniqueCount];
  if (!allocation) {
    throw new Error(`Unsupported unique guess count: ${uniqueCount} (expected 1..7)`);
  }

  // 3. 边缘槽始终存在，赔率恒为 6
  const lowerTarget: BoardTarget = {
    id: 'lower',
    value: null,
    slot: 'LOWER',
    odds: EDGE_ODDS,
    authors: [],
  };

  // 4. 构建常规数值目标
  const guessTargets: BoardTarget[] = sortedValues.map((val, idx) => {
    const group = valueMap.get(val)!;
    const slot = allocation.slots[idx];
    const odds = allocation.odds[idx];
    if (slot === undefined || odds === undefined) {
      throw new Error(`Missing slot allocation for index ${idx} with ${uniqueCount} unique values`);
    }
    return {
      id: `g:${val}`,
      value: val,
      slot,
      odds,
      authors: group.authors,
    };
  });

  return [lowerTarget, ...guessTargets];
}

/**
 * 确定获胜目标（可能不止一个）。
 * 按照 01 §2 R04（2026-09-22 二次修订）：
 * - 答案低于全部猜测 → 'lower'；
 * - 否则取绝对差值最小的猜测；两侧等距时两者同时获胜。
 *   答案高于全部猜测时没有特判，自然由最大的猜测卡获胜。
 * 精确命中时差值为 0，只有一个赢家。
 */
export function pickWinningTargets(
  board: readonly BoardTarget[],
  correctAnswer: number,
): TargetId[] {
  const valued = board.filter(
    (t): t is BoardTarget & { value: number } => t.value !== null,
  );
  if (valued.length === 0) {
    return [];
  }

  let min = Infinity;
  for (const t of valued) {
    if (t.value < min) min = t.value;
  }
  if (correctAnswer < min) return ['lower'];

  let bestDist = Infinity;
  for (const t of valued) {
    const d = Math.abs(t.value - correctAnswer);
    if (d < bestDist) bestDist = d;
  }
  // 版图按升序排列，等距时结果自然是 [较小者, 较大者]
  return valued.filter((t) => Math.abs(t.value - correctAnswer) === bestDist).map((t) => t.id);
}
