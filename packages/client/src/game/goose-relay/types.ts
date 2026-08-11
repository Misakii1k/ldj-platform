/** goose_relay_classic_v1 客户端严格视角类型与解析器（与服务端视图形状一一对应）。 */

export const CHARACTERS = ['grey_goose', 'white_goose', 'brown_goose', 'black_goose', 'duck_goose', 'swan_goose'] as const;
export type CharacterId = (typeof CHARACTERS)[number];
export type GooseRelayPhase = 'case_view' | 'relay' | 'discussion' | 'accusation' | 'vote' | 'game_over';
export type GooseRole = 'head' | 'evil' | 'white';

export interface CaseCard {
  murderer: CharacterId;
  victim: CharacterId;
  tool: string;
  scene: string;
}

export interface GooseRelayReveal {
  case: CaseCard;
  transmissions: CaseCard[];
  evilGeese: string[];
  accusations: Array<{ playerId: string; guess: CaseCard; correct: boolean }>;
  voteCounts: Record<string, number>;
  caseMatched: boolean;
  evilIdentified: boolean;
}

export interface GooseRelayPublicView {
  gameId: 'goose-relay';
  rulesetId: 'goose_relay_classic_v1';
  schemaVersion: 1;
  phase: GooseRelayPhase;
  players: string[];
  lineOrder: string[];
  currentIndex: number;
  currentAccuserIndex: number;
  evilCount: number;
  transmissions: CaseCard[] | null;
  accusations: Array<{ playerId: string; correct: boolean }> | null;
  caseMatched: boolean | null;
  votesCast: number;
  winners: string[];
  reveal: GooseRelayReveal | null;
}

export interface GooseRelayPlayerView extends GooseRelayPublicView {
  me: {
    playerId: string;
    role: GooseRole | null;
    observed: CaseCard | null;
  } | null;
}

const PUBLIC_KEYS = [
  'gameId', 'rulesetId', 'schemaVersion', 'phase', 'players', 'lineOrder',
  'currentIndex', 'currentAccuserIndex', 'evilCount', 'transmissions',
  'accusations', 'caseMatched', 'votesCast', 'winners', 'reveal',
] as const;
const ME_KEYS = ['playerId', 'role', 'observed'] as const;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(record: Record<string, unknown>, allowed: readonly string[]): boolean {
  const keys = Object.keys(record);
  if (keys.length !== allowed.length) return false;
  const allowedSet = new Set<string>(allowed);
  return keys.every((key) => allowedSet.has(key));
}

function isPlayerId(value: unknown): value is string {
  return typeof value === 'string' && value.length >= 1 && value.length <= 64;
}

function isBool(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function isPlayerIds(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isPlayerId);
}

function isCharacter(value: unknown): value is CharacterId {
  return typeof value === 'string' && (CHARACTERS as readonly string[]).includes(value);
}

function parseCaseCard(value: unknown): CaseCard | null {
  if (!isObject(value) || Object.keys(value).length !== 4) return null;
  if (!isCharacter(value.murderer) || !isCharacter(value.victim)) return null;
  if (value.murderer === value.victim) return null;
  if (typeof value.tool !== 'string' || value.tool.length < 1 || typeof value.scene !== 'string' || value.scene.length < 1) return null;
  return { murderer: value.murderer, victim: value.victim, tool: value.tool, scene: value.scene };
}

function parseCases(value: unknown): CaseCard[] | null {
  if (!Array.isArray(value)) return null;
  const cases: CaseCard[] = [];
  for (const item of value) {
    const card = parseCaseCard(item);
    if (card === null) return null;
    cases.push(card);
  }
  return cases;
}

