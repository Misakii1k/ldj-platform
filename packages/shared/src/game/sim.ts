/**
 * 桌面模拟模式（M-模拟）共享工具内核。
 *
 * 供各游戏 *_sim_v1 规则集复用：只提供随机发牌/道具/日志等"必要工具"，
 * 不含任何记分、胜负判定或规则评审（resultCandidate 恒为 null）。
 * 随机一律走注入式 RandomSource（持久化种子驱动，确定性可测）。
 */

import type { RandomSource } from './contract.ts';

/** Fisher-Yates 洗牌（就地返回新数组） */
export function shuffleSimCards<T>(items: readonly T[], random: RandomSource): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = random.nextInt(0, i + 1);
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
  return arr;
}

/** 从牌堆顶部抽 count 张（不修改原数组；堆不够时尽量抽） */
export function drawSimCards<T>(pile: readonly T[], count: number, random: RandomSource): { drawn: T[]; rest: T[] } {
  const shuffled = shuffleSimCards(pile, random);
  const n = Math.min(count, shuffled.length);
  return { drawn: shuffled.slice(0, n), rest: shuffled.slice(n) };
}

/** 计时器状态（模拟模式道具：开始/暂停/重置/设时长；到 0 翻转 isExploded 仅作提示，无判定） */
export interface SimTimerState {
  durationSeconds: number;
  remainingSeconds: number;
  isRunning: boolean;
  isExploded: boolean;
}

export function createSimTimer(durationSeconds: number): SimTimerState {
  return { durationSeconds, remainingSeconds: durationSeconds, isRunning: false, isExploded: false };
}

/** 按经过的秒数推进计时器；返回是否发生爆炸翻转 */
export function tickSimTimer(timer: SimTimerState, elapsedSeconds: number): { timer: SimTimerState; exploded: boolean } {
  if (!timer.isRunning || timer.isExploded) return { timer, exploded: false };
  const next = { ...timer, remainingSeconds: Math.max(0, timer.remainingSeconds - elapsedSeconds) };
  if (next.remainingSeconds === 0 && !timer.isExploded) {
    return { timer: { ...next, isExploded: true, isRunning: false }, exploded: true };
  }
  return { timer: next, exploded: false };
}

/** 骰子道具状态 */
export interface SimDiceState {
  diceCount: number;
  sides: number;
  values: number[];
  lastRollBy: string | null;
}

export function rollSimDice(state: SimDiceState, random: RandomSource, rollBy: string): SimDiceState {
  const values: number[] = [];
  for (let i = 0; i < state.diceCount; i += 1) {
    values.push(random.nextInt(1, state.sides + 1));
  }
  return { ...state, values, lastRollBy: rollBy };
}

/** 按铃道具状态（只记录首响与次数，不裁决谁对谁错） */
export interface SimBellState {
  rungBy: string | null;
  ringCount: number;
  lastRingAt: number;
}

export function ringSimBell(state: SimBellState, playerId: string, now: number): { bell: SimBellState; first: boolean } {
  const first = state.rungBy === null;
  return {
    bell: { rungBy: state.rungBy ?? playerId, ringCount: state.ringCount + 1, lastRingAt: now },
    first,
  };
}

/** 活动日志条目 */
export interface SimLogEntry {
  text: string;
  at: number;
}

/** 追加日志并截断到 cap 条（默认 50） */
export function pushSimLog(logs: readonly SimLogEntry[], text: string, now: number, cap = 50): SimLogEntry[] {
  const next = [...logs, { text, at: now }];
  return next.length > cap ? next.slice(next.length - cap) : next;
}

/**
 * 桌面模拟模式的规则集 ID 约定：所有 *_sim_v1。
 *
 * 判定刻意按 ID 后缀而不是查游戏目录：cheese_thief_sim_v1 只在模块注册表里注册、
 * 并未写进 GAME_CATALOG（服务端 resolveRulesetForStart 走的是模块注册表），
 * 查目录会漏掉它。新增 sim 规则集只要沿用 *_sim_v1 命名就自动纳入。
 */
export function isSimRulesetId(rulesetId: string): boolean {
  return rulesetId.endsWith('_sim_v1');
}

/**
 * 桌面模拟模式要求房间内至少有一台公共大屏（seat_role = 'spectator'）。
 *
 * 这个形态是「线下玩、App 当道具」：版图/题目/公开道具都画在大屏上，各人手机只放私密操作。
 * 一台大屏都没有时整个形态不成立，所以在大厅就拦住开局，而不是让玩家开进去才发现没法玩。
 */
export const SIM_REQUIRES_PUBLIC_SCREEN_MESSAGE =
  '桌面模拟模式需要至少一台公共大屏：请在房间里把一台设备（平板/电脑）设为公共大屏后再开局';
