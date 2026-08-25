/**
 * bell_clash_sim_v1 客户端严格视角类型与解析器（与服务端 sim 视图形状一一对应）。
 */

export type SimCardColor = 'red' | 'yellow' | 'green' | 'blue';

export interface SimNumberCard {
  kind: 'number';
  color: SimCardColor;
  number: number;
}

export interface SimPhraseCard {
  kind: 'phrase';
  color: SimCardColor;
  phrase: string;
}

export type SimCard = SimNumberCard | SimPhraseCard;

export interface SimLogEntry {
  text: string;
  at: number;
}

export interface SimTimerState {
  durationSeconds: number;
  remainingSeconds: number;
  isRunning: boolean;
  isExploded: boolean;
}

export interface SimDiceState {
  diceCount: number;
  sides: number;
  values: number[];
  lastRollBy: string | null;
}

export interface SimBellState {
  rungBy: string | null;
  ringCount: number;
  lastRingAt: number;
}

export interface SimProps {
  timer: SimTimerState | null;
  dice: SimDiceState | null;
  bell: SimBellState | null;
}

export interface BellClashSimTableCard {
  card: SimCard;
  playedBy: string;
}

export interface BellClashSimPublicView {
  gameId: 'bell-clash';
  rulesetId: 'bell_clash_sim_v1';
  schemaVersion: 1;
  phase: 'sim';
  players: string[];
  handCounts: Record<string, number>;
  drawCount: number;
  discardTop: SimCard | null;
  tableCards: BellClashSimTableCard[];
  props: SimProps;
  activityLogs: SimLogEntry[];
}

export interface BellClashSimPlayerView extends BellClashSimPublicView {
  me: { playerId: string; hand: SimCard[] } | null;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isColor(v: unknown): v is SimCardColor {
  return v === 'red' || v === 'yellow' || v === 'green' || v === 'blue';
}

export function parseSimCard(input: unknown): SimCard | null {
  if (!isObject(input)) return null;
  if (input.kind === 'number' && isColor(input.color) && typeof input.number === 'number') {
    return { kind: 'number', color: input.color, number: input.number };
  }
  if (input.kind === 'phrase' && isColor(input.color) && typeof input.phrase === 'string') {
    return { kind: 'phrase', color: input.color, phrase: input.phrase };
  }
  return null;
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
  const timerRaw = input.timer;
  const timer = timerRaw === null ? null : isObject(timerRaw) && typeof timerRaw.durationSeconds === 'number' && typeof timerRaw.remainingSeconds === 'number' && typeof timerRaw.isRunning === 'boolean' && typeof timerRaw.isExploded === 'boolean'
    ? { durationSeconds: timerRaw.durationSeconds, remainingSeconds: timerRaw.remainingSeconds, isRunning: timerRaw.isRunning, isExploded: timerRaw.isExploded }
    : null;
  if (input.timer !== null && timer === null) return null;
  const diceRaw = input.dice;
  const dice = diceRaw === null ? null : isObject(diceRaw) && Array.isArray(diceRaw.values) && typeof diceRaw.diceCount === 'number' && typeof diceRaw.sides === 'number'
    ? { diceCount: diceRaw.diceCount, sides: diceRaw.sides, values: diceRaw.values as number[], lastRollBy: typeof diceRaw.lastRollBy === 'string' ? diceRaw.lastRollBy : null }
    : null;
  if (input.dice !== null && dice === null) return null;
  const bellRaw = input.bell;
  const bell = bellRaw === null ? null : isObject(bellRaw) && typeof bellRaw.ringCount === 'number'
    ? { rungBy: typeof bellRaw.rungBy === 'string' ? bellRaw.rungBy : null, ringCount: bellRaw.ringCount, lastRingAt: typeof bellRaw.lastRingAt === 'number' ? bellRaw.lastRingAt : 0 }
    : null;
  if (input.bell !== null && bell === null) return null;
  return { timer, dice, bell };
}

export function parseBellClashSimView(input: unknown): BellClashSimPlayerView | null {
  if (!isObject(input)) return null;
  if (input.gameId !== 'bell-clash' || input.rulesetId !== 'bell_clash_sim_v1' || input.schemaVersion !== 1) return null;
  if (input.phase !== 'sim') return null;
  if (!Array.isArray(input.players) || input.players.some((p) => typeof p !== 'string')) return null;
  if (!isObject(input.handCounts) || typeof input.drawCount !== 'number') return null;
  const discardTop = input.discardTop === null ? null : parseSimCard(input.discardTop);
  if (input.discardTop !== null && discardTop === null) return null;
  if (!Array.isArray(input.tableCards)) return null;
  const tableCards: BellClashSimTableCard[] = [];
  for (const item of input.tableCards) {
    if (!isObject(item) || typeof item.playedBy !== 'string') return null;
    const card = parseSimCard(item.card);
    if (card === null) return null;
    tableCards.push({ card, playedBy: item.playedBy });
  }
  const props = parseProps(input.props);
  if (props === null) return null;
  const activityLogs = parseLogs(input.activityLogs);
  if (activityLogs === null) return null;

  const base: BellClashSimPublicView = {
    gameId: 'bell-clash',
    rulesetId: 'bell_clash_sim_v1',
    schemaVersion: 1,
    phase: 'sim',
    players: input.players as string[],
    handCounts: input.handCounts as Record<string, number>,
    drawCount: input.drawCount,
    discardTop,
    tableCards,
    props,
    activityLogs,
  };

  if (input.me === null || input.me === undefined) {
    return { ...base, me: null };
  }
  if (!isObject(input.me) || typeof input.me.playerId !== 'string' || !Array.isArray(input.me.hand)) return null;
  const hand: SimCard[] = [];
  for (const cardRaw of input.me.hand) {
    const card = parseSimCard(cardRaw);
    if (card === null) return null;
    hand.push(card);
  }
  return { ...base, me: { playerId: input.me.playerId, hand } };
}