function parseReveal(value: unknown): GooseRelayReveal | null {
  if (value === null) return null;
  if (!isObject(value) || !hasExactKeys(value, ['case', 'transmissions', 'evilGeese', 'accusations', 'voteCounts', 'caseMatched', 'evilIdentified'])) return null;
  const base = parseCaseCard(value.case);
  if (base === null) return null;
  const transmissions = parseCases(value.transmissions);
  if (transmissions === null || !isPlayerIds(value.evilGeese)) return null;
  if (!isBool(value.caseMatched) || !isBool(value.evilIdentified)) return null;
  if (!Array.isArray(value.accusations)) return null;
  const accusations: GooseRelayReveal['accusations'] = [];
  for (const item of value.accusations) {
    if (!isObject(item) || !hasExactKeys(item, ['playerId', 'guess', 'correct'])) return null;
    const guess = parseCaseCard(item.guess);
    if (guess === null || !isPlayerId(item.playerId) || !isBool(item.correct)) return null;
    accusations.push({ playerId: item.playerId, guess, correct: item.correct });
  }
  if (!isObject(value.voteCounts)) return null;
  const voteCounts: Record<string, number> = {};
  for (const key of Object.keys(value.voteCounts)) {
    if (!isNonNegativeInteger(value.voteCounts[key])) return null;
    voteCounts[key] = value.voteCounts[key] as number;
  }
  return {
    case: base,
    transmissions,
    evilGeese: [...value.evilGeese],
    accusations,
    voteCounts,
    caseMatched: value.caseMatched,
    evilIdentified: value.evilIdentified,
  };
}

function parseBase(view: Record<string, unknown>, withMe: boolean): GooseRelayPublicView | null {
  if (!hasExactKeys(view, withMe ? [...PUBLIC_KEYS, 'me'] : PUBLIC_KEYS)) return null;
  if (view.gameId !== 'goose-relay' || view.rulesetId !== 'goose_relay_classic_v1' || view.schemaVersion !== 1) return null;
  const phases: GooseRelayPhase[] = ['case_view', 'relay', 'discussion', 'accusation', 'vote', 'game_over'];
  if (typeof view.phase !== 'string' || !phases.includes(view.phase as GooseRelayPhase)) return null;
  if (!isPlayerIds(view.players) || !isPlayerIds(view.lineOrder)) return null;
  if (!isNonNegativeInteger(view.currentIndex) || !isNonNegativeInteger(view.currentAccuserIndex) || !isNonNegativeInteger(view.evilCount)) return null;
  if (view.transmissions !== null && parseCases(view.transmissions) === null) return null;
  if (view.accusations !== null) {
    if (!Array.isArray(view.accusations)) return null;
    for (const item of view.accusations) {
      if (!isObject(item) || !hasExactKeys(item, ['playerId', 'correct']) || !isPlayerId(item.playerId) || !isBool(item.correct)) return null;
    }
  }
  if (view.caseMatched !== null && !isBool(view.caseMatched)) return null;
  if (!isNonNegativeInteger(view.votesCast) || !isPlayerIds(view.winners)) return null;
  const reveal = parseReveal(view.reveal);
  if (reveal === null && view.reveal !== null) return null;
  return {
    gameId: 'goose-relay',
    rulesetId: 'goose_relay_classic_v1',
    schemaVersion: 1,
    phase: view.phase as GooseRelayPhase,
    players: [...view.players],
    lineOrder: [...view.lineOrder],
    currentIndex: view.currentIndex as number,
    currentAccuserIndex: view.currentAccuserIndex as number,
    evilCount: view.evilCount as number,
    transmissions: view.transmissions === null ? null : parseCases(view.transmissions),
    accusations:
      view.accusations === null
        ? null
        : (view.accusations as Array<Record<string, unknown>>).map((item) => ({
            playerId: item.playerId as string,
            correct: item.correct as boolean,
          })),
    caseMatched: view.caseMatched as boolean | null,
    votesCast: view.votesCast as number,
    winners: [...view.winners],
    reveal,
  };
}

function parseMe(value: unknown): GooseRelayPlayerView['me'] {
  if (value === null) return null;
  if (!isObject(value) || !hasExactKeys(value, ME_KEYS) || !isPlayerId(value.playerId)) return null;
  const roles: GooseRole[] = ['head', 'evil', 'white'];
  if (typeof value.role !== 'string' || (value.role !== null && !roles.includes(value.role as GooseRole))) return null;
  const observed = parseCaseCard(value.observed);
  if (observed === null && value.observed !== null) return null;
  return {
    playerId: value.playerId,
    role: value.role as GooseRole | null,
    observed,
  };
}

export function parseGooseRelayView(
  view: unknown,
  role: 'player' | 'spectator',
): GooseRelayPlayerView | GooseRelayPublicView | null {
  if (!isObject(view)) return null;
  if (role === 'spectator') {
    if ('me' in view) return null;
    return parseBase(view, false);
  }
  if (!('me' in view)) return null;
  const base = parseBase(view, true);
  if (base === null) return null;
  const me = parseMe(view.me);
  if (view.me !== null && me === null) return null;
  return { ...base, me };
}
