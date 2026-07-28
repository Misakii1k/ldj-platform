/**
 * 谁是卧底：三类视角构造（SPEC §6.9）。
 * 白名单式重建：从内部状态挑选可见字段，绝不序列化后"删字段"。
 * 任意玩家视角不得包含其他存活玩家的角色或词语（§6.10 不变量）。
 */
import type {
  UndercoverPhase,
  UndercoverRole,
  UndercoverState,
  VoteSummary,
} from './state.ts';

export interface PublicPlayerInfo {
  playerId: string;
  seat: number;
  alive: boolean;
  exitReason: 'voted_out' | 'disconnect_timeout' | null;
  /** 仅已公开淘汰者或游戏结束后可见 */
  revealedRole: UndercoverRole | null;
}

export interface UndercoverPublicView {
  phase: UndercoverPhase;
  round: number;
  players: PublicPlayerInfo[];
  speakingOrder: string[];
  currentSpeakerId: string | null;
  deadlineAt: number | null;
  /** 投票进度只公开数量，不公开谁投了谁（§6.5） */
  votesSubmitted: number;
  votesExpected: number;
  runoffCandidates: string[];
  confirmedPlayerIds: string[];
  lastVoteSummary: VoteSummary | null;
  winner: UndercoverRole | null;
  aborted: boolean;
  /** 游戏结束后全部公开（§6.1/§6.9） */
  reveal: {
    civilianWord: string;
    undercoverWord: string;
    roles: Record<string, UndercoverRole>;
  } | null;
}

export interface UndercoverPlayerView extends UndercoverPublicView {
  me: {
    playerId: string;
    /** 自己的词语；观战者与非本局成员为 null */
    word: string | null;
    /** 存活期间 UI 不直接显示阵营（§6.3）；淘汰后或游戏结束可见 */
    role: UndercoverRole | null;
    alive: boolean;
    confirmed: boolean;
    hasVoted: boolean;
    myVote: string | null;
  } | null;
}

export type UndercoverSpectatorView = UndercoverPublicView;

function isGameOver(state: UndercoverState): boolean {
  return state.phase === 'game_over';
}

function currentSpeakerId(state: UndercoverState): string | null {
  if (state.phase !== 'speaking') return null;
  return state.speakingOrder[state.currentSpeakerIndex] ?? null;
}

function inVotingPhase(state: UndercoverState): boolean {
  return state.phase === 'voting' || state.phase === 'runoff_voting';
}

export function buildPublicView(state: UndercoverState): UndercoverPublicView {
  const over = isGameOver(state);
  const aliveIds = Object.entries(state.players)
    .filter(([, p]) => p.alive)
    .map(([id]) => id);

  const players: PublicPlayerInfo[] = Object.entries(state.players)
    .sort(([, a], [, b]) => a.seat - b.seat)
    .map(([playerId, p]) => ({
      playerId,
      seat: p.seat,
      alive: p.alive,
      exitReason: p.exitReason ?? null,
      // 白名单：仅已淘汰者公开阵营；游戏结束后全公开
      revealedRole: !p.alive || over ? p.role : null,
    }));

  return {
    phase: state.phase,
    round: state.round,
    players,
    speakingOrder: [...state.speakingOrder],
    currentSpeakerId: currentSpeakerId(state),
    deadlineAt: state.deadlineAt,
    votesSubmitted: inVotingPhase(state) ? Object.keys(state.votes).length : 0,
    votesExpected: inVotingPhase(state) ? aliveIds.length : 0,
    runoffCandidates: [...state.runoffCandidates],
    confirmedPlayerIds: [...state.confirmedPlayerIds],
    lastVoteSummary: state.lastVoteSummary ? { ...state.lastVoteSummary, tally: { ...state.lastVoteSummary.tally } } : null,
    winner: state.winner,
    aborted: state.aborted,
    reveal: over
      ? {
          civilianWord: state.civilianWord,
          undercoverWord: state.undercoverWord,
          roles: Object.fromEntries(Object.entries(state.players).map(([id, p]) => [id, p.role])),
        }
      : null,
  };
}

export function buildPlayerView(state: UndercoverState, playerId: string): UndercoverPlayerView {
  const base = buildPublicView(state);
  const entry = state.players[playerId];
  if (!entry) return { ...base, me: null };

  const over = isGameOver(state);
  const myWord = entry.role === 'undercover' ? state.undercoverWord : state.civilianWord;
  return {
    ...base,
    me: {
      playerId,
      word: myWord,
      role: !entry.alive || over ? entry.role : null,
      alive: entry.alive,
      confirmed: state.confirmedPlayerIds.includes(playerId),
      hasVoted: playerId in state.votes,
      myVote: state.votes[playerId] ?? null,
    },
  };
}

export function buildSpectatorView(state: UndercoverState): UndercoverSpectatorView {
  return buildPublicView(state);
}
