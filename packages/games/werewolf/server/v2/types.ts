/** werewolf_platform_open_kill_v1 — 纯类型声明（LOC 测量排除）。 */

export type V2Role = 'wolf' | 'villager' | 'seer' | 'witch' | 'guard' | 'hunter' | 'idiot';
export type V2Team = 'wolves' | 'village';
export type V2Preset = 'classic' | 'advanced';
export type V2Pace = 'fast' | 'standard' | 'relaxed';
export type V2ConfigPace = V2Pace;
export type V2WitchSelfSave = 'first_night' | 'never' | 'always';
export type V2WinCondition = 'numbers' | 'roles';

export type V2Phase =
  | 'role_reveal'
  | 'night'
  | 'hunter_shot'
  | 'day_announcement'
  | 'discussion'
  | 'voting'
  | 'runoff_voting'
  | 'vote_result'
  | 'last_words'
  | 'game_over';
export type V2TimedPhase = Exclude<V2Phase, 'game_over'>;
export type V2ExitReason = 'night_kill' | 'poisoned' | 'voted_out' | 'hunter_shot' | 'disconnect_timeout';

export interface V2RolePool {
  guard: boolean;
  hunter: boolean;
  idiot: boolean;
}

export interface V2Config {
  rulesetId: 'werewolf_platform_open_kill_v1';
  preset: V2Preset;
  pace: V2Pace;
  witchSelfSave: V2WitchSelfSave;
  winCondition: V2WinCondition;
  wolfKillScope: 'any';
  roles: V2RolePool;
}

export interface V2PlayerState {
  role: V2Role;
  alive: boolean;
  seat: number;
  forfeited: boolean;
  exitReason: V2ExitReason | null;
  idiotRevealed: boolean;
}

export interface V2SeerResult {
  night: number;
  playerId: string;
  team: V2Team;
}

export interface V2NightState {
  wolfVotes: Record<string, string>;
  killTargetId: string | null;
  seerChecked: boolean;
  seerResult: V2SeerResult | null;
  witchSaveDecision: boolean | null;
  witchPoisonDecided: boolean;
  witchPoisonTargetId: string | null;
  guardDecided: boolean;
  guardTargetId: string | null;
}

export type V2VoteKind = 'normal' | 'runoff';
export type V2VoteOutcome = 'eliminated' | 'idiot_saved' | 'tie' | 'no_votes' | 'runoff_tie';

export interface V2VoteSummary {
  day: number;
  kind: V2VoteKind;
  outcome: V2VoteOutcome;
  tally: Record<string, number>;
  abstained: number;
  eliminatedPlayerId: string | null;
}

export interface V2VoteRecord extends V2VoteSummary {
  votes: Record<string, string | null>;
}

export interface V2PendingOutcome {
  next: 'runoff' | 'last_words' | 'next_night';
  candidates: string[];
  winner: V2Team | null;
}

export interface V2State {
  schemaVersion: 1;
  phase: V2Phase;
  day: number;
  players: Record<string, V2PlayerState>;
  config: V2Config;
  confirmedRolePlayerIds: string[];
  announcementConfirmedPlayerIds: string[];
  night: V2NightState;
  seerHistory: V2SeerResult[];
  lastNightDeaths: string[];
  speakingOrder: string[];
  currentSpeakerIndex: number;
  votes: Record<string, string | null>;
  runoffCandidates: string[];
  lastVoteSummary: V2VoteSummary | null;
  voteHistory: V2VoteRecord[];
  pendingOutcome: V2PendingOutcome | null;
  lastWordsPlayerId: string | null;
  witchSaveUsed: boolean;
  witchPoisonUsed: boolean;
  lastGuardTargetId: string | null;
  pendingShoot: string | null;
  deadlineAt: number | null;
  phaseToken: string | null;
  winner: V2Team | null;
  aborted: boolean;
}

export type V2Action =
  | { type: 'begin' }
  | { type: 'confirm_role' }
  | { type: 'night_kill'; targetPlayerId: string }
  | { type: 'seer_check'; targetPlayerId: string }
  | { type: 'witch_save'; save: boolean }
  | { type: 'witch_poison'; targetPlayerId: string | null }
  | { type: 'guard_guard'; targetPlayerId: string | null }
  | { type: 'hunter_shoot'; targetPlayerId: string | null }
  | { type: 'confirm_announcement' }
  | { type: 'finish_speech' }
  | { type: 'day_vote'; targetPlayerId: string | null }
  | { type: 'finish_last_words' }
  | { type: 'phase_timeout'; phase: V2TimedPhase; day: number; token: string }
  | { type: 'player_forfeited'; playerIds: string[] };

export interface V2PublicPlayer {
  playerId: string;
  alive: boolean;
  seat: number;
  forfeited: boolean;
  exitReason: V2ExitReason | null;
  revealedRole: V2Role | null;
  idiotRevealed: boolean;
}

export interface V2Reveal {
  roles: Record<string, V2Role>;
  voteHistory: V2VoteRecord[];
}

export interface V2PublicView {
  gameId: 'werewolf';
  rulesetId: 'werewolf_platform_open_kill_v1';
  schemaVersion: 1;
  phase: V2Phase;
  day: number;
  players: V2PublicPlayer[];
  config: V2Config;
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
  lastVoteSummary: V2VoteSummary | null;
  pendingShooterId: string | null;
  winner: V2Team | null;
  aborted: boolean;
  reveal: V2Reveal | null;
}

export interface V2MeView {
  playerId: string;
  role: V2Role;
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
  seerResults: V2SeerResult[];
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

export interface V2PlayerView extends V2PublicView {
  me: V2MeView | null;
}

export interface V2Result {
  winner: V2Team | null;
  days: number;
  roles: Record<string, V2Role>;
  aborted: boolean;
}

export type V2Event =
  | { type: 'phase_changed'; phase: V2Phase; day: number }
  | { type: 'night_resolved'; deaths: string[]; day: number }
  | { type: 'player_eliminated'; playerId: string; reason: V2ExitReason }
  | { type: 'vote_resolved'; summary: V2VoteSummary }
  | { type: 'game_finished'; winner: V2Team | null; days: number; aborted: boolean };
