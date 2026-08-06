/**
 * werewolf v2 (werewolf_platform_open_kill_v1) — 定向测试共享助手。
 * 直接调用 werewolfV2Module 的纯函数契约（createInitialState / reduce / getPlayerView），
 * 不依赖平台；identity-shuffle ctx 得到固定角色顺序 [wolf×n, seer, witch, (guard/hunter/idiot), villager…]。
 */
import { createSeededRandom, type Actor, type BotDecisionInput, type GameContext } from '@ldj/shared';
import { werewolfV2Module } from '../../server/v2/module.ts';
import type { V2Action, V2Role, V2State, V2TimedPhase } from '../../server/v2/types.ts';

export type Ctx = GameContext;

export const IDENTITY_CTX: Ctx = {
  now: 1,
  random: {
    nextInt: () => 0,
    shuffle: <T>(items: readonly T[]) => [...items],
  },
};

export function makeCtx(seed = 'v2-ctx', now = 1_700_000_000_000): Ctx {
  return { now, random: createSeededRandom(seed) };
}

export const actor = (playerId: string): Actor => ({ kind: 'player', playerId });
export const system: Actor = { kind: 'system', source: 'admin' };

export function init(
  players: string[],
  config: Record<string, unknown> = {},
  ctx: Ctx = IDENTITY_CTX,
): V2State {
  return werewolfV2Module.createInitialState(ctx, players, werewolfV2Module.parseConfig(config));
}

export interface ReduceOutcome {
  state: V2State;
  events: readonly unknown[];
  effects: readonly { type: string }[];
  resultCandidate: unknown;
}

export function reduce(state: V2State, by: Actor, action: V2Action, ctx: Ctx = IDENTITY_CTX): ReduceOutcome {
  const result = werewolfV2Module.reduce(ctx, state, by, action);
  if (!result.ok) throw new Error(`动作被拒（${action.type}）：${result.message}`);
  return {
    state: result.nextState,
    events: result.publicEvents,
    effects: result.effects as readonly { type: string }[],
    resultCandidate: result.resultCandidate,
  };
}

export function apply(state: V2State, by: Actor, action: V2Action, ctx: Ctx = IDENTITY_CTX): V2State {
  return reduce(state, by, action, ctx).state;
}

export function deny(state: V2State, by: Actor, action: V2Action, ctx: Ctx = IDENTITY_CTX): { code: string; message: string } {
  const result = werewolfV2Module.reduce(ctx, state, by, action);
  if (result.ok) throw new Error(`期望动作被拒（${(action as { type: string }).type}），但被接受`);
  return { code: result.code, message: result.message };
}

export function timeout(state: V2State, phase: V2TimedPhase, ctx: Ctx = IDENTITY_CTX): V2State {
  if (state.phase !== phase) throw new Error(`期望阶段 ${phase}，实际 ${state.phase}`);
  if (!state.phaseToken) throw new Error(`阶段 ${phase} 无 phaseToken`);
  return apply(state, system, { type: 'phase_timeout', phase, day: state.day, token: state.phaseToken }, ctx);
}

export function startedNight(
  players: string[],
  config: Record<string, unknown> = {},
  ctx: Ctx = IDENTITY_CTX,
): V2State {
  let state = init(players, config, ctx);
  state = apply(state, system, { type: 'begin' }, ctx);
  for (const id of players) state = apply(state, actor(id), { type: 'confirm_role' }, ctx);
  if (state.phase !== 'night') throw new Error(`期望 night，实际 ${state.phase}`);
  return state;
}

export function aliveIds(state: V2State): string[] {
  return Object.entries(state.players)
    .filter(([, p]) => p.alive)
    .sort(([, a], [, b]) => a.seat - b.seat)
    .map(([id]) => id);
}

export function byRole(state: V2State, role: V2Role): string[] {
  return Object.entries(state.players)
    .filter(([, p]) => p.alive && p.role === role)
    .map(([id]) => id);
}

export function rolesOf(state: V2State): Record<string, V2Role> {
  return Object.fromEntries(Object.entries(state.players).map(([id, p]) => [id, p.role]));
}

/** 全体有投票权者投 target（候选人改投他人避免自投非法；null = 弃票） */
export function voteAll(state: V2State, target: string | null, ctx: Ctx = IDENTITY_CTX): V2State {
  let st = state;
  for (const id of aliveIds(st)) {
    if (st.players[id]?.idiotRevealed) continue;
    let t = target;
    if (id === target) {
      const others = aliveIds(st).filter((x) => x !== id && x !== target && !st.players[x]?.idiotRevealed);
      t = others[0] ?? null;
    }
    st = apply(st, actor(id), { type: 'day_vote', targetPlayerId: t }, ctx);
  }
  return st;
}

/** 白天流程：确认公告 → 依次发言 → 返回投票阶段状态 */
export function skipDiscussion(state: V2State, ctx: Ctx = IDENTITY_CTX): V2State {
  let st = state;
  if (st.phase === 'day_announcement') {
    for (const id of aliveIds(st)) st = apply(st, actor(id), { type: 'confirm_announcement' }, ctx);
  }
  if (st.phase !== 'discussion') throw new Error(`期望 discussion，实际 ${st.phase}`);
  for (const id of [...st.speakingOrder]) {
    if (!st.players[id]?.alive) continue;
    st = apply(st, actor(id), { type: 'finish_speech' }, ctx);
  }
  if (st.phase !== 'voting' && st.phase !== 'runoff_voting') {
    throw new Error(`期望投票阶段，实际 ${st.phase}`);
  }
  return st;
}

export interface BotStep {
  actor: Actor;
  action: V2Action;
}

/** 完整机器人局驱动：固定种子，逐玩家 pickBotAction + 阶段超时兜底，记录可重放步骤轨迹。 */
export function driveBotGame(
  players: string[],
  config: Record<string, unknown> = {},
  seed = 'v2-drive',
  maxSteps = 500,
): { steps: BotStep[]; final: V2State; ctx: Ctx } {
  const random = createSeededRandom(seed);
  const ctx: Ctx = { now: 1_700_000_000_000, random };
  let state = werewolfV2Module.createInitialState(ctx, players, werewolfV2Module.parseConfig(config));
  const steps: BotStep[] = [];
  for (let step = 0; step < maxSteps; step += 1) {
    if (state.phase === 'game_over') break;
    ctx.now += 1_000;
    let acted = false;
    for (const id of players) {
      const view = werewolfV2Module.getPlayerView(state, id);
      const input: BotDecisionInput<unknown> = { view, playerId: id, random: createSeededRandom(`${seed}:${id}:${step}`) };
      const action = werewolfV2Module.pickBotAction?.(input as never);
      if (action === null || action === undefined) continue;
      const parsed = werewolfV2Module.parseAction(action);
      const reduced = werewolfV2Module.reduce(ctx, state, { kind: 'player', playerId: id }, parsed);
      if (!reduced.ok) continue;
      steps.push({ actor: { kind: 'player', playerId: id }, action: parsed });
      state = reduced.nextState;
      acted = true;
      break;
    }
    if (!acted && state.phase !== 'game_over' && state.phaseToken) {
      const action: V2Action = {
        type: 'phase_timeout',
        phase: state.phase as V2TimedPhase,
        day: state.day,
        token: state.phaseToken,
      };
      const reduced = werewolfV2Module.reduce(ctx, state, system, action);
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
