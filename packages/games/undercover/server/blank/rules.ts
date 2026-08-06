/**
 * undercover_blank_v1 — 白板规则集实现（纯函数 reducer + 视角 + 不变量）。
 *
 * 冻结决定（compliance/rules/undercover_blank_v1.json）：
 * - 4–12 人、恰好一名白板、无有词卧底、其余平民共享同词、白板显式无词。
 * - 白板计入卧底方；白板+一名平民剩余立即获胜。
 * - 一次主动秘密猜词（发言/普通投票/加赛投票，非结算）；对错后果按提交时间生效。
 * - 被投票淘汰且未猜过 → 30 秒终局猜词；提交一次或显式跳过；超时/跳过按猜错。
 * - 归一化走 blank-normalization-v1（共享 adjudication-policy）；1–64 码点、拒控制字符。
 * - 裁判链：本地精确 → 主模型 → 备用；只有 equivalent 判正确。
 * - 异步：任务在房间事务外运行，pending 不阻塞普通流程；普通终局先记暂存，
 *   更早提交的 equivalent 覆盖暂存，not_equivalent 确认暂存或继续。
 * - 明文只在 pending 保留，结果应用后擦除。
 */
import { createHash } from 'node:crypto';
import {
  ADJUDICATION_POLICY_VERSION,
  isValidBlankAdjudicationText,
  nextTurnParticipant,
  normalizeBlankAdjudicationText,
  rotateTurnOrder,
  type GameContext,
  type GameEffect,
  type PrivateGameEvent,
} from '@ldj/shared';
import { WORD_BANK } from '../words.ts';
import { blankStateSchema, type BlankConfigInput } from './schemas.ts';
import {
  blankFinalGuessTimerId,
  blankRevealTimerId,
  blankResultTimerId,
  blankSpeechTimerId,
  blankVoteTimerId,
  type BlankAction,
  type BlankDeferredOutcome,
  type BlankEvent,
  type BlankExitReason,
  type BlankPendingOutcome,
  type BlankPlayerMeView,
  type BlankPlayerView,
  type BlankPublicView,
  type BlankResult,
  type BlankRole,
  type BlankSpectatorView,
  type BlankState,
  type BlankVoteSummary,
  type BlankWinner,
} from './types.ts';

type State = BlankState;

const REVEAL_TIMEOUT_MS = 30_000; // 看词
const VOTE_RESULT_MS = 5_000; // 结果展示
const FINAL_GUESS_MS = 30_000; // 终局猜词（FINAL-001）

/** 平台级外部裁判 effect（不在 GameEffect 基联合中，由 session 层前置处理）。 */
export interface BlankAdjudicationEffect {
  readonly type: 'enqueue_adjudication';
  readonly taskId: string;
  readonly sessionId: string;
  readonly rulesetId: string;
  readonly taskType: string;
  readonly submittedAtSeq: number;
  readonly eligibilityDigest: string;
  readonly inputDigest: string;
  readonly inputPlaintextJson: string | null;
}

type BlankEffect = GameEffect | BlankAdjudicationEffect;

export interface BlankReduceOk {
  readonly ok: true;
  readonly nextState: State;
  readonly publicEvents: readonly BlankEvent[];
  readonly privateEvents: readonly PrivateGameEvent[];
  readonly effects: readonly BlankEffect[];
  readonly resultCandidate: BlankResult | null;
}

export type BlankReduceResult =
  | { readonly ok: false; readonly code: string; readonly message: string }
  | BlankReduceOk;

// —— 查询助手 ——

function alivePlayerIds(s: State): string[] {
  return Object.entries(s.players)
    .filter(([, p]) => p.alive)
    .sort(([, a], [, b]) => a.seat - b.seat)
    .map(([id]) => id);
}

/** 胜负（WIN-001）：无白板 → 平民胜；平民 ≤ 1 → 白板方胜。 */
function checkWinner(s: State): BlankWinner | null {
  let blank = 0;
  let civilian = 0;
  for (const p of Object.values(s.players)) {
    if (!p.alive) continue;
    if (p.role === 'blank') blank += 1;
    else civilian += 1;
  }
  if (blank === 0) return 'civilian';
  if (civilian <= 1) return 'blank';
  return null;
}

function nextAliveAfter(s: State, fromId: string): string {
  const bySeat = Object.entries(s.players)
    .sort(([, a], [, b]) => a.seat - b.seat)
    .map(([id]) => id);
  return nextTurnParticipant(bySeat, fromId, {
    isEligible: (playerId) => s.players[playerId]!.alive,
  });
}

function buildSpeakingOrder(s: State, firstId: string): string[] {
  return rotateTurnOrder(alivePlayerIds(s), firstId);
}

