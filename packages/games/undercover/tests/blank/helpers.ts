/**
 * undercover_blank_v1 — 定向测试共享助手。
 * 直接调用 blankModule 的纯函数契约（createInitialState / reduce / getPlayerView），
 * 不依赖平台；外部裁判 effect 与 external_task_result 均由测试直接断言/注入。
 */
import { createSeededRandom, type GameContext } from '@ldj/shared';
import { blankModule } from '../../server/blank/module.ts';
import { blankStateSchema } from '../../server/blank/schemas.ts';
import type { BlankAction, BlankEvent, BlankResult, BlankState } from '../../server/blank/types.ts';

export type Ctx = GameContext;

export function makeCtx(now = 1_700_000_000_000, seed = 'blank-ctx'): Ctx {
  return { now, random: createSeededRandom(seed) };
}

export function init(
  players: string[],
  config: Record<string, unknown> = {},
  seed = 'blank-seed',
): { state: BlankState; ctx: Ctx } {
  const ctx = makeCtx(1_700_000_000_000, seed);
  const state = blankModule.createInitialState(ctx, players, blankModule.parseConfig(config));
  return { state, ctx };
}

export interface ReduceOutcome {
  state: BlankState;
  events: readonly BlankEvent[];
  privateEvents: readonly { recipients: readonly string[]; event: unknown }[];
  effects: readonly { type: string }[];
  resultCandidate: BlankResult | null;
}

export function reduce(
  state: BlankState,
  playerId: string,
  action: BlankAction,
  ctx: Ctx = makeCtx(state.deadlineAt ?? 1_700_000_000_000, `blank-reduce-${playerId}-${state.round}-${Math.random()}`),
): ReduceOutcome {
  const result = blankModule.reduce(ctx, state, { kind: 'player', playerId }, action);
  assertOk(result, action);
  return {
    state: result.nextState,
    events: result.publicEvents,
    privateEvents: result.privateEvents,
    effects: result.effects as readonly { type: string }[],
    resultCandidate: result.resultCandidate,
  };
}

export function reduceSystem(
  state: BlankState,
  action: BlankAction,
  ctx: Ctx = makeCtx(state.deadlineAt ?? 1_700_000_000_000, 'blank-sys'),
): ReduceOutcome {
  const result = blankModule.reduce(ctx, state, { kind: 'system', source: 'timer' }, action);
  assertOk(result, action);
  return {
    state: result.nextState,
    events: result.publicEvents,
    privateEvents: result.privateEvents,
    effects: result.effects as readonly { type: string }[],
    resultCandidate: result.resultCandidate,
  };
}

function assertOk(
  result: ReturnType<typeof blankModule.reduce>,
  action: BlankAction,
): asserts result is Extract<ReturnType<typeof blankModule.reduce>, { ok: true }> {
  if (!result.ok) {
    throw new Error(`动作被拒（${action.type}）：${result.message}`);
  }
}

/** 拒绝断言：期望 reduce 返回 ok=false。 */
export function expectDeny(
  state: BlankState,
  playerId: string,
  action: BlankAction,
): { code: string; message: string } {
  const result = blankModule.reduce(makeCtx(), state, { kind: 'player', playerId }, action);
  if (result.ok) throw new Error(`期望动作被拒（${(action as { type: string }).type}），但被接受`);
  return { code: result.code, message: result.message };
}

export function expectSystemDeny(
  state: BlankState,
  action: BlankAction,
): { code: string; message: string } {
  const result = blankModule.reduce(makeCtx(), state, { kind: 'system', source: 'timer' }, action);
  if (result.ok) throw new Error(`期望系统动作被拒（${(action as { type: string }).type}），但被接受`);
  return { code: result.code, message: result.message };
}

export function blankOf(state: BlankState): string {
  const id = state.blankPlayerId;
  if (!id) throw new Error('无白板');
  return id;
}

