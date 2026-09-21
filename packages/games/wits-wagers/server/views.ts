import type {
  WitsWagersState,
  WitsWagersPhase,
  BoardTarget,
  BetPair,
  RoundResult,
  FinalResult,
  Guess,
} from './types.ts';
import { defaultBetPair } from './state.ts';

export interface QuestionBriefView {
  prompt: string;
  unit: string;
}

export interface PlayerSummaryView {
  playerId: string;
  score: number;
  winningGuesses: number;
  hasSubmitted: boolean;
  forfeited: boolean;
}

export interface WitsWagersPublicView {
  gameId: 'wits-wagers';
  rulesetId: 'wits_wagers_platform_v1';
  viewVersion: 1;
  phase: WitsWagersPhase;
  round: number;
  totalRounds: 7;
  phaseEpoch: number;
  roundToken: string;
  deadlineAt: number | null;
  question: QuestionBriefView | null;
  players: PlayerSummaryView[];
  board: BoardTarget[];
  publicBets: Record<string, BetPair>;
  revealed: RoundResult | null;
  history: RoundResult[];
  result: FinalResult | null;
}

export interface WitsWagersMeView {
  playerId: string;
  submittedGuess: Guess | null;
  guessRevision: number;
  acceptedBets: BetPair;
  betRevision: number;
  reserved: number;
  available: number;
  canGuess: boolean;
  canBet: boolean;
}

export interface WitsWagersPlayerView extends WitsWagersPublicView {
  me: WitsWagersMeView | null;
}

export type WitsWagersSpectatorView = WitsWagersPublicView;

/**
 * 构建公共视角（02 §3）。
 * 遵循严格白名单与信息隐藏原则：
 * - created 阶段 question 为 null，board/publicBets 为空；
 * - answering 阶段 question 仅包含 prompt/unit，绝不包含 answer/source 等私密字段；
 *   board 和 publicBets 保持为空，不泄露任何人的猜测或下注；
 * - arranging 阶段公开版图，publicBets 仍为空；
 * - betting 阶段起公开 publicBets；
 * - settlement/game_over 阶段 revealed 暴露当前轮 RoundResult（含已揭晓标准答案与来源），
 *   game_over 阶段 result 暴露 FinalResult。
 */
export function buildPublicView(state: WitsWagersState): WitsWagersPublicView {
  let question: QuestionBriefView | null = null;
  if (state.phase !== 'created' && state.phase !== 'game_over') {
    const q = state.questionPlan[state.round - 1];
    if (q) {
      question = {
        prompt: q.prompt,
        unit: q.unit,
      };
    }
  }

  const players: PlayerSummaryView[] = state.players.map((pid) => {
    const guess = state.guesses[pid];
    const hasSubmitted = guess !== null && guess !== undefined && guess.origin === 'submitted';
    return {
      playerId: pid,
      score: state.scores[pid] ?? 0,
      winningGuesses: state.winningGuesses[pid] ?? 0,
      hasSubmitted,
      forfeited: state.forfeitedIds.includes(pid),
    };
  });

  const board: BoardTarget[] =
    state.phase === 'created' || state.phase === 'answering'
      ? []
      : state.board.map((t) => ({ ...t, authors: [...t.authors] }));

  const publicBets: Record<string, BetPair> = {};
  if (state.phase === 'betting' || state.phase === 'settlement' || state.phase === 'game_over') {
    for (const pid of state.players) {
      const b = state.bets[pid] ?? defaultBetPair();
      publicBets[pid] = [
        { ...b[0] },
        { ...b[1] },
      ];
    }
  }

  const revealed =
    state.phase === 'settlement' || state.phase === 'game_over'
      ? (state.history[state.history.length - 1] ?? null)
      : null;

  const result = state.phase === 'game_over' ? state.result : null;

  return {
    gameId: 'wits-wagers',
    rulesetId: 'wits_wagers_platform_v1',
    viewVersion: 1,
    phase: state.phase,
    round: state.round,
    totalRounds: 7,
    phaseEpoch: state.phaseEpoch,
    roundToken: state.roundToken,
    deadlineAt: state.deadlineAt,
    question,
    players,
    board,
    publicBets,
    revealed,
    history: state.history.map((h) => ({
      ...h,
      board: h.board.map((t) => ({ ...t })),
      bets: { ...h.bets },
      awardedAuthors: [...h.awardedAuthors],
      ledger: h.ledger.map((l) => ({ ...l })),
    })),
    result,
  };
}

/**
 * 构建参赛玩家视角。
 * 若 playerId 非参赛者，me 恒为 null，不抛出私密状态。
 */
export function buildPlayerView(
  state: WitsWagersState,
  playerId: string,
): WitsWagersPlayerView {
  const publicView = buildPublicView(state);

  if (!state.players.includes(playerId)) {
    return {
      ...publicView,
      me: null,
    };
  }

  const guess = state.guesses[playerId] ?? null;
  const guessRevision = state.guessRevisions[playerId] ?? 0;
  const acceptedBets = state.bets[playerId] ?? defaultBetPair();
  const betRevision = state.betRevisions[playerId] ?? 0;
  const score = state.scores[playerId] ?? 0;

  let reserved = 0;
  if (state.phase === 'betting') {
    const extraA = acceptedBets[0].targetId !== null ? acceptedBets[0].extraStake : 0;
    const extraB = acceptedBets[1].targetId !== null ? acceptedBets[1].extraStake : 0;
    reserved = extraA + extraB;
  }

  const available = state.phase === 'betting' ? score - reserved : score;

  const isForfeited = state.forfeitedIds.includes(playerId);
  const canGuess = state.phase === 'answering' && !isForfeited;
  const canBet = state.phase === 'betting' && !isForfeited;

  const me: WitsWagersMeView = {
    playerId,
    submittedGuess: guess ? { ...guess } : null,
    guessRevision,
    acceptedBets: [{ ...acceptedBets[0] }, { ...acceptedBets[1] }],
    betRevision,
    reserved,
    available,
    canGuess,
    canBet,
  };

  return {
    ...publicView,
    me,
  };
}

/**
 * 构建观战视角。观战视角必须无 me 属性（契约与测试明确要求无 me 键）。
 */
export function buildSpectatorView(state: WitsWagersState): WitsWagersSpectatorView {
  return buildPublicView(state);
}

/**
 * 服务端视角解析器（简单形态断言与校验）。
 */
export function parsePlayerView(input: unknown): WitsWagersPlayerView {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new Error('PlayerView 必须是非空对象');
  }
  const view = input as WitsWagersPlayerView;
  if (view.gameId !== 'wits-wagers' || view.rulesetId !== 'wits_wagers_platform_v1' || view.viewVersion !== 1) {
    throw new Error('PlayerView 元数据不匹配');
  }
  return view;
}

export function parseSpectatorView(input: unknown): WitsWagersSpectatorView {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new Error('SpectatorView 必须是非空对象');
  }
  const view = input as WitsWagersSpectatorView;
  if (view.gameId !== 'wits-wagers' || view.rulesetId !== 'wits_wagers_platform_v1' || view.viewVersion !== 1) {
    throw new Error('SpectatorView 元数据不匹配');
  }
  if ('me' in (input as Record<string, unknown>)) {
    throw new Error('SpectatorView 不得包含 me 字段');
  }
  return view;
}
