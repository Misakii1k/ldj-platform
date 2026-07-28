/**
 * 谁是卧底 GameModule 实现（SPEC §6 全章 + 附录 D-1~D-4、D-7）。
 * 纯函数：不做 I/O，不用 Date.now()/Math.random()；时间与随机全部来自 GameContext；
 * 计时与系统消息以 effect 描述。reduce 不修改传入状态（先克隆再变更）。
 */
import type { GameContext, GameEffect, GameModule, ReduceResult } from '@ldj/shared';
import { UNDERCOVER_MANIFEST } from '../shared/manifest.ts';
import { WORD_BANK, WORD_BANK_VERSION } from './words.ts';
import {
  UNDERCOVER_STATE_SCHEMA_VERSION,
  undercoverActionSchema,
  undercoverConfigSchema,
  undercoverStateSchema,
  type UndercoverAction,
  type UndercoverConfig,
  type UndercoverEvent,
  type UndercoverResult,
  type UndercoverRole,
  type UndercoverState,
} from './state.ts';
import {
  buildPlayerView,
  buildSpectatorView,
  type UndercoverPlayerView,
  type UndercoverSpectatorView,
} from './views.ts';

const REVEAL_TIMEOUT_MS = 30_000; // §6.3：30 秒后自动进入发言
const VOTE_RESULT_MS = 5_000; // 附录 D-3：结果展示固定 5 秒

type Result = ReduceResult<UndercoverState, UndercoverEvent>;

// —— 计时器命名：每个实例全局唯一，(session, timerId) 不复用 ——

const revealTimerId = 'reveal';
const speechTimerId = (round: number, idx: number): string => `speech:${round}:${idx}`;
const voteTimerId = (round: number, kind: 'normal' | 'runoff'): string =>
  kind === 'normal' ? `vote:${round}` : `runoff:${round}`;
const resultTimerId = (round: number, kind: 'normal' | 'runoff'): string =>
  `result:${round}:${kind}`;

// —— 查询助手 ——

function alivePlayerIds(state: UndercoverState): string[] {
  return Object.entries(state.players)
    .filter(([, p]) => p.alive)
    .sort(([, a], [, b]) => a.seat - b.seat)
    .map(([id]) => id);
}

/** §6.8：先查平民胜（卧底清零），再查卧底胜（卧底数 ≥ 平民数） */
function checkWinner(state: UndercoverState): UndercoverRole | null {
  let undercover = 0;
  let civilian = 0;
  for (const p of Object.values(state.players)) {
    if (!p.alive) continue;
    if (p.role === 'undercover') undercover += 1;
    else civilian += 1;
  }
  if (undercover === 0) return 'civilian';
  if (undercover >= civilian) return 'undercover';
  return null;
}

/** 按席位环序找 fromId 之后第一名存活玩家（fromId 自身可以已淘汰） */
function nextAliveAfter(state: UndercoverState, fromId: string): string {
  const bySeat = Object.entries(state.players).sort(([, a], [, b]) => a.seat - b.seat);
  const start = bySeat.findIndex(([id]) => id === fromId);
  for (let step = 1; step <= bySeat.length; step++) {
    const [id, p] = bySeat[(start + step) % bySeat.length]!; // 模运索引必在界内
    if (p.alive) return id;
  }
  throw new Error('没有存活玩家可作为发言者');
}

/** 存活玩家按席位顺时针，从 firstId 开始旋转（§6.1 发言顺序） */
function buildSpeakingOrder(state: UndercoverState, firstId: string): string[] {
  const alive = alivePlayerIds(state);
  const at = alive.indexOf(firstId);
  return [...alive.slice(at), ...alive.slice(0, at)];
}

function currentPhaseTimerId(state: UndercoverState): string | null {
  switch (state.phase) {
    case 'word_reveal':
      return state.deadlineAt !== null ? revealTimerId : null;
    case 'speaking':
      return speechTimerId(state.round, state.currentSpeakerIndex);
    case 'voting':
      return voteTimerId(state.round, 'normal');
    case 'runoff_voting':
      return voteTimerId(state.round, 'runoff');
    case 'vote_result':
      return state.lastVoteSummary ? resultTimerId(state.round, state.lastVoteSummary.kind) : null;
    default:
      return null;
  }
}

function noop(state: UndercoverState): Result {
  return { ok: true, state, events: [], effects: [] };
}

function deny(message: string): Result {
  return { ok: false, code: 'ACTION_NOT_ALLOWED', message };
}

// —— 变更助手（在克隆后的 draft 上操作） ——

function eliminate(
  s: UndercoverState,
  playerId: string,
  reason: 'voted_out' | 'disconnect_timeout',
  events: UndercoverEvent[],
): void {
  const p = s.players[playerId];
  if (!p) throw new Error(`未知玩家：${playerId}`);
  p.alive = false;
  p.exitReason = reason;
  events.push({ type: 'player_eliminated', playerId, role: p.role, reason });
}