export function civiliansOf(state: BlankState): string[] {
  return Object.entries(state.players)
    .filter(([, p]) => p.role === 'civilian')
    .map(([id]) => id);
}

/** 从 reduce 结果中取出外部裁判 effect。 */
export function adjudicationEffect(
  outcome: ReduceOutcome,
): { taskId: string; sessionId: string; submittedAtSeq: number; inputPlaintextJson: string | null } | null {
  const effect = outcome.effects.find((e) => (e as { type?: string }).type === 'enqueue_adjudication');
  if (!effect) return null;
  const e = effect as unknown as {
    taskId: string;
    sessionId: string;
    submittedAtSeq: number;
    inputPlaintextJson: string | null;
  };
  return { taskId: e.taskId, sessionId: e.sessionId, submittedAtSeq: e.submittedAtSeq, inputPlaintextJson: e.inputPlaintextJson };
}

/** 构造外部裁判结果（runner AdjudicationDispatchResult 形状）。 */
export function adjudicationResult(
  verdict: 'equivalent' | 'not_equivalent',
  classification = verdict,
  source = 'primary',
): unknown {
  return { classification, verdict, source, policyVersion: 'blank-adjudication-v1', attempts: [] };
}

/** 驱动看词阶段：全部存活玩家 confirm_word（或 reveal_timeout 兜底）。 */
export function confirmAll(state: BlankState, ctx: Ctx): ReduceOutcome {
  let current = state;
  let out: ReduceOutcome | null = null;
  for (const id of Object.keys(current.players)) {
    out = reduce(current, id, { type: 'confirm_word' }, ctx);
    current = out.state;
    if (current.phase !== 'word_reveal') return out;
  }
  if (current.phase === 'word_reveal') {
    out = reduceSystem(current, { type: 'reveal_timeout' }, ctx);
  }
  return out!;
}

/** 驱动发言：当前发言者 finish_speech，直到进入投票阶段。 */
export function speakToVoting(state: BlankState, ctx: Ctx): ReduceOutcome {
  let current = state;
  let out: ReduceOutcome | null = null;
  for (let step = 0; step < 64; step += 1) {
    if (current.phase === 'voting' || current.phase === 'runoff_voting') return out ?? { state: current, events: [], privateEvents: [], effects: [], resultCandidate: null };
    if (current.phase !== 'speaking') throw new Error(`期望发言阶段，实际 ${current.phase}`);
    const speaker = current.speakingOrder[current.currentSpeakerIndex]!;
    out = reduce(current, speaker, { type: 'finish_speech' }, ctx);
    current = out.state;
  }
  throw new Error('发言阶段无法推进到投票');
}

/** 驱动投票：全员 cast_vote 或 vote_timeout 兜底；返回结算后的状态。 */
export function voteToSettlement(
  state: BlankState,
  ctx: Ctx,
  targets?: Record<string, string>,
): ReduceOutcome {
  let current = state;
  let out: ReduceOutcome | null = null;
  for (let step = 0; step < 64; step += 1) {
    const phase = current.phase;
    if (phase === 'vote_result' || phase === 'final_guess' || phase === 'game_over') {
      return out ?? { state: current, events: [], privateEvents: [], effects: [], resultCandidate: null };
    }
    if (phase !== 'voting' && phase !== 'runoff_voting') {
      throw new Error(`期望投票阶段，实际 ${phase}`);
    }
    const unvoted = Object.keys(current.players).filter(
      (id) => current.players[id]!.alive && !(id in current.votes),
    );
    if (unvoted.length === 0) {
      out = reduceSystem(current, { type: 'vote_timeout', round: current.round, kind: phase === 'voting' ? 'normal' : 'runoff' }, ctx);
      current = out.state;
      continue;
    }
    const voter = unvoted[0]!;
    const target =
      targets?.[voter] ??
      Object.keys(current.players).find((id) => id !== voter && current.players[id]!.alive)!;
    out = reduce(current, voter, { type: 'cast_vote', targetPlayerId: target }, ctx);
    current = out.state;
  }
  throw new Error('投票阶段无法结算');
}

