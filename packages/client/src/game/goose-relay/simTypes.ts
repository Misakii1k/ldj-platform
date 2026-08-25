/**
 * goose_relay_sim_v1 客户端严格视角类型与解析器（与服务端 sim 视图形状对应）。
 */

export interface SimLogEntry { text: string; at: number; }
export interface SimTimerState { durationSeconds: number; remainingSeconds: number; isRunning: boolean; isExploded: boolean; }
export interface SimDiceState { diceCount: number; sides: number; values: number[]; lastRollBy: string | null; }
export interface SimBellState { rungBy: string | null; ringCount: number; lastRingAt: number; }
export interface SimProps { timer: SimTimerState | null; dice: SimDiceState | null; bell: SimBellState | null; }

export interface GooseRelaySimCase {
  murderer: string;
  victim: string;
}

export interface GooseRelaySimPublicView {
  gameId: 'goose-relay';
  rulesetId: 'goose_relay_sim_v1';
  schemaVersion: 1;
  phase: 'sim';
  players: string[];
  candidateCards: string[];
  headPlayerId: string;
  props: SimProps;
  activityLogs: SimLogEntry[];
}

export interface GooseRelaySimPlayerView extends GooseRelaySimPublicView {
  me: { playerId: string; isHead: boolean; caseCard: GooseRelaySimCase | null } | null;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function parseLogs(input: unknown): SimLogEntry[] | null {
  if (!Array.isArray(input)) return null;
  const logs: SimLogEntry[] = [];
  for (const item of input) {
    if (!isObject(item) || typeof item.text !== 'string' || typeof item.at !== 'number') return null;
    logs.push({ text: item.text, at: item.at });
  }
  return logs;
}

function parseProps(input: unknown): SimProps | null {
  if (!isObject(input)) return null;
  const timer = input.timer === null ? null : isObject(input.timer) && typeof input.timer.durationSeconds === 'number' && typeof input.timer.remainingSeconds === 'number' && typeof input.timer.isRunning === 'boolean' && typeof input.timer.isExploded === 'boolean'
    ? { durationSeconds: input.timer.durationSeconds, remainingSeconds: input.timer.remainingSeconds, isRunning: input.timer.isRunning, isExploded: input.timer.isExploded }
    : null;
  if (input.timer !== null && timer === null) return null;
  const dice = input.dice === null ? null : isObject(input.dice) && Array.isArray(input.dice.values) && typeof input.dice.diceCount === 'number'
    ? { diceCount: input.dice.diceCount, sides: typeof input.dice.sides === 'number' ? input.dice.sides : 6, values: input.dice.values as number[], lastRollBy: typeof input.dice.lastRollBy === 'string' ? input.dice.lastRollBy : null }
    : null;
  if (input.dice !== null && dice === null) return null;
  const bell = input.bell === null ? null : isObject(input.bell) && typeof input.bell.ringCount === 'number'
    ? { rungBy: typeof input.bell.rungBy === 'string' ? input.bell.rungBy : null, ringCount: input.bell.ringCount, lastRingAt: typeof input.bell.lastRingAt === 'number' ? input.bell.lastRingAt : 0 }
    : null;
  if (input.bell !== null && bell === null) return null;
  return { timer, dice, bell };
}

export function parseGooseRelaySimView(input: unknown): GooseRelaySimPlayerView | null {
  if (!isObject(input)) return null;
  if (input.gameId !== 'goose-relay' || input.rulesetId !== 'goose_relay_sim_v1' || input.schemaVersion !== 1) return null;
  if (input.phase !== 'sim') return null;
  if (!Array.isArray(input.players) || input.players.some((p) => typeof p !== 'string')) return null;
  if (!Array.isArray(input.candidateCards) || input.candidateCards.some((c) => typeof c !== 'string')) return null;
  if (typeof input.headPlayerId !== 'string') return null;
  const props = parseProps(input.props);
  if (props === null) return null;
  const activityLogs = parseLogs(input.activityLogs);
  if (activityLogs === null) return null;

  const base: GooseRelaySimPublicView = {
    gameId: 'goose-relay',
    rulesetId: 'goose_relay_sim_v1',
    schemaVersion: 1,
    phase: 'sim',
    players: input.players as string[],
    candidateCards: input.candidateCards as string[],
    headPlayerId: input.headPlayerId,
    props,
    activityLogs,
  };
  if (input.me === null || input.me === undefined) return { ...base, me: null };
  if (!isObject(input.me) || typeof input.me.playerId !== 'string') return null;
  let caseCard: GooseRelaySimCase | null = null;
  if (input.me.caseCard !== null && input.me.caseCard !== undefined) {
    if (!isObject(input.me.caseCard) || typeof input.me.caseCard.murderer !== 'string' || typeof input.me.caseCard.victim !== 'string') return null;
    caseCard = { murderer: input.me.caseCard.murderer, victim: input.me.caseCard.victim };
  }
  return { ...base, me: { playerId: input.me.playerId, isHead: input.me.isHead === true, caseCard } };
}