function finishGame(
  s: UndercoverState,
  winner: UndercoverRole | null,
  events: UndercoverEvent[],
  effects: GameEffect[],
): void {
  s.phase = 'game_over';
  s.winner = winner;
  s.deadlineAt = null;
  s.pendingOutcome = null;
  events.push({ type: 'game_over', winner });
  if (winner) {
    effects.push({
      type: 'system_message',
      text: winner === 'civilian' ? '平民阵营胜利！' : '卧底阵营胜利！',
    });
  }
}

function startRound(
  s: UndercoverState,
  ctx: GameContext,
  round: number,
  events: UndercoverEvent[],
  effects: GameEffect[],
): void {
  const alive = alivePlayerIds(s);
  let first: string;
  if (round === 1 || s.roundFirstSpeaker === null) {
    first = alive[ctx.random.nextInt(0, alive.length)]!; // §6.1 第一轮种子化随机；索引必在界内
  } else {
    first = nextAliveAfter(s, s.roundFirstSpeaker); // 下一轮从上轮首位之后的存活玩家开始
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
    timerId: speechTimerId(round, 0),
    deadlineAt: s.deadlineAt,
    action: { type: 'speech_timeout', round, speakerIndex: 0 },
  });
  effects.push({ type: 'system_message', text: `第 ${round} 轮发言开始` });
}

function startVoting(
  s: UndercoverState,
  ctx: GameContext,
  kind: 'normal' | 'runoff',
  candidates: string[],
  events: UndercoverEvent[],
  effects: GameEffect[],
): void {
  s.phase = kind === 'normal' ? 'voting' : 'runoff_voting';
  s.votes = {};
  s.runoffCandidates = candidates;
  s.deadlineAt = ctx.now + s.config.voteSeconds * 1000;
  events.push({ type: 'phase_changed', phase: s.phase, round: s.round });
  effects.push({
    type: 'schedule_timer',
    timerId: voteTimerId(s.round, kind),
    deadlineAt: s.deadlineAt,
    action: { type: 'vote_timeout', round: s.round, kind },
  });
  if (kind === 'runoff') {
    effects.push({ type: 'system_message', text: '最高票并列，进入加赛投票' });
  }
}

/** 从当前发言者向后推进；跳过中途淘汰者；全部完成则进入投票（§6.4） */
function advanceSpeaker(
  s: UndercoverState,
  ctx: GameContext,
  events: UndercoverEvent[],
  effects: GameEffect[],
): void {
  for (let i = s.currentSpeakerIndex + 1; i < s.speakingOrder.length; i++) {
    const sid = s.speakingOrder[i]!;
    if (s.players[sid]?.alive) {
      s.currentSpeakerIndex = i;
      s.deadlineAt = ctx.now + s.config.speechSeconds * 1000;
      effects.push({
        type: 'schedule_timer',
        timerId: speechTimerId(s.round, i),
        deadlineAt: s.deadlineAt,
        action: { type: 'speech_timeout', round: s.round, speakerIndex: i },
      });
      return;
    }
  }
  startVoting(s, ctx, 'normal', [], events, effects);
}

