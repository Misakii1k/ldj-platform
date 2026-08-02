export type ScoringEndCondition =
  | { readonly type: 'target'; readonly targetScore: number }
  | { readonly type: 'rounds'; readonly rounds: number };

export interface ScoreLedgerConfig {
  readonly playerIds: readonly string[];
  readonly teamIds: readonly string[];
  readonly endCondition: ScoringEndCondition;
}

export interface ScoreLedger extends ScoreLedgerConfig {
  readonly playerScores: Readonly<Record<string, number>>;
  readonly teamScores: Readonly<Record<string, number>>;
  readonly completedRounds: number;
}

export interface ScoreChanges {
  readonly players?: Readonly<Record<string, number>>;
  readonly teams?: Readonly<Record<string, number>>;
}

export type ScoreChangeResult =
  | { readonly ok: true; readonly state: ScoreLedger }
  | { readonly ok: false; readonly code: 'UNKNOWN_SCORING_ENTITY' | 'INVALID_SCORE' };

export interface ScoringResult {
  readonly finished: boolean;
  readonly winnerIds: readonly string[];
  readonly tied: boolean;
  readonly highScore: number | null;
}

type ScoreMapChangeResult =
  | { readonly ok: true; readonly scores: Readonly<Record<string, number>> }
  | { readonly ok: false; readonly code: 'UNKNOWN_SCORING_ENTITY' | 'INVALID_SCORE' };

function unique(ids: readonly string[]): string[] {
  return [...new Set(ids)];
}

function zeroScores(ids: readonly string[]): Record<string, number> {
  return Object.fromEntries(ids.map((id) => [id, 0]));
}

function isFinished(state: ScoreLedger): boolean {
  if (state.endCondition.type === 'rounds') {
    return state.completedRounds >= state.endCondition.rounds;
  }
  const targetScore = state.endCondition.targetScore;
  return [...Object.values(state.playerScores), ...Object.values(state.teamScores)]
    .some((score) => score >= targetScore);
}

function applyChanges(
  scores: Readonly<Record<string, number>>,
  changes: Readonly<Record<string, number>> | undefined,
): ScoreMapChangeResult {
  const updated = { ...scores };
  for (const [id, change] of Object.entries(changes ?? {})) {
    if (updated[id] === undefined) return { ok: false, code: 'UNKNOWN_SCORING_ENTITY' };
    if (!Number.isFinite(change)) return { ok: false, code: 'INVALID_SCORE' };
    const score = updated[id] + change;
    if (!Number.isFinite(score)) return { ok: false, code: 'INVALID_SCORE' };
    updated[id] = score;
  }
  return { ok: true, scores: updated };
}

export function createScoreLedger(config: ScoreLedgerConfig): ScoreLedger {
  if (config.endCondition.type === 'rounds'
    && (!Number.isInteger(config.endCondition.rounds) || config.endCondition.rounds <= 0)) {
    throw new Error('终局轮数必须为正整数');
  }
  if (config.endCondition.type === 'target'
    && (!Number.isFinite(config.endCondition.targetScore) || config.endCondition.targetScore <= 0)) {
    throw new Error('目标分必须为正有限值');
  }
  const playerIds = unique(config.playerIds);
  const teamIds = unique(config.teamIds);
  return {
    ...config,
    playerIds,
    teamIds,
    playerScores: zeroScores(playerIds),
    teamScores: zeroScores(teamIds),
    completedRounds: 0,
  };
}

export function addScores(state: ScoreLedger, changes: ScoreChanges): ScoreChangeResult {
  const playerScores = applyChanges(state.playerScores, changes.players);
  if (!playerScores.ok) return playerScores;
  const teamScores = applyChanges(state.teamScores, changes.teams);
  if (!teamScores.ok) return teamScores;
  return {
    ok: true,
    state: { ...state, playerScores: playerScores.scores, teamScores: teamScores.scores },
  };
}

export function advanceScoringRound(state: ScoreLedger): ScoreLedger {
  if (isFinished(state)) return state;
  return { ...state, completedRounds: state.completedRounds + 1 };
}

export function getScoringResult(
  state: ScoreLedger,
  scope: 'players' | 'teams',
): ScoringResult {
  const finished = isFinished(state);
  if (!finished) return { finished: false, winnerIds: [], tied: false, highScore: null };
  const ids = scope === 'players' ? state.playerIds : state.teamIds;
  const scores = scope === 'players' ? state.playerScores : state.teamScores;
  if (ids.length === 0) return { finished: true, winnerIds: [], tied: false, highScore: null };
  const highScore = Math.max(...ids.map((id) => scores[id]!));
  const winnerIds = ids.filter((id) => scores[id] === highScore);
  return { finished: true, winnerIds, tied: winnerIds.length > 1, highScore };
}