/** 断言新状态通过 schema 与不变量（module 本身已做；此处额外校验 schema 往返）。 */
export function assertStateValid(state: BlankState): void {
  blankStateSchema.parse(state);
}

/** 构造精确场景状态（绕过完整对局驱动），便于断言胜负/暂存/猜词边界。 */
export function scenario(opts: {
  roles: Record<string, 'blank' | 'civilian'>;
  alive?: Record<string, boolean>;
  phase?: BlankState['phase'];
  votes?: Record<string, string>;
  round?: number;
  guess?: BlankState['guess'];
  deferredOutcome?: BlankState['deferredOutcome'];
  pendingOutcome?: BlankState['pendingOutcome'];
  lastVoteSummary?: BlankState['lastVoteSummary'];
  sessionId?: string;
  revealMode?: 'immediate' | 'delayed';
  civilianWord?: string;
  currentSpeakerIndex?: number;
}): BlankState {
  const players = Object.fromEntries(
    Object.entries(opts.roles).map(([id, role], seat) => [
      id,
      { seat, role, alive: opts.alive?.[id] ?? true, exitReason: null },
    ]),
  );
  const ids = Object.keys(opts.roles);
  const blankPlayerId = ids.find((id) => opts.roles[id] === 'blank') ?? null;
  const config = blankModule.parseConfig({ revealMode: opts.revealMode ?? 'immediate' });
  const state: BlankState = {
    schemaVersion: 1,
    phase: opts.phase ?? 'voting',
    round: opts.round ?? 1,
    players,
    speakingOrder: ids,
    currentSpeakerIndex: opts.currentSpeakerIndex ?? 0,
    votes: opts.votes ?? {},
    runoffCandidates: [],
    civilianWord: opts.civilianWord ?? '苹果',
    deadlineAt: 1_700_000_000_000 + 45_000,
    winner: null,
    config,
    confirmedPlayerIds: ids,
    roundFirstSpeaker: ids[0] ?? null,
    lastVoteSummary: opts.lastVoteSummary ?? null,
    pendingOutcome: opts.pendingOutcome ?? null,
    deferredOutcome: opts.deferredOutcome ?? null,
    blankPlayerId,
    guess: opts.guess ?? null,
    taskSeq: opts.guess?.submittedAtSeq ?? 0,
    sessionId: opts.sessionId ?? 's-blank-test',
    aborted: false,
  };
  return blankStateSchema.parse(state);
}

/** 主动猜词动作（白板玩家 b 使用；可显式传 sessionId）。 */
export function blankGuessAction(guess: string, sessionId = 's-blank'): Extract<BlankAction, { type: 'submit_guess' }> {
  return { type: 'submit_guess', guess, sessionId };
}

/** 驱动投票全员投 targetId（目标本人投另一存活玩家，避免自投）；返回结算后的状态。 */
export function voteToEliminate(
  state: BlankState,
  targetId: string,
  ctx: Ctx = makeCtx(1_700_000_000_100, 'blank-vote-out'),
): ReduceOutcome {
  let current = state;
  let out: ReduceOutcome | null = null;
  const order = Object.keys(current.players).sort(
    (a, b) => current.players[a]!.seat - current.players[b]!.seat,
  );
  for (const voter of order) {
    if (!current.players[voter]!.alive) continue;
    const otherAlive = order.find((id) => id !== voter && current.players[id]!.alive);
    const target = voter === targetId ? (otherAlive ?? targetId) : targetId;
    out = reduce(current, voter, { type: 'cast_vote', targetPlayerId: target }, ctx);
    current = out.state;
    if (current.phase !== 'voting' && current.phase !== 'runoff_voting') break;
  }
  if (!out) throw new Error('投票无法推进到结算');
  return out;
}
