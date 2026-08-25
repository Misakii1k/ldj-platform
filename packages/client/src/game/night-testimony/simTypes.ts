/**
 * night_testimony_sim_v1 客户端严格视角类型与解析器（与服务端 sim 视图形状对应）。
 */

export interface SimLogEntry { text: string; at: number; }
export interface SimTimerState { durationSeconds: number; remainingSeconds: number; isRunning: boolean; isExploded: boolean; }
export interface SimDiceState { diceCount: number; sides: number; values: number[]; lastRollBy: string | null; }
export interface SimBellState { rungBy: string | null; ringCount: number; lastRingAt: number; }
export interface SimProps { timer: SimTimerState | null; dice: SimDiceState | null; bell: SimBellState | null; }

export interface SimQuestionCard {
  id: string;
  text: string;
  category: string;
  categoryLabel: string;
}

export interface NightTestimonySimPublicView {
  gameId: 'night-testimony';
  rulesetId: 'night_testimony_sim_v1';
  schemaVersion: 1;
  phase: 'sim';
  players: string[];
  extraCrime: string | null;
  questionArea: { card: SimQuestionCard; revealedBy: string } | null;
  usedQuestionCount: number;
  props: SimProps;
  activityLogs: SimLogEntry[];
}

export interface NightTestimonySimPlayerView extends NightTestimonySimPublicView {
  me: { playerId: string; isWarden: boolean; crime: string | null } | null;
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

export function parseNightTestimonySimView(input: unknown): NightTestimonySimPlayerView | null {
  if (!isObject(input)) return null;
  if (input.gameId !== 'night-testimony' || input.rulesetId !== 'night_testimony_sim_v1' || input.schemaVersion !== 1) return null;
  if (input.phase !== 'sim') return null;
  if (!Array.isArray(input.players) || input.players.some((p) => typeof p !== 'string')) return null;
  if (typeof input.usedQuestionCount !== 'number') return null;
  let questionArea: NightTestimonySimPublicView['questionArea'] = null;
  if (input.questionArea !== null && input.questionArea !== undefined) {
    if (!isObject(input.questionArea) || typeof input.questionArea.revealedBy !== 'string' || !isObject(input.questionArea.card)) return null;
    const c = input.questionArea.card;
    if (typeof c.id !== 'string' || typeof c.text !== 'string' || typeof c.categoryLabel !== 'string') return null;
    questionArea = { card: { id: c.id, text: c.text, category: typeof c.category === 'string' ? c.category : '', categoryLabel: c.categoryLabel }, revealedBy: input.questionArea.revealedBy };
  }
  const props = parseProps(input.props);
  if (props === null) return null;
  const activityLogs = parseLogs(input.activityLogs);
  if (activityLogs === null) return null;

  const base: NightTestimonySimPublicView = {
    gameId: 'night-testimony',
    rulesetId: 'night_testimony_sim_v1',
    schemaVersion: 1,
    phase: 'sim',
    players: input.players as string[],
    extraCrime: typeof input.extraCrime === 'string' ? input.extraCrime : null,
    questionArea,
    usedQuestionCount: input.usedQuestionCount,
    props,
    activityLogs,
  };
  if (input.me === null || input.me === undefined) return { ...base, me: null };
  if (!isObject(input.me) || typeof input.me.playerId !== 'string') return null;
  return {
    ...base,
    me: {
      playerId: input.me.playerId,
      isWarden: input.me.isWarden === true,
      crime: typeof input.me.crime === 'string' ? input.me.crime : null,
    },
  };
}