/** 投票结算（§6.5/§6.6 + D-1/D-2）；结果进入 VOTE_RESULT 停留 5 秒（D-3） */
function settleVotes(
  s: UndercoverState,
  ctx: GameContext,
  kind: 'normal' | 'runoff',
  events: UndercoverEvent[],
  effects: GameEffect[],
): void {
  const tally: Record<string, number> = {};
  for (const target of Object.values(s.votes)) {
    // 锁定选票不因投票者断线作废（D-4）；但目标若已在结算前被淘汰，
    // 其票不再计入（已淘汰者不能再次被淘汰，§6.5）。
    if (!s.players[target]?.alive) continue;
    tally[target] = (tally[target] ?? 0) + 1;
  }
  const entries = Object.entries(tally);
  let outcome: 'eliminated' | 'tie' | 'no_votes' | 'runoff_tie';
  let eliminatedPlayerId: string | null = null;
  let eliminatedRole: UndercoverRole | null = null;
  let pendingNext: 'runoff' | 'next_round' | 'game_over';
  let candidates: string[] = [];
  let winner: UndercoverRole | null = null;

  if (entries.length === 0) {
    // D-1/D-2：全员弃票 → 无人淘汰进下一轮，不进加赛
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
      eliminatedRole = s.players[votedOutId]!.role; // 淘汰即公开阵营（§6.1）
      winner = checkWinner(s);
      pendingNext = winner ? 'game_over' : 'next_round';
    } else if (kind === 'normal') {
      outcome = 'tie';
      pendingNext = 'runoff';
      candidates = topIds;
    } else {
      // 加赛再次平票：本轮无人淘汰（§6.6）
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
  effects.push({
    type: 'schedule_timer',
    timerId: resultTimerId(s.round, kind),
    deadlineAt: s.deadlineAt,
    action: { type: 'vote_result_elapsed', round: s.round },
  });
}

// —— 模块入口 ——

export const undercoverModule: GameModule<
  UndercoverConfig,
  UndercoverState,
  UndercoverAction,
  UndercoverPlayerView,
  UndercoverSpectatorView,
  UndercoverEvent,
  UndercoverResult
> = {
  manifest: UNDERCOVER_MANIFEST,

  parseConfig(input) {
    return undercoverConfigSchema.parse(input ?? {});
  },

  parseAction(input) {
    return undercoverActionSchema.parse(input);
  },

  createInitialState(ctx, players, config) {
    const n = players.length;
    if (n < UNDERCOVER_MANIFEST.minPlayers || n > UNDERCOVER_MANIFEST.maxPlayers) {
      throw new Error(`玩家人数需为 ${UNDERCOVER_MANIFEST.minPlayers}–${UNDERCOVER_MANIFEST.maxPlayers}`);
    }
    if (new Set(players).size !== n) throw new Error('玩家列表存在重复');

    // §6.1：4–7 人 1 名卧底；8–12 人 2 名
    const undercoverCount = n >= 8 ? 2 : 1;
    const pair = WORD_BANK[ctx.random.nextInt(0, WORD_BANK.length)]!; // 词库非空且索引在界内
    // 随机决定词对方向，避免"平民词永远在前"的元信息
    const swap = ctx.random.nextInt(0, 2) === 1;
    const civilianWord = swap ? pair.undercoverWord : pair.civilianWord;
    const undercoverWord = swap ? pair.civilianWord : pair.undercoverWord;
    const undercoverIds = new Set(ctx.random.shuffle(players).slice(0, undercoverCount));

    const state: UndercoverState = {
      schemaVersion: UNDERCOVER_STATE_SCHEMA_VERSION,
      phase: 'word_reveal',
      round: 0,
      players: Object.fromEntries(
        players.map((id, seat) => [
          id,
          { seat, role: (undercoverIds.has(id) ? 'undercover' : 'civilian') as UndercoverRole, alive: true },
        ]),
      ),
      speakingOrder: [],
      currentSpeakerIndex: 0,
      votes: {},
      runoffCandidates: [],
      civilianWord,
      undercoverWord,
      deadlineAt: null, // begin 动作到达后才起表
      winner: null,
      config,
      wordBankVersion: WORD_BANK_VERSION,
      confirmedPlayerIds: [],
      roundFirstSpeaker: null,
      lastVoteSummary: null,
      pendingOutcome: null,
      aborted: false,
    };
    return undercoverStateSchema.parse(state);
  },

  reduce(ctx, state, actor, action): Result {
    // game_over 后任何动作不得改变结果（§6.10）
    if (state.phase === 'game_over') {
      return actor.kind === 'player' ? deny('对局已结束') : noop(state);
    }

    const isPlayerAction =
      action.type === 'confirm_word' || action.type === 'finish_speech' || action.type === 'cast_vote';
    if (isPlayerAction && actor.kind !== 'player') return deny('该动作只允许玩家发起');
    if (!isPlayerAction && actor.kind !== 'system') return deny('该动作只允许系统发起');

    const s = structuredClone(state);
    const events: UndercoverEvent[] = [];
    const effects: GameEffect[] = [];
    const done = (): Result => ({ ok: true, state: undercoverStateSchema.parse(s), events, effects });

    switch (action.type) {
      case 'begin': {
        // 幂等：只在看词阶段未起表时生效
        if (state.phase !== 'word_reveal' || state.deadlineAt !== null) return noop(state);
        s.deadlineAt = ctx.now + REVEAL_TIMEOUT_MS;
        effects.push({
          type: 'schedule_timer',
          timerId: revealTimerId,
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
        if (state.confirmedPlayerIds.includes(actor.playerId)) return noop(state); // 重复确认幂等
        s.confirmedPlayerIds.push(actor.playerId);
        // §6.3：所有在线玩家确认后立即发言；离线玩家由 30 秒计时器兜底
        const allConfirmed = alivePlayerIds(s).every((id) => s.confirmedPlayerIds.includes(id));
        if (allConfirmed) {
          effects.push({ type: 'cancel_timer', timerId: revealTimerId });
          startRound(s, ctx, 1, events, effects);
        }
        return done();
      }

      case 'reveal_timeout': {
        if (state.phase !== 'word_reveal') return noop(state); // 迟到的旧计时器
        startRound(s, ctx, 1, events, effects);
        return done();
      }

      case 'finish_speech': {
        if (actor.kind !== 'player') return deny('该动作只允许玩家发起');
        if (state.phase !== 'speaking') return deny('当前不在发言阶段');
        const speaker = state.speakingOrder[state.currentSpeakerIndex];
        if (speaker !== actor.playerId || !state.players[actor.playerId]?.alive) {
          return deny('当前不轮到你发言'); // 已淘汰/过期/不在顺序中（§6.4）
        }
        effects.push({
          type: 'cancel_timer',
          timerId: speechTimerId(state.round, state.currentSpeakerIndex),
        });
        advanceSpeaker(s, ctx, events, effects);
        return done();
      }

      case 'speech_timeout': {
        if (
          state.phase !== 'speaking' ||
          action.round !== state.round ||
          action.speakerIndex !== state.currentSpeakerIndex
        ) {
          return noop(state); // 已被提前结束，旧计时器失效
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
        if (actor.playerId in state.votes) return deny('选票已锁定，不能修改'); // §6.5
        if (action.targetPlayerId === actor.playerId) return deny('不能投自己');
        const target = state.players[action.targetPlayerId];
        if (!target || !target.alive) return deny('目标不是存活玩家');
        if (kind === 'runoff' && !state.runoffCandidates.includes(action.targetPlayerId)) {
          return deny('加赛只能投候选人');
        }
        s.votes[actor.playerId] = action.targetPlayerId;
        // 全部存活玩家提交后提前结算（在线判定由平台层负责，离线者由计时器兜底）
        const allVoted = alivePlayerIds(s).every((id) => id in s.votes);
        if (allVoted) {
          effects.push({ type: 'cancel_timer', timerId: voteTimerId(s.round, kind) });
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
          finishGame(s, pending.winner, events, effects);
        } else if (pending.next === 'runoff') {
          // 候选人可能在展示期内因掉线超时被淘汰；不足 2 人时无法加赛，进下一轮
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

      case 'player_forfeited': {
        // §6.7：席位保留期结束 → 批量标记退出，再统一判定胜负
        const affected = action.playerIds.filter((id) => s.players[id]?.alive);
        if (affected.length === 0) return noop(state);
        for (const id of affected) eliminate(s, id, 'disconnect_timeout', events);

        if (alivePlayerIds(s).length === 0) {
          // 已无任何存活玩家：ABORTED，不虚构胜方
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
          finishGame(s, winner, events, effects);
          return done();
        }

        // 无胜负：按当前阶段修补推进点
        if (s.phase === 'word_reveal') {
          const allConfirmed =
            s.deadlineAt !== null && alivePlayerIds(s).every((id) => s.confirmedPlayerIds.includes(id));
          if (allConfirmed) {
            effects.push({ type: 'cancel_timer', timerId: revealTimerId });
            startRound(s, ctx, 1, events, effects);
          }
        } else if (s.phase === 'speaking') {
          const speaker = s.speakingOrder[s.currentSpeakerIndex];
          if (speaker !== undefined && !s.players[speaker]?.alive) {
            effects.push({
              type: 'cancel_timer',
              timerId: speechTimerId(s.round, s.currentSpeakerIndex),
            });
            advanceSpeaker(s, ctx, events, effects);
          }
        } else if (s.phase === 'voting' || s.phase === 'runoff_voting') {
          // 平台在结算安全点之后才投递本动作（D-7）；已锁定选票不作废（D-4）。
          // 防御：若剩余存活者恰好都已投票，直接结算。
          const kind = s.phase === 'voting' ? 'normal' : 'runoff';
          const allVoted = alivePlayerIds(s).every((id) => id in s.votes);
          if (allVoted) {
            effects.push({ type: 'cancel_timer', timerId: voteTimerId(s.round, kind) });
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
  },

  getPlayerView(state, playerId) {
    return buildPlayerView(state, playerId);
  },

  getSpectatorView(state) {
    return buildSpectatorView(state);
  },

  getResult(state) {
    if (state.phase !== 'game_over') return null;
    return {
      winner: state.winner,
      aborted: state.aborted,
      rounds: state.round,
      roles: Object.fromEntries(Object.entries(state.players).map(([id, p]) => [id, p.role])),
      civilianWord: state.civilianWord,
      undercoverWord: state.undercoverWord,
    };
  },

  migrateSnapshot(fromVersion, snapshot) {
    if (fromVersion === UNDERCOVER_STATE_SCHEMA_VERSION) {
      return undercoverStateSchema.parse(snapshot);
    }
    // 无法迁移时由内核进入 ABORTED（§8.5），不猜测恢复
    throw new Error(`无法从状态版本 ${fromVersion} 迁移`);
  },
};
