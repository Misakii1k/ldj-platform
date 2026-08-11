/** cheese_thief_classic_v1 客户端严格视角类型与解析器（与服务端视图形状一一对应）。 */

export type CheeseThiefPhase = 'hour_choice' | 'night' | 'accomplice_select' | 'dawn' | 'vote' | 'game_over';
export type RoleCard = 'cat' | 'dog' | 'whiteMouse' | 'none';

export interface CheeseThiefReveal {
  thiefId: string | null;
  stealHour: number | null;
  wakeHours: Record<string, number>;
  accomplices: string[];
  peeks: Array<{ viewer: string; target: string }>;
}

export interface CheeseThiefPublicView {
  gameId: 'cheese-thief';
  rulesetId: 'cheese_thief_classic_v1';
  schemaVersion: 1;
  phase: CheeseThiefPhase;
  players: string[];
  currentHour: number;
  roleCardsEnabled: boolean;
  revealedCat: string | null;
  revealedDog: string | null;
  dogFirstVoter: string | null;
  thiefCaught: boolean | null;
  winners: string[];
  reveal: CheeseThiefReveal | null;
}

export interface CheeseThiefPlayerView extends CheeseThiefPublicView {
  me: {
    playerId: string;
    wakeHour: number;
    hourChoices: [number, number] | null;
    coWakers: string[];
    cheeseWasMissing: boolean;
    isThief: boolean;
    isAccomplice: boolean;
    knownAccomplices: string[];
    roleCard: RoleCard;
    canPeek: boolean;
    peekedHour: { target: string; hour: number } | null;
    catPeekedHour: { target: string; hour: number } | null;
  } | null;
}

const PUBLIC_KEYS = [
  'gameId', 'rulesetId', 'schemaVersion', 'phase', 'players', 'currentHour',
  'roleCardsEnabled', 'revealedCat', 'revealedDog', 'dogFirstVoter',
  'thiefCaught', 'winners', 'reveal',
] as const;
const ME_KEYS = [
  'playerId', 'wakeHour', 'hourChoices', 'coWakers', 'cheeseWasMissing',
  'isThief', 'isAccomplice', 'knownAccomplices', 'roleCard', 'canPeek',
  'peekedHour', 'catPeekedHour',
] as const;

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

function isHour(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 6;
}

function isBool(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

function isPlayerIds(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isPlayerId);
}

function isRoleCard(value: unknown): value is RoleCard {
  return value === 'cat' || value === 'dog' || value === 'whiteMouse' || value === 'none';
}

function parsePeeks(value: unknown): CheeseThiefReveal['peeks'] | null {
  if (!Array.isArray(value)) return null;
  const peeks: CheeseThiefReveal['peeks'] = [];
  for (const item of value) {
    if (!isObject(item) || Object.keys(item).length !== 2) return null;
    if (!isPlayerId(item.viewer) || !isPlayerId(item.target)) return null;
    peeks.push({ viewer: item.viewer, target: item.target });
  }
  return peeks;
}

function parseReveal(value: unknown): CheeseThiefReveal | null {
  if (value === null) return null;
  if (!isObject(value) || !hasExactKeys(value, ['thiefId', 'stealHour', 'wakeHours', 'accomplices', 'peeks'])) return null;
  if (value.thiefId !== null && !isPlayerId(value.thiefId)) return null;
  if (value.stealHour !== null && !isHour(value.stealHour)) return null;
  if (!isObject(value.wakeHours)) return null;
  const wakeHours: Record<string, number> = {};
  for (const key of Object.keys(value.wakeHours)) {
    const h = value.wakeHours[key];
    if (!isHour(h) || h < 1) return null;
    wakeHours[key] = h;
  }
  if (!isPlayerIds(value.accomplices)) return null;
  const peeks = parsePeeks(value.peeks);
  if (peeks === null) return null;
  return {
    thiefId: value.thiefId as string | null,
    stealHour: value.stealHour as number | null,
    wakeHours,
    accomplices: [...value.accomplices],
    peeks,
  };
}

