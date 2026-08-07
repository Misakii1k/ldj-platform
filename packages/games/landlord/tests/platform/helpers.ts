/**
 * landlord_platform_v1 — 定向测试共享助手。
 * 直接调用 landlordPlatformModule 的纯函数契约（createInitialState / reduce / getPlayerView），
 * 不依赖平台；identity ctx 得到完全确定的发牌（deck 顺序即洗牌结果）。
 */
import { createSeededRandom, type Actor, type BotDecisionInput, type GameContext } from '@ldj/shared';
import { landlordPlatformModule } from '../../server/platform/module.ts';
import type { PlatformAction, PlatformState } from '../../server/platform/types.ts';

export type Ctx = GameContext;

export const IDENTITY_CTX: Ctx = {
  now: 1,
  random: {
    nextInt: () => 0,
    shuffle: <T>(items: readonly T[]) => [...items],
  },
};

export function makeCtx(seed = 'landlord-platform-ctx', now = 1_700_000_000_000): Ctx {
  return { now, random: createSeededRandom(seed) };
}

export const actor = (playerId: string): Actor => ({ kind: 'player', playerId });
export const system: Actor = { kind: 'system', source: 'admin' };

export function init(
  players: string[],
  config: Record<string, unknown> = {},
  ctx: Ctx = IDENTITY_CTX,
): PlatformState {
  return landlordPlatformModule.createInitialState(ctx, players, landlordPlatformModule.parseConfig(config));
}

export interface ReduceOutcome {
  state: PlatformState;
  events: readonly unknown[];
  effects: readonly { type: string }[];
  resultCandidate: unknown;
}

export function reduce(
  state: PlatformState,
  by: Actor,
  action: PlatformAction,
  ctx: Ctx = IDENTITY_CTX,
): ReduceOutcome {
  const result = landlordPlatformModule.reduce(ctx, state, by, action);
  if (!result.ok) throw new Error(`动作被拒（${action.type}）：${result.message}`);
  return {
    state: result.nextState,
    events: result.publicEvents,
    effects: result.effects as readonly { type: string }[],
    resultCandidate: result.resultCandidate,
  };
}

export function apply(state: PlatformState, by: Actor, action: PlatformAction, ctx: Ctx = IDENTITY_CTX): PlatformState {
  return reduce(state, by, action, ctx).state;
}

export function deny(
  state: PlatformState,
  by: Actor,
  action: PlatformAction,
  ctx: Ctx = IDENTITY_CTX,
): { code: string; message: string } {
  const result = landlordPlatformModule.reduce(ctx, state, by, action);
  if (result.ok) throw new Error(`期望动作被拒（${(action as { type: string }).type}），但被接受`);
  return { code: result.code, message: result.message };
}

/** 触发当前阶段的计时器超时：先校验 phase/token 匹配（等价平台 consumeDueTimer 校验）。 */
export function timeout(state: PlatformState, ctx: Ctx = IDENTITY_CTX): PlatformState {
  if (state.phase === 'game_over') throw new Error('终局不能触发超时');
  if (!state.phaseToken) throw new Error(`阶段 ${state.phase} 无 phaseToken`);
  return apply(
    state,
    { kind: 'system', source: 'timer' },
    { type: 'phase_timeout', phase: state.phase as 'bidding' | 'playing', token: state.phaseToken },
    ctx,
  );
}

export interface BotStep {
  actor: Actor;
  action: unknown;
}

/** 完整机器人局驱动：固定种子，逐玩家 pickBotAction + 阶段超时兜底，记录可重放步骤轨迹。 */
export function driveBotGame(
  players: string[],
  config: Record<string, unknown> = {},
  seed = 'landlord-platform-drive',
  maxSteps = 500,
): { steps: BotStep[]; final: PlatformState; ctx: Ctx } {
  const random = createSeededRandom(seed);
  const ctx: Ctx = { now: 1_700_000_000_000, random };
  let state = landlordPlatformModule.createInitialState(ctx, players, landlordPlatformModule.parseConfig(config));
  const steps: BotStep[] = [];
  for (let step = 0; step < maxSteps; step += 1) {
    if (state.phase === 'game_over') break;
    ctx.now += 1_000;
    let acted = false;
    for (const id of players) {
      const view = landlordPlatformModule.getPlayerView(state, id);
      const input: BotDecisionInput<unknown> = { view, playerId: id, random: createSeededRandom(`${seed}:${id}:${step}`) };
      const action = landlordPlatformModule.pickBotAction?.(input as never);
      if (action === null || action === undefined) continue;
      const parsed = landlordPlatformModule.parseAction(action);
      const reduced = landlordPlatformModule.reduce(ctx, state, { kind: 'player', playerId: id }, parsed);
      if (!reduced.ok) continue;
      steps.push({ actor: { kind: 'player', playerId: id }, action: parsed });
      state = reduced.nextState;
      acted = true;
      break;
    }
    if (!acted && state.phase !== 'game_over' && state.phaseToken) {
      const action: PlatformAction = {
        type: 'phase_timeout',
        phase: state.phase as 'bidding' | 'playing',
        token: state.phaseToken,
      };
      const reduced = landlordPlatformModule.reduce(ctx, state, system, action);
      if (reduced.ok) {
        steps.push({ actor: system, action });
        state = reduced.nextState;
        acted = true;
      }
    }
    if (!acted) throw new Error(`对局在第 ${step} 步卡死（phase=${state.phase}）`);
  }
  if (state.phase !== 'game_over') throw new Error(`对局未在 ${maxSteps} 步内收束（phase=${state.phase}）`);
  return { steps, final: state, ctx };
}

/** 便捷流程：begin + 全部完成叫分（每人按给定分数），返回出牌阶段状态。 */
export function startedPlaying(
  players: string[],
  scores: readonly (0 | 1 | 2 | 3)[],
  ctx: Ctx = IDENTITY_CTX,
): PlatformState {
  let s = init(players, {}, ctx);
  s = apply(s, system, { type: 'begin' }, ctx);
  for (const score of scores) s = apply(s, actor(players[s.bids.length]!), { type: 'bid_score', score }, ctx);
  if (s.phase !== 'playing') throw new Error(`期望出牌阶段，实际 ${s.phase}`);
  return s;
}