function currentPhaseTimerId(s: State): string | null {
  switch (s.phase) {
    case 'word_reveal':
      return s.deadlineAt !== null ? blankRevealTimerId() : null;
    case 'speaking':
      return blankSpeechTimerId(s.round, s.currentSpeakerIndex);
    case 'voting':
      return blankVoteTimerId(s.round, 'normal');
    case 'runoff_voting':
      return blankVoteTimerId(s.round, 'runoff');
    case 'vote_result':
      return s.lastVoteSummary ? blankResultTimerId(s.round, s.lastVoteSummary.kind) : null;
    case 'final_guess':
      return blankFinalGuessTimerId(s.round);
    default:
      return null;
  }
}

/** 身份公开（FINAL-001）：淘汰的白板在 delayed 模式下不提前公开，其余淘汰即公开。 */
function canRevealRole(s: State, p: { alive: boolean; role: BlankRole }): boolean {
  if (p.alive) return false;
  if (s.phase === 'game_over') return true;
  if (p.role === 'blank' && s.config.revealMode === 'delayed') return false;
  return true;
}

function noop(s: State): BlankReduceResult {
  return { ok: true, nextState: s, publicEvents: [], privateEvents: [], effects: [], resultCandidate: null };
}

function deny(message: string): BlankReduceResult {
  return { ok: false, code: 'ACTION_NOT_ALLOWED', message };
}

// —— 变更助手（在克隆后的 draft 上操作） ——

function eliminate(
  s: State,
  playerId: string,
  reason: BlankExitReason,
  events: BlankEvent[],
): void {
  const p = s.players[playerId];
  if (!p) throw new Error(`未知玩家：${playerId}`);
  p.alive = false;
  p.exitReason = reason;
  events.push({
    type: 'player_eliminated',
    playerId,
    role: canRevealRole(s, p) ? p.role : null,
    reason,
  });
}

function finishGame(
  s: State,
  winner: BlankWinner | null,
  events: BlankEvent[],
  effects: BlankEffect[],
): void {
  s.phase = 'game_over';
  s.winner = winner;
  s.deadlineAt = null;
  s.pendingOutcome = null;
  s.deferredOutcome = null;
  events.push({ type: 'game_over', winner });
  if (winner) {
    effects.push({
      type: 'system_message',
      text: winner === 'blank' ? '卧底方（白板）胜利！' : '平民阵营胜利！',
    });
  }
}

function startRound(
  s: State,
  ctx: GameContext,
  round: number,
  events: BlankEvent[],
  effects: BlankEffect[],
): void {
  const alive = alivePlayerIds(s);
  let first: string;
  if (round === 1 || s.roundFirstSpeaker === null) {
    first = alive[ctx.random.nextInt(0, alive.length)]!;
  } else {
    first = nextAliveAfter(s, s.roundFirstSpeaker);
  }
  s.round = round;
  s.roundFirstSpeaker = first;
  s.speakingOrder = buildSpeakingOrder(s, first);
  s.currentSpeakerIndex = 0;
  s.phase = 'speaking';
  s.votes = {};
  s.runoffCandidates = [];
  s.pendingOutcome = null;
  s.deadlineAt = ctx.now + s.config.speechSeconds * 1000;
  events.push({ type: 'phase_changed', phase: 'speaking', round });
  effects.push({
    type: 'schedule_timer',
    timerId: blankSpeechTimerId(round, 0),
    deadlineAt: s.deadlineAt,
    action: { type: 'speech_timeout', round, speakerIndex: 0 },
  });
  effects.push({ type: 'system_message', text: `第 ${round} 轮发言开始` });
}

function startVoting(
  s: State,
  ctx: GameContext,
  kind: 'normal' | 'runoff',
  candidates: string[],
  events: BlankEvent[],
  effects: BlankEffect[],
): void {
  s.phase = kind === 'normal' ? 'voting' : 'runoff_voting';
  s.votes = {};
  s.runoffCandidates = candidates;
  s.deadlineAt = ctx.now + s.config.voteSeconds * 1000;
  events.push({ type: 'phase_changed', phase: s.phase, round: s.round });
  effects.push({
    type: 'schedule_timer',
    timerId: blankVoteTimerId(s.round, kind),
    deadlineAt: s.deadlineAt,
    action: { type: 'vote_timeout', round: s.round, kind },
  });
  if (kind === 'runoff') {
    effects.push({ type: 'system_message', text: '最高票并列，进入加赛投票' });
  }
}