function parseBase(view: Record<string, unknown>, withMe: boolean): CheeseThiefPublicView | null {
  if (!hasExactKeys(view, withMe ? [...PUBLIC_KEYS, 'me'] : PUBLIC_KEYS)) return null;
  if (view.gameId !== 'cheese-thief' || view.rulesetId !== 'cheese_thief_classic_v1' || view.schemaVersion !== 1) return null;
  const phases: CheeseThiefPhase[] = ['hour_choice', 'night', 'accomplice_select', 'dawn', 'vote', 'game_over'];
  if (typeof view.phase !== 'string' || !phases.includes(view.phase as CheeseThiefPhase)) return null;
  if (!isPlayerIds(view.players) || !isHour(view.currentHour)) return null;
  if (!isBool(view.roleCardsEnabled)) return null;
  if (view.revealedCat !== null && !isPlayerId(view.revealedCat)) return null;
  if (view.revealedDog !== null && !isPlayerId(view.revealedDog)) return null;
  if (view.dogFirstVoter !== null && !isPlayerId(view.dogFirstVoter)) return null;
  if (view.thiefCaught !== null && !isBool(view.thiefCaught)) return null;
  if (!isPlayerIds(view.winners)) return null;
  const reveal = parseReveal(view.reveal);
  if (reveal === null && view.reveal !== null) return null;
  return {
    gameId: 'cheese-thief',
    rulesetId: 'cheese_thief_classic_v1',
    schemaVersion: 1,
    phase: view.phase as CheeseThiefPhase,
    players: [...view.players],
    currentHour: view.currentHour as number,
    roleCardsEnabled: view.roleCardsEnabled as boolean,
    revealedCat: view.revealedCat as string | null,
    revealedDog: view.revealedDog as string | null,
    dogFirstVoter: view.dogFirstVoter as string | null,
    thiefCaught: view.thiefCaught as boolean | null,
    winners: [...view.winners],
    reveal,
  };
}

function parseHourChoices(value: unknown): [number, number] | null {
  if (value === null) return null;
  if (!Array.isArray(value) || value.length !== 2) return null;
  if (!isHour(value[0]) || !isHour(value[1]) || (value[0] as number) < 1 || (value[1] as number) < 1) return null;
  return [value[0] as number, value[1] as number];
}

function parsePeekedHour(value: unknown): { target: string; hour: number } | null {
  if (value === null) return null;
  if (!isObject(value) || Object.keys(value).length !== 2) return null;
  if (!isPlayerId(value.target) || !isHour(value.hour) || (value.hour as number) < 1) return null;
  return { target: value.target, hour: value.hour as number };
}

function parseMe(value: unknown): CheeseThiefPlayerView['me'] {
  if (value === null) return null;
  if (!isObject(value) || !hasExactKeys(value, ME_KEYS) || !isPlayerId(value.playerId)) return null;
  if (!isHour(value.wakeHour) || (value.wakeHour as number) < 1) return null;
  const hourChoices = parseHourChoices(value.hourChoices);
  if (hourChoices === null && value.hourChoices !== null) return null;
  if (!isPlayerIds(value.coWakers) || !isBool(value.cheeseWasMissing)) return null;
  if (!isBool(value.isThief) || !isBool(value.isAccomplice) || !isPlayerIds(value.knownAccomplices)) return null;
  if (!isRoleCard(value.roleCard) || !isBool(value.canPeek)) return null;
  const peekedHour = parsePeekedHour(value.peekedHour);
  if (peekedHour === null && value.peekedHour !== null) return null;
  const catPeekedHour = parsePeekedHour(value.catPeekedHour);
  if (catPeekedHour === null && value.catPeekedHour !== null) return null;
  return {
    playerId: value.playerId,
    wakeHour: value.wakeHour as number,
    hourChoices,
    coWakers: [...value.coWakers],
    cheeseWasMissing: value.cheeseWasMissing as boolean,
    isThief: value.isThief as boolean,
    isAccomplice: value.isAccomplice as boolean,
    knownAccomplices: [...value.knownAccomplices],
    roleCard: value.roleCard as RoleCard,
    canPeek: value.canPeek as boolean,
    peekedHour,
    catPeekedHour,
  };
}

export function parseCheeseThiefView(
  view: unknown,
  role: 'player' | 'spectator',
): CheeseThiefPlayerView | CheeseThiefPublicView | null {
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
