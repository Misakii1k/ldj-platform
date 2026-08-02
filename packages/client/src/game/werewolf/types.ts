export const WEREWOLF_PHASES = [
  'role_reveal',
  'night',
  'hunter_shot',
  'day_announcement',
  'discussion',
  'voting',
  'runoff_voting',
  'vote_result',
  'last_words',
  'game_over',
] as const;

export type WerewolfPhase = (typeof WEREWOLF_PHASES)[number];
export type WerewolfRole = 'wolf' | 'villager' | 'seer' | 'witch' | 'guard' | 'hunter' | 'idiot';
export type WerewolfTeam = 'wolves' | 'village';
export type WerewolfExitReason = 'night_kill' | 'poisoned' | 'voted_out' | 'hunter_shot' | 'disconnect_timeout';
export type WerewolfVoteKind = 'normal' | 'runoff';
export type WerewolfVoteOutcome = 'eliminated' | 'idiot_saved' | 'tie' | 'no_votes' | 'runoff_tie';

export interface WerewolfConfigView {
  preset: 'classic' | 'advanced';
  pace: 'fast' | 'standard' | 'relaxed';
  witchSelfSave: 'first_night' | 'never' | 'always';
  winCondition: 'numbers' | 'roles';
  roles: {
    guard: boolean;
    hunter: boolean;
    idiot: boolean;
  };
}

export interface WerewolfPlayer {
  playerId: string;
  alive: boolean;
  seat: number;
  forfeited: boolean;
  exitReason: WerewolfExitReason | null;
  revealedRole: WerewolfRole | null;
  idiotRevealed: boolean;
}

export interface WerewolfVoteSummary {
  day: number;
  kind: WerewolfVoteKind;
  outcome: WerewolfVoteOutcome;
  tally: Record<string, number>;
  abstained: number;
  eliminatedPlayerId: string | null;
}

export interface WerewolfVoteRecord extends WerewolfVoteSummary {
  votes: Record<string, string | null>;
}

export interface WerewolfSeerResult {
  night: number;
  playerId: string;
  team: WerewolfTeam;
}

export interface WerewolfMe {
  playerId: string;
  role: WerewolfRole;
  alive: boolean;
  forfeited: boolean;
  confirmedRole: boolean;
  confirmedAnnouncement: boolean;
  canAct: boolean;
  hasVoted: boolean;
  myVote: string | null;
  lastWordsPending: boolean;
  wolfTeammateIds: string[];
  wolfVotes: Record<string, string>;
  hasNightVoted: boolean;
  seerResults: WerewolfSeerResult[];
  seerCheckedThisNight: boolean;
  nightVictimId: string | null;
  witchSaveUsed: boolean;
  witchPoisonUsed: boolean;
  witchSaveDecision: boolean | null;
  witchPoisonDecided: boolean;
  witchCanSelfSave: boolean;
  guardTargetId: string | null;
  guardDecided: boolean;
  lastGuardTargetId: string | null;
  pendingShoot: boolean;
  idiotRevealed: boolean;
}