function advanceSpeaker(
  s: State,
  ctx: GameContext,
  events: BlankEvent[],
  effects: BlankEffect[],
): void {
  for (let i = s.currentSpeakerIndex + 1; i < s.speakingOrder.length; i += 1) {
    const sid = s.speakingOrder[i]!;
    if (s.players[sid]?.alive) {
      s.currentSpeakerIndex = i;
      s.deadlineAt = ctx.now + s.config.speechSeconds * 1000;
      effects.push({
        type: 'schedule_timer',
        timerId: blankSpeechTimerId(s.round, i),
        deadlineAt: s.deadlineAt,
        action: { type: 'speech_timeout', round: s.round, speakerIndex: i },
      });
      return;
    }
  }
  startVoting(s, ctx, 'normal', [], events, effects);
}

/** 普通流程产生终局时：有 pending 猜词则记暂存（不终局），否则直接终局。 */
function deferOrFinalize(
  s: State,
  winner: BlankWinner,
  events: BlankEvent[],
  effects: BlankEffect[],
): void {
  const g = s.guess;
  if (g && g.status === 'pending') {
    s.deferredOutcome = { winner, taskId: g.taskId };
    const timer = currentPhaseTimerId(s);
    if (timer) effects.push({ type: 'cancel_timer', timerId: timer });
    effects.push({ type: 'system_message', text: '存在待定猜词，对局结果暂存等待裁判' });
    return;
  }
  finishGame(s, winner, events, effects);
}

function settleVotes(
  s: State,
  ctx: GameContext,
  kind: 'normal' | 'runoff',
  events: BlankEvent[],
  effects: BlankEffect[],
): void {
  const tally: Record<string, number> = {};
  for (const target of Object.values(s.votes)) {
    if (!s.players[target]?.alive) continue;
    tally[target] = (tally[target] ?? 0) + 1;
  }
  const entries = Object.entries(tally);
  let outcome: BlankVoteSummary['outcome'];
  let eliminatedPlayerId: string | null = null;
  let eliminatedRole: BlankRole | null = null;
  let pendingNext: BlankPendingOutcome['next'];
  let candidates: string[] = [];
  let winner: BlankWinner | null = null;

  if (entries.length === 0) {
    outcome = 'no_votes';
    pendingNext = 'next_round';
    effects.push({ type: 'system_message', text: '本轮没有有效选票，无人被淘汰' });
  } else {
    const top = Math.max(...entries.map(([, n]) => n));
    const topIds = entries.filter(([, n]) => n === top).map(([id]) => id);
    if (topIds.length === 1) {
      outcome = 'eliminated';
      const votedOutId = topIds[0]!;
      eliminatedPlayerId = votedOutId;
      eliminate(s, votedOutId, 'voted_out', events);
      eliminatedRole = s.players[votedOutId]!.role;
      // 白板被投票淘汰且从未猜词 → 开启 30 秒终局猜词（FINAL-001）
      if (eliminatedRole === 'blank' && s.guess === null) {
        s.lastVoteSummary = {
          round: s.round,
          kind,
          outcome,
          eliminatedPlayerId,
          eliminatedRole,
          tally,
        };
        s.phase = 'final_guess';
        s.deadlineAt = ctx.now + FINAL_GUESS_MS;
        s.pendingOutcome = null;
        s.deferredOutcome = null;
        events.push({ type: 'phase_changed', phase: 'final_guess', round: s.round });
        effects.push({
          type: 'schedule_timer',
          timerId: blankFinalGuessTimerId(s.round),
          deadlineAt: s.deadlineAt,
          action: { type: 'final_guess_timeout', round: s.round },
        });
        effects.push({ type: 'system_message', text: '白板被投票淘汰，进入 30 秒终局猜词' });
        return;
      }
      winner = checkWinner(s);
      pendingNext = winner ? 'game_over' : 'next_round';
    } else if (kind === 'normal') {
      outcome = 'tie';
      pendingNext = 'runoff';
      candidates = topIds;
    } else {
      outcome = 'runoff_tie';
      pendingNext = 'next_round';
      effects.push({ type: 'system_message', text: '加赛再次平票，本轮无人被淘汰' });
    }
  }

  s.lastVoteSummary = { round: s.round, kind, outcome, eliminatedPlayerId, eliminatedRole, tally };
  s.pendingOutcome = { next: pendingNext, candidates, winner };
  s.phase = 'vote_result';
  s.deadlineAt = ctx.now + VOTE_RESULT_MS;
  events.push({ type: 'phase_changed', phase: 'vote_result', round: s.round });
  if (pendingNext === 'game_over') {
    // 普通终局：有 pending 猜词则只记暂存，不调度 result 计时器（等待裁判）
    const hadPending = s.guess !== null && s.guess.status === 'pending';
    deferOrFinalize(s, winner!, events, effects);
    if (hadPending && s.deferredOutcome !== null) return;
  }
  effects.push({
    type: 'schedule_timer',
    timerId: blankResultTimerId(s.round, kind),
    deadlineAt: s.deadlineAt,
    action: { type: 'vote_result_elapsed', round: s.round },
  });
}

