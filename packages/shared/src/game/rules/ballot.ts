export type BallotVisibility = 'public' | 'secret';
export type BallotVictory = 'plurality' | 'unanimous';
export type BallotTiePolicy = 'revote' | 'no_winner';

export interface BallotConfig {
  readonly voterIds: readonly string[];
  readonly candidateIds: readonly string[];
  readonly visibility: BallotVisibility;
  readonly allowSelfVote: boolean;
  readonly victory: BallotVictory;
  readonly tiePolicy: BallotTiePolicy;
}

export interface BallotState extends BallotConfig {
  readonly submissions: Readonly<Record<string, string>>;
  readonly locked: boolean;
  readonly revealed: boolean;
}

export interface BallotView {
  readonly visibility: BallotVisibility;
  readonly locked: boolean;
  readonly revealed: boolean;
  readonly voterIds: readonly string[];
  readonly candidateIds: readonly string[];
  readonly submittedVoterIds: readonly string[];
  readonly submissions: Readonly<Record<string, string>> | null;
}

export type BallotErrorCode =
  | 'BALLOT_LOCKED'
  | 'BALLOT_NOT_COMPLETE'
  | 'UNKNOWN_VOTER'
  | 'UNKNOWN_CANDIDATE'
  | 'SELF_VOTE_NOT_ALLOWED'
  | 'VOTE_ALREADY_SUBMITTED';

export type BallotChangeResult =
  | { readonly ok: true; readonly state: BallotState }
  | { readonly ok: false; readonly code: BallotErrorCode };

export type BallotResolutionStatus = 'winner' | 'revote' | 'no_winner';

export interface BallotResolution {
  readonly status: BallotResolutionStatus;
  readonly winnerIds: readonly string[];
  readonly tally: Readonly<Record<string, number>>;
  readonly submitted: number;
  readonly abstained: number;
}

export type BallotResolutionResult = BallotResolution | {
  readonly ok: false;
  readonly code: 'BALLOT_NOT_COMPLETE' | 'BALLOT_NOT_REVEALED';
  readonly status?: never;
};

function unique(ids: readonly string[]): string[] {
  return [...new Set(ids)];
}

function orderedSubmissions(state: BallotState): Record<string, string> {
  return Object.fromEntries(
    state.voterIds
      .filter((voterId) => state.submissions[voterId] !== undefined)
      .map((voterId) => [voterId, state.submissions[voterId]!]),
  );
}

export function createBallot(config: BallotConfig): BallotState {
  return {
    ...config,
    voterIds: unique(config.voterIds),
    candidateIds: unique(config.candidateIds),
    submissions: {},
    locked: config.voterIds.length === 0,
    revealed: config.visibility === 'public',
  };
}

export function submitBallot(
  state: BallotState,
  voterId: string,
  candidateId: string,
): BallotChangeResult {
  if (state.locked) return { ok: false, code: 'BALLOT_LOCKED' };
  if (!state.voterIds.includes(voterId)) return { ok: false, code: 'UNKNOWN_VOTER' };
  if (!state.candidateIds.includes(candidateId)) return { ok: false, code: 'UNKNOWN_CANDIDATE' };
  if (!state.allowSelfVote && voterId === candidateId) {
    return { ok: false, code: 'SELF_VOTE_NOT_ALLOWED' };
  }
  if (state.submissions[voterId] !== undefined) {
    return { ok: false, code: 'VOTE_ALREADY_SUBMITTED' };
  }
  const submissions = { ...state.submissions, [voterId]: candidateId };
  return {
    ok: true,
    state: {
      ...state,
      submissions,
      locked: Object.keys(submissions).length === state.voterIds.length,
    },
  };
}

export function revealBallot(state: BallotState): BallotChangeResult {
  if (!state.locked) return { ok: false, code: 'BALLOT_NOT_COMPLETE' };
  if (state.revealed) return { ok: true, state };
  return { ok: true, state: { ...state, revealed: true } };
}

export function getBallotView(state: BallotState): BallotView {
  const submissions = orderedSubmissions(state);
  return {
    visibility: state.visibility,
    locked: state.locked,
    revealed: state.revealed,
    voterIds: [...state.voterIds],
    candidateIds: [...state.candidateIds],
    submittedVoterIds: Object.keys(submissions),
    submissions: state.visibility === 'public' || state.revealed ? submissions : null,
  };
}

export function resolveBallot(state: BallotState): BallotResolutionResult {
  if (state.visibility === 'secret' && !state.locked) {
    return { ok: false, code: 'BALLOT_NOT_COMPLETE' };
  }
  if (state.visibility === 'secret' && !state.revealed) {
    return { ok: false, code: 'BALLOT_NOT_REVEALED' };
  }
  const tally = Object.fromEntries(state.candidateIds.map((candidateId) => [candidateId, 0]));
  for (const candidateId of Object.values(state.submissions)) {
    tally[candidateId] = (tally[candidateId] ?? 0) + 1;
  }
  const submitted = Object.keys(state.submissions).length;
  const base = { tally, submitted, abstained: state.voterIds.length - submitted };
  if (submitted === 0) return { ...base, status: 'no_winner', winnerIds: [] };
  if (state.victory === 'unanimous') {
    const winnerId = state.candidateIds.find((candidateId) => tally[candidateId] === state.voterIds.length);
    return winnerId
      ? { ...base, status: 'winner', winnerIds: [winnerId] }
      : { ...base, status: 'no_winner', winnerIds: [] };
  }
  const highScore = Math.max(...Object.values(tally));
  const leaders = state.candidateIds.filter((candidateId) => tally[candidateId] === highScore);
  if (leaders.length === 1) return { ...base, status: 'winner', winnerIds: leaders };
  return {
    ...base,
    status: state.tiePolicy === 'revote' ? 'revote' : 'no_winner',
    winnerIds: leaders,
  };
}