export interface WerewolfView {
  gameId: 'werewolf';
  schemaVersion: 3;
  phase: WerewolfPhase;
  day: number;
  players: WerewolfPlayer[];
  config: WerewolfConfigView;
  confirmedRolePlayerIds: string[];
  announcementConfirmedPlayerIds: string[];
  lastNightDeaths: string[];
  speakingOrder: string[];
  currentSpeakerId: string | null;
  lastWordsPlayerId: string | null;
  deadlineAt: number | null;
  votesSubmitted: number;
  votesExpected: number;
  runoffCandidates: string[];
  lastVoteSummary: WerewolfVoteSummary | null;
  pendingShooterId: string | null;
  winner: WerewolfTeam | null;
  aborted: boolean;
  reveal: {
    roles: Record<string, WerewolfRole>;
    voteHistory: WerewolfVoteRecord[];
  } | null;
  me: WerewolfMe | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPhase(value: unknown): value is WerewolfPhase {
  return typeof value === 'string' && WEREWOLF_PHASES.includes(value as WerewolfPhase);
}

function isRole(value: unknown): value is WerewolfRole {
  return value === 'wolf' || value === 'villager' || value === 'seer' || value === 'witch' || value === 'guard' || value === 'hunter' || value === 'idiot';
}

function isTeam(value: unknown): value is WerewolfTeam {
  return value === 'wolves' || value === 'village';
}

function asStringArray(value: unknown): string[] | null {
  return Array.isArray(value) && value.every((item) => typeof item === 'string') ? value : null;
}

function asStringRecord(value: unknown): Record<string, string> | null {
  if (!isRecord(value)) return null;
  const entries = Object.entries(value);
  if (!entries.every(([, item]) => typeof item === 'string')) return null;
  return Object.fromEntries(entries) as Record<string, string>;
}

function parsePlayer(value: unknown): WerewolfPlayer | null {
  if (!isRecord(value)) return null;
  const { playerId, alive, seat, forfeited, exitReason, revealedRole, idiotRevealed } = value;
  if (typeof playerId !== 'string' || typeof alive !== 'boolean' || typeof seat !== 'number' || typeof forfeited !== 'boolean') return null;
  if (exitReason !== null && exitReason !== 'night_kill' && exitReason !== 'poisoned' && exitReason !== 'voted_out' && exitReason !== 'hunter_shot' && exitReason !== 'disconnect_timeout') return null;
  if (revealedRole !== null && !isRole(revealedRole)) return null;
  if (typeof idiotRevealed !== 'boolean') return null;
  return { playerId, alive, seat, forfeited, exitReason, revealedRole, idiotRevealed };
}

function parseVoteSummary(value: unknown): WerewolfVoteSummary | null {
  if (!isRecord(value)) return null;
  const { day, kind, outcome, tally, abstained, eliminatedPlayerId } = value;
  if (typeof day !== 'number' || (kind !== 'normal' && kind !== 'runoff')) return null;
  if (outcome !== 'eliminated' && outcome !== 'idiot_saved' && outcome !== 'tie' && outcome !== 'no_votes' && outcome !== 'runoff_tie') return null;
  if (!isRecord(tally) || !Object.values(tally).every((item) => typeof item === 'number')) return null;
  if (typeof abstained !== 'number' || (eliminatedPlayerId !== null && typeof eliminatedPlayerId !== 'string')) return null;
  return { day, kind, outcome, tally: tally as Record<string, number>, abstained, eliminatedPlayerId };
}

function parseMe(value: unknown): WerewolfMe | null {
  if (value === null) return null;
  if (!isRecord(value)) return null;
  const {
    playerId, role, alive, forfeited, confirmedRole, confirmedAnnouncement, canAct, hasVoted, myVote,
    lastWordsPending, wolfTeammateIds, wolfVotes, hasNightVoted, seerResults, seerCheckedThisNight,
    nightVictimId, witchSaveUsed, witchPoisonUsed, witchSaveDecision, witchPoisonDecided, witchCanSelfSave,
    guardTargetId, guardDecided, lastGuardTargetId, pendingShoot, idiotRevealed,
  } = value;
  const teammates = asStringArray(wolfTeammateIds);
  const votes = asStringRecord(wolfVotes);
  if (typeof playerId !== 'string' || !isRole(role) || typeof alive !== 'boolean' || typeof forfeited !== 'boolean') return null;
  if (typeof confirmedRole !== 'boolean' || typeof confirmedAnnouncement !== 'boolean' || typeof canAct !== 'boolean') return null;
  if (typeof hasVoted !== 'boolean' || (myVote !== null && typeof myVote !== 'string') || typeof lastWordsPending !== 'boolean') return null;
  if (!teammates || !votes || typeof hasNightVoted !== 'boolean' || !Array.isArray(seerResults)) return null;
  if (!seerResults.every((item) => isRecord(item) && typeof item.night === 'number' && typeof item.playerId === 'string' && isTeam(item.team))) return null;
  if (typeof seerCheckedThisNight !== 'boolean' || (nightVictimId !== null && typeof nightVictimId !== 'string')) return null;
  if (typeof witchSaveUsed !== 'boolean' || typeof witchPoisonUsed !== 'boolean') return null;
  if (witchSaveDecision !== null && typeof witchSaveDecision !== 'boolean') return null;
  if (typeof witchPoisonDecided !== 'boolean' || typeof witchCanSelfSave !== 'boolean') return null;
  if (guardTargetId !== null && typeof guardTargetId !== 'string') return null;
  if (typeof guardDecided !== 'boolean' || (lastGuardTargetId !== null && typeof lastGuardTargetId !== 'string')) return null;
  if (typeof pendingShoot !== 'boolean' || typeof idiotRevealed !== 'boolean') return null;
  return {
    playerId, role, alive, forfeited, confirmedRole, confirmedAnnouncement, canAct, hasVoted, myVote,
    lastWordsPending, wolfTeammateIds: teammates, wolfVotes: votes, hasNightVoted,
    seerResults: seerResults as WerewolfSeerResult[], seerCheckedThisNight, nightVictimId,
    witchSaveUsed, witchPoisonUsed, witchSaveDecision, witchPoisonDecided, witchCanSelfSave,
    guardTargetId, guardDecided, lastGuardTargetId, pendingShoot, idiotRevealed,
  };
}

export function parseWerewolfView(value: unknown): WerewolfView | null {
  if (!isRecord(value)) return null;
  const {
    gameId, schemaVersion, phase, day, players, config, confirmedRolePlayerIds, announcementConfirmedPlayerIds,
    lastNightDeaths, speakingOrder, currentSpeakerId, lastWordsPlayerId, deadlineAt, votesSubmitted,
    votesExpected, runoffCandidates, lastVoteSummary, pendingShooterId, winner, aborted, reveal, me,
  } = value;
  const parsedPlayers = Array.isArray(players) ? players.map(parsePlayer) : [];
  const confirmedRoles = asStringArray(confirmedRolePlayerIds);
  const confirmedAnnouncements = asStringArray(announcementConfirmedPlayerIds);
  const deaths = asStringArray(lastNightDeaths);
  const speakers = asStringArray(speakingOrder);
  const runoff = asStringArray(runoffCandidates);
  if (gameId !== 'werewolf' || schemaVersion !== 3 || !isPhase(phase) || typeof day !== 'number') return null;
  if (!Array.isArray(players) || parsedPlayers.some((player) => player === null)) return null;
  if (!isRecord(config) || (config.preset !== 'classic' && config.preset !== 'advanced')) return null;
  if (config.pace !== 'fast' && config.pace !== 'standard' && config.pace !== 'relaxed') return null;
  if (config.witchSelfSave !== 'first_night' && config.witchSelfSave !== 'never' && config.witchSelfSave !== 'always') return null;
  if (config.winCondition !== 'numbers' && config.winCondition !== 'roles') return null;
  if (!isRecord(config.roles) || typeof config.roles.guard !== 'boolean' || typeof config.roles.hunter !== 'boolean' || typeof config.roles.idiot !== 'boolean') return null;
  if (!confirmedRoles || !confirmedAnnouncements || !deaths || !speakers || !runoff) return null;
  if (currentSpeakerId !== null && typeof currentSpeakerId !== 'string') return null;
  if (lastWordsPlayerId !== null && typeof lastWordsPlayerId !== 'string') return null;
  if (deadlineAt !== null && typeof deadlineAt !== 'number') return null;
  if (typeof votesSubmitted !== 'number' || typeof votesExpected !== 'number') return null;
  if (winner !== null && !isTeam(winner)) return null;
  if (typeof aborted !== 'boolean') return null;
  if (typeof pendingShooterId !== 'string' && pendingShooterId !== null) return null;
  const summary = lastVoteSummary === null ? null : parseVoteSummary(lastVoteSummary);
  if (lastVoteSummary !== null && summary === null) return null;
  const parsedMe = parseMe(me);
  if (me !== null && parsedMe === null) return null;

  let parsedReveal: WerewolfView['reveal'] = null;
  if (reveal !== null) {
    if (!isRecord(reveal) || !isRecord(reveal.roles) || !Array.isArray(reveal.voteHistory)) return null;
    if (!Object.values(reveal.roles).every(isRole)) return null;
    const records = reveal.voteHistory.map((item) => {
      const summaryItem = parseVoteSummary(item);
      if (!summaryItem || !isRecord(item.votes)) return null;
      if (!Object.values(item.votes).every((vote) => vote === null || typeof vote === 'string')) return null;
      return { ...summaryItem, votes: item.votes as Record<string, string | null> };
    });
    if (records.some((item) => item === null)) return null;
    parsedReveal = { roles: reveal.roles as Record<string, WerewolfRole>, voteHistory: records as WerewolfVoteRecord[] };
  }

  return {
    gameId, schemaVersion, phase, day, players: parsedPlayers as WerewolfPlayer[],
    config: {
      preset: config.preset,
      pace: config.pace,
      witchSelfSave: config.witchSelfSave,
      winCondition: config.winCondition,
      roles: {
        guard: config.roles.guard,
        hunter: config.roles.hunter,
        idiot: config.roles.idiot,
      },
    }, confirmedRolePlayerIds: confirmedRoles,
    announcementConfirmedPlayerIds: confirmedAnnouncements, lastNightDeaths: deaths, speakingOrder: speakers,
    currentSpeakerId, lastWordsPlayerId, deadlineAt, votesSubmitted, votesExpected, runoffCandidates: runoff,
    lastVoteSummary: summary, pendingShooterId, winner, aborted, reveal: parsedReveal, me: parsedMe,
  };
}