// —— 猜词校验（NORM-001/002） ——

/** 归一化并校验猜词；返回归一化文本或错误信息。 */
function normalizeGuessText(raw: string): { ok: true; value: string } | { ok: false; message: string } {
  let normalized: string;
  try {
    normalized = normalizeBlankAdjudicationText(raw);
  } catch {
    return { ok: false, message: '猜词包含控制字符或换行' };
  }
  if (!isValidBlankAdjudicationText(normalized)) {
    return { ok: false, message: '猜词需为 1–64 个 Unicode 码点' };
  }
  return { ok: true, value: normalized };
}

function digest(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

/** 提交猜词（主动或终局）：冻结资格与序号 → 声明外部裁判任务。 */
function submitGuess(
  s: State,
  ctx: GameContext,
  playerId: string,
  rawGuess: string,
  phase: 'active' | 'final',
  sessionIdInput: string | undefined,
  events: BlankEvent[],
  effects: BlankEffect[],
): BlankReduceResult {
  const p = s.players[playerId];
  if (!p) return deny('你不在本局或已被淘汰');
  if (p.role !== 'blank') return deny('只有白板可以猜词');
  if (s.guess !== null) return deny('猜词机会已消耗，不能重复猜词');
  if (phase === 'active') {
    if (!p.alive) return deny('你不在本局或已被淘汰');
    if (s.phase !== 'speaking' && s.phase !== 'voting' && s.phase !== 'runoff_voting') {
      return deny('当前阶段不能猜词');
    }
  } else if (s.phase !== 'final_guess') {
    return deny('当前不在终局猜词阶段');
  }
  const sessionId = sessionIdInput ?? s.sessionId;
  if (!sessionId) return deny('缺少会话标识，无法发起外部裁判');

  const normalized = normalizeGuessText(rawGuess);
  if (!normalized.ok) return deny(normalized.message);
  const normalizedGuess = normalized.value;
  const normalizedStandardAnswer = normalizeBlankAdjudicationText(s.civilianWord);

  const taskId = `blank.${playerId}.${s.taskSeq + 1}`;
  const submittedAtSeq = s.taskSeq + 1;
  const inputPlaintextJson = JSON.stringify({
    normalizedStandardAnswer,
    normalizedGuess,
    adjudicationPolicyVersion: ADJUDICATION_POLICY_VERSION,
  });
  s.taskSeq = submittedAtSeq;
  s.sessionId = sessionId;
  s.guess = {
    taskId,
    playerId,
    submittedAtSeq,
    phase,
    status: 'pending',
    normalizedGuess,
    normalizedStandardAnswer,
    resolvedClassification: null,
    resolvedSource: null,
  };
  if (phase === 'final') {
    effects.push({ type: 'cancel_timer', timerId: blankFinalGuessTimerId(s.round) });
  }
  events.push({ type: 'guess_submitted', playerId, taskId });
  effects.push({
    type: 'enqueue_adjudication',
    taskId,
    sessionId,
    rulesetId: 'undercover_blank_v1',
    taskType: 'blank_word_adjudication',
    submittedAtSeq,
    eligibilityDigest: digest(JSON.stringify({
      playerId,
      phase: s.phase,
      round: s.round,
      // active 猜词要求存活；终局猜词发生在白板被淘汰后（alive=false）。
      alive: p.alive,
      opportunity: 'unused',
      submittedAtSeq,
    })),
    inputDigest: digest(inputPlaintextJson),
    inputPlaintextJson,
  });
  return {
    ok: true,
    nextState: s,
    publicEvents: [],
    privateEvents: [{ recipients: [playerId], event: { type: 'guess_submitted', playerId, taskId } }],
    effects,
    resultCandidate: null,
  };
}

/** 从外部裁判结果提取 verdict/source/classification（runner 的有界结果）。 */
function extractAdjudicationVerdict(result: unknown): 'equivalent' | 'not_equivalent' | null {
  if (typeof result !== 'object' || result === null) return null;
  const verdict = (result as Record<string, unknown>).verdict;
  return verdict === 'equivalent' || verdict === 'not_equivalent' ? verdict : null;
}

function extractResultField(result: unknown, key: string): string | null {
  if (typeof result !== 'object' || result === null) return null;
  const value = (result as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : null;
}

// —— 模块入口 ——

export function createBlankInitialState(ctx: GameContext, players: string[], config: BlankConfigInput): State {
  const n = players.length;
  if (n < 4 || n > 12) throw new Error('白板模式需为 4–12 名玩家');
  if (new Set(players).size !== n) throw new Error('玩家列表存在重复');
  const pair = WORD_BANK[ctx.random.nextInt(0, WORD_BANK.length)]!;
  const blankId = ctx.random.shuffle(players)[0]!;
  const state: State = {
    schemaVersion: 1,
    phase: 'word_reveal',
    round: 0,
    players: Object.fromEntries(
      players.map((id, seat) => [
        id,
        { seat, role: (id === blankId ? 'blank' : 'civilian') as BlankRole, alive: true, exitReason: null },
      ]),
    ),
    speakingOrder: [],
    currentSpeakerIndex: 0,
    votes: {},
    runoffCandidates: [],
    civilianWord: pair.civilianWord,
    deadlineAt: null,
    winner: null,
    config,
    confirmedPlayerIds: [],
    roundFirstSpeaker: null,
    lastVoteSummary: null,
    pendingOutcome: null,
    deferredOutcome: null,
    blankPlayerId: blankId,
    guess: null,
    taskSeq: 0,
    sessionId: '',
    aborted: false,
  };
  return blankStateSchema.parse(state);
}

export function reduceBlank(
  ctx: GameContext,
  state: State,
  actor: { kind: 'player'; playerId: string } | { kind: 'system'; source: 'timer' | 'recovery' | 'admin' },
  action: BlankAction,
): BlankReduceResult {
  if (state.phase === 'game_over') {
    return actor.kind === 'player' ? deny('对局已结束') : noop(state);
  }

  const isPlayerAction =
    action.type === 'confirm_word' ||
    action.type === 'finish_speech' ||
    action.type === 'cast_vote' ||
    action.type === 'submit_guess' ||
    action.type === 'submit_final_guess' ||
    action.type === 'skip_final_guess';
  if (isPlayerAction && actor.kind !== 'player') return deny('该动作只允许玩家发起');
  if (!isPlayerAction && actor.kind !== 'system') return deny('该动作只允许系统发起');

  const s: State = structuredClone(state) as State;
  const events: BlankEvent[] = [];
  const effects: BlankEffect[] = [];
  const done = (): BlankReduceResult => ({
    ok: true,
    nextState: s,
    publicEvents: events,
    privateEvents: [],
    effects,
    resultCandidate: null,
  });

  switch (action.type) {
    case 'begin': {
      if (state.phase !== 'word_reveal' || state.deadlineAt !== null) return noop(state);
      s.deadlineAt = ctx.now + REVEAL_TIMEOUT_MS;
      effects.push({
        type: 'schedule_timer',
        timerId: blankRevealTimerId(),
        deadlineAt: s.deadlineAt,
        action: { type: 'reveal_timeout' },
      });
      effects.push({ type: 'system_message', text: '对局开始，请查看你的词语' });
      return done();
    }

    case 'confirm_word': {
      if (actor.kind !== 'player') return deny('该动作只允许玩家发起');
      if (state.phase !== 'word_reveal') return deny('当前不在看词阶段');
      const p = state.players[actor.playerId];
      if (!p || !p.alive) return deny('你不在本局或已被淘汰');
      if (state.confirmedPlayerIds.includes(actor.playerId)) return noop(state);
      s.confirmedPlayerIds = [...state.confirmedPlayerIds, actor.playerId];
      const allConfirmed = alivePlayerIds(s).every((id) => s.confirmedPlayerIds.includes(id));
      if (allConfirmed) {
        effects.push({ type: 'cancel_timer', timerId: blankRevealTimerId() });
        startRound(s, ctx, 1, events, effects);
      }
      return done();
    }

    case 'reveal_timeout': {
      if (state.phase !== 'word_reveal') return noop(state);
      startRound(s, ctx, 1, events, effects);
      return done();
    }

    case 'finish_speech': {
      if (actor.kind !== 'player') return deny('该动作只允许玩家发起');
      if (state.phase !== 'speaking') return deny('当前不在发言阶段');
      const speaker = state.speakingOrder[state.currentSpeakerIndex];
      if (speaker !== actor.playerId || !state.players[actor.playerId]?.alive) {
        return deny('当前不轮到你发言');
      }
      effects.push({ type: 'cancel_timer', timerId: blankSpeechTimerId(state.round, state.currentSpeakerIndex) });
      advanceSpeaker(s, ctx, events, effects);
      return done();
    }

    case 'speech_timeout': {
      if (
        state.phase !== 'speaking' ||
        action.round !== state.round ||
        action.speakerIndex !== state.currentSpeakerIndex
      ) {
        return noop(state);
      }
      advanceSpeaker(s, ctx, events, effects);
      return done();
    }

    case 'cast_vote': {
      if (actor.kind !== 'player') return deny('该动作只允许玩家发起');
      const kind = state.phase === 'voting' ? 'normal' : state.phase === 'runoff_voting' ? 'runoff' : null;
      if (kind === null) return deny('当前不在投票阶段');
      const voter = state.players[actor.playerId];
      if (!voter || !voter.alive) return deny('你不在本局或已被淘汰');
      if (actor.playerId in state.votes) return deny('选票已锁定，不能修改');
      if (action.targetPlayerId === actor.playerId) return deny('不能投自己');
      const target = state.players[action.targetPlayerId];
      if (!target || !target.alive) return deny('目标不是存活玩家');
      if (kind === 'runoff' && !state.runoffCandidates.includes(action.targetPlayerId)) {
        return deny('加赛只能投候选人');
      }
      s.votes = { ...state.votes, [actor.playerId]: action.targetPlayerId };
      const allVoted = alivePlayerIds(s).every((id) => id in s.votes);
      if (allVoted) {
        effects.push({ type: 'cancel_timer', timerId: blankVoteTimerId(s.round, kind) });
        settleVotes(s, ctx, kind, events, effects);
      }
      return done();
    }

    case 'vote_timeout': {
      const kind = state.phase === 'voting' ? 'normal' : state.phase === 'runoff_voting' ? 'runoff' : null;
      if (kind === null || action.kind !== kind || action.round !== state.round) return noop(state);
      settleVotes(s, ctx, kind, events, effects);
      return done();
    }

    case 'vote_result_elapsed': {
      if (state.phase !== 'vote_result' || action.round !== state.round || !state.pendingOutcome) {
        return noop(state);
      }
      const pending = state.pendingOutcome;
      if (pending.next === 'game_over') {
        // 暂存（deferredOutcome）时未调度本计时器；防御性直接终局。
        finishGame(s, pending.winner, events, effects);
      } else if (pending.next === 'runoff') {
        const candidates = pending.candidates.filter((id) => s.players[id]?.alive);
        if (candidates.length >= 2) {
          startVoting(s, ctx, 'runoff', candidates, events, effects);
        } else {
          startRound(s, ctx, s.round + 1, events, effects);
        }
      } else {
        startRound(s, ctx, s.round + 1, events, effects);
      }
      return done();
    }

    case 'submit_guess': {
      if (actor.kind !== 'player') return deny('该动作只允许玩家发起');
      return submitGuess(s, ctx, actor.playerId, action.guess, 'active', action.sessionId, events, effects);
    }

    case 'submit_final_guess': {
      if (actor.kind !== 'player') return deny('该动作只允许玩家发起');
      return submitGuess(s, ctx, actor.playerId, action.guess, 'final', action.sessionId, events, effects);
    }

    case 'skip_final_guess': {
      if (actor.kind !== 'player') return deny('该动作只允许玩家发起');
      if (state.phase !== 'final_guess') return deny('当前不在终局猜词阶段');
      const p = state.players[actor.playerId];
      if (!p || p.role !== 'blank') return deny('只有白板可以跳过终局猜词');
      if (state.guess !== null) return deny('终局猜词已提交，不能跳过');
      effects.push({ type: 'cancel_timer', timerId: blankFinalGuessTimerId(state.round) });
      events.push({ type: 'guess_skipped', playerId: actor.playerId });
      finishGame(s, 'civilian', events, effects);
      return done();
    }

    case 'final_guess_timeout': {
      if (state.phase !== 'final_guess' || action.round !== state.round) return noop(state);
      if (state.guess !== null) return noop(state); // 已提交，等待裁判
      finishGame(s, 'civilian', events, effects); // 超时按猜错
      return done();
    }

    case 'external_task_result': {
      // 终局后迟到结果丢弃：reduce 顶部已对 game_over 统一 noop（TASK-001）。
      const g = state.guess;
      if (!g || g.status !== 'pending' || g.taskId !== action.taskId) return noop(state);
      if (action.expectedSequence !== g.submittedAtSeq) return noop(state); // 乱序/过期
      const verdict = extractAdjudicationVerdict(action.result);
      if (verdict === null) return noop(state); // 结构化结果缺失 → 防御性忽略
      const equivalent = verdict === 'equivalent';
      s.guess = {
        ...g,
        status: equivalent ? 'resolved_equivalent' : 'resolved_not_equivalent',
        normalizedGuess: null,
        normalizedStandardAnswer: null,
        resolvedClassification: extractResultField(action.result, 'classification'),
        resolvedSource: extractResultField(action.result, 'source'),
      };
      s.deferredOutcome = null;
      if (equivalent) {
        // 更早提交的 equivalent 覆盖暂存普通结果（ASYNC-002）
        finishGame(s, 'blank', events, effects);
      } else {
        // 猜错：白板立即淘汰（若仍存活），恰一名白板 → 平民胜
        const blankId = s.blankPlayerId;
        if (blankId && s.players[blankId]?.alive) {
          eliminate(s, blankId, 'guess_wrong', events);
        }
        finishGame(s, 'civilian', events, effects);
      }
      return done();
    }

    case 'player_forfeited': {
      const affected = action.playerIds.filter((id) => s.players[id]?.alive);
      if (affected.length === 0) return noop(state);
      for (const id of affected) eliminate(s, id, 'disconnect_timeout', events);

      if (alivePlayerIds(s).length === 0) {
        const timer = currentPhaseTimerId(state);
        if (timer) effects.push({ type: 'cancel_timer', timerId: timer });
        s.aborted = true;
        finishGame(s, null, events, effects);
        effects.push({ type: 'system_message', text: '所有玩家均已退出，对局终止' });
        return done();
      }

      const winner = checkWinner(s);
      if (winner) {
        const timer = currentPhaseTimerId(state);
        if (timer) effects.push({ type: 'cancel_timer', timerId: timer });
        deferOrFinalize(s, winner, events, effects);
        return done();
      }

      if (s.phase === 'word_reveal') {
        const allConfirmed =
          s.deadlineAt !== null && alivePlayerIds(s).every((id) => s.confirmedPlayerIds.includes(id));
        if (allConfirmed) {
          effects.push({ type: 'cancel_timer', timerId: blankRevealTimerId() });
          startRound(s, ctx, 1, events, effects);
        }
      } else if (s.phase === 'speaking') {
        const speaker = s.speakingOrder[s.currentSpeakerIndex];
        if (speaker !== undefined && !s.players[speaker]?.alive) {
          effects.push({
            type: 'cancel_timer',
            timerId: blankSpeechTimerId(s.round, s.currentSpeakerIndex),
          });
          advanceSpeaker(s, ctx, events, effects);
        }
      } else if (s.phase === 'voting' || s.phase === 'runoff_voting') {
        const kind = s.phase === 'voting' ? 'normal' : 'runoff';
        const allVoted = alivePlayerIds(s).every((id) => id in s.votes);
        if (allVoted) {
          effects.push({ type: 'cancel_timer', timerId: blankVoteTimerId(s.round, kind) });
          settleVotes(s, ctx, kind, events, effects);
        }
      }
      return done();
    }

    case 'abort_game': {
      const timer = currentPhaseTimerId(state);
      if (timer) effects.push({ type: 'cancel_timer', timerId: timer });
      s.aborted = true;
      finishGame(s, null, events, effects);
      effects.push({ type: 'system_message', text: '对局已终止' });
      return done();
    }
  }
}

// —— 视角 ——

function revealedRoleFor(s: State, playerId: string): BlankRole | null {
  const p = s.players[playerId];
  if (!p) return null;
  return canRevealRole(s, p) ? p.role : null;
}

function inVotingPhase(s: State): boolean {
  return s.phase === 'voting' || s.phase === 'runoff_voting';
}

function guessEligiblePhases(s: State): boolean {
  return s.phase === 'speaking' || s.phase === 'voting' || s.phase === 'runoff_voting';
}

export function buildBlankPublicView(s: State): BlankPublicView {
  const over = s.phase === 'game_over';
  const players = Object.entries(s.players)
    .sort(([, a], [, b]) => a.seat - b.seat)
    .map(([playerId, p]) => ({
      playerId,
      seat: p.seat,
      alive: p.alive,
      exitReason: p.exitReason,
      revealedRole: over ? p.role : revealedRoleFor(s, playerId),
    }));
  return {
    gameId: 'undercover',
    rulesetId: 'undercover_blank_v1',
    phase: s.phase,
    round: s.round,
    players,
    speakingOrder: [...s.speakingOrder],
    currentSpeakerId: s.phase === 'speaking' ? s.speakingOrder[s.currentSpeakerIndex] ?? null : null,
    deadlineAt: s.deadlineAt,
    votesSubmitted: inVotingPhase(s) ? Object.keys(s.votes).length : 0,
    votesExpected: inVotingPhase(s) ? alivePlayerIds(s).length : 0,
    runoffCandidates: [...s.runoffCandidates],
    confirmedPlayerIds: [...s.confirmedPlayerIds],
    lastVoteSummary: s.lastVoteSummary ? { ...s.lastVoteSummary, tally: { ...s.lastVoteSummary.tally } } : null,
    winner: s.winner,
    aborted: s.aborted,
    guessPending: s.guess?.status === 'pending',
    revealMode: s.config.revealMode,
    reveal: over
      ? {
          civilianWord: s.civilianWord,
          roles: Object.fromEntries(Object.entries(s.players).map(([id, p]) => [id, p.role])),
        }
      : null,
  };
}

export function buildBlankPlayerView(s: State, playerId: string): BlankPlayerView {
  const base = buildBlankPublicView(s);
  const entry = s.players[playerId];
  if (!entry) return { ...base, me: null };
  const over = s.phase === 'game_over';
  const isBlank = entry.role === 'blank';
  const me: BlankPlayerMeView = {
    playerId,
    word: isBlank ? null : s.civilianWord,
    role: over ? entry.role : revealedRoleFor(s, playerId),
    alive: entry.alive,
    confirmed: s.confirmedPlayerIds.includes(playerId),
    hasVoted: playerId in s.votes,
    myVote: s.votes[playerId] ?? null,
    isBlank,
    canGuess: isBlank && entry.alive && s.guess === null && guessEligiblePhases(s),
    canSubmitFinalGuess: isBlank && s.phase === 'final_guess' && s.guess === null,
    guessUsed: s.guess !== null,
    guessPending: s.guess?.playerId === playerId && s.guess.status === 'pending',
  };
  return { ...base, me };
}

export function buildBlankSpectatorView(s: State): BlankSpectatorView {
  return buildBlankPublicView(s);
}

export function buildBlankResult(s: State): BlankResult | null {
  if (s.phase !== 'game_over') return null;
  return {
    winner: s.winner,
    side: s.winner === 'blank' ? 'blank' : 'civilian',
    aborted: s.aborted,
    rounds: s.round,
    roles: Object.fromEntries(Object.entries(s.players).map(([id, p]) => [id, p.role])),
    civilianWord: s.civilianWord,
    blankWord: null,
  };
}

// —— 不变量 ——

function assertUnique(values: readonly string[], label: string): void {
  if (new Set(values).size !== values.length) throw new Error(`${label}包含重复玩家`);
}

export function assertBlankInvariants(s: State): void {
  const ids = Object.keys(s.players);
  if (ids.length < 4 || ids.length > 12) throw new Error('白板模式玩家数量不合法（4–12）');
  const seats = Object.values(s.players).map((p) => p.seat);
  if (new Set(seats).size !== seats.length) throw new Error('白板席位必须唯一');
  const blanks = ids.filter((id) => s.players[id]!.role === 'blank');
  if (blanks.length !== 1) throw new Error('白板模式必须恰好一名白板');
  if (s.blankPlayerId !== blanks[0]) throw new Error('blankPlayerId 必须指向唯一白板');
  if (s.players[blanks[0]!]!.role !== 'blank') throw new Error('白板角色必须为 blank');

  const known = new Set(ids);
  for (const [label, references] of [
    ['发言顺序', s.speakingOrder],
    ['加赛候选', s.runoffCandidates],
    ['看词确认', s.confirmedPlayerIds],
  ] as const) {
    assertUnique(references, label);
    if (references.some((id) => !known.has(id))) throw new Error(`${label}引用未知玩家`);
  }
  if (s.roundFirstSpeaker !== null && !known.has(s.roundFirstSpeaker)) {
    throw new Error('首位发言者引用未知玩家');
  }
  for (const [voter, target] of Object.entries(s.votes)) {
    if (!known.has(voter) || !known.has(target)) throw new Error('选票引用未知玩家');
    if (voter === target) throw new Error('白板规则不允许自投');
    if (
      (s.phase === 'voting' || s.phase === 'runoff_voting') &&
      (!s.players[voter]!.alive || !s.players[target]!.alive)
    ) {
      throw new Error('投票阶段选票必须属于存活玩家');
    }
  }
  if (s.phase === 'speaking') {
    const current = s.speakingOrder[s.currentSpeakerIndex];
    if (!current || !s.players[current]?.alive) throw new Error('当前发言者必须是存活玩家');
  }
  if (s.guess) {
    if (s.guess.playerId !== s.blankPlayerId) throw new Error('猜词记录必须属于白板');
    if (s.guess.normalizedGuess !== null && !isValidBlankAdjudicationText(s.guess.normalizedGuess)) {
      throw new Error('猜词明文长度非法');
    }
  }
  if (s.deferredOutcome && s.guess?.status !== 'pending') {
    throw new Error('暂存结果必须关联待定猜词');
  }
  if (s.phase === 'game_over' && s.winner === null && !s.aborted) {
    throw new Error('正常终局必须有胜方');
  }
}

export type { BlankDeferredOutcome, BlankPendingOutcome, BlankVoteSummary };
