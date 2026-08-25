/**
 * cheese_thief_sim_v1 客户端严格视角类型与解析器（与服务端 sim 视图形状对应）。
 */

export interface SimLogEntry { text: string; at: number; }
export interface SimTimerState { durationSeconds: number; remainingSeconds: number; isRunning: boolean; isExploded: boolean; }
export interface SimDiceState { diceCount: number; sides: number; values: number[]; lastRollBy: string | null; }
export interface SimBellState { rungBy: string | null; ringCount: number; lastRingAt: number; }
export interface SimProps { timer: SimTimerState | null; dice: SimDiceState | null; bell: SimBellState | null; }

export type SimRoleCard = 'cat' | 'dog' | 'whiteMouse';

export interface CheeseThiefSimPublicView {
  gameId: 'cheese-thief';
  rulesetId: 'cheese_thief_sim_v1';
  schemaVersion: 1;
  phase: 'sim';
  players: string[];
  roleCardsEnabled: boolean;
  props: SimProps;
  activityLogs: SimLogEntry[];
}

export interface CheeseThiefSimPlayerView extends CheeseThiefSimPublicView {
  me: { playerId: string; wakeHour: number | null; roleCard: SimRoleCard | null } | null;
}

const ROLE_LABELS: Record<SimRoleCard, string> = {
  cat: '🐱 猫（查看他人骰子）',
  dog: '🐶 狗（指定先投票）',
  whiteMouse: '🐭 白老鼠（被投出单独胜）',
};

export { ROLE_LABELS };

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isRole(v: unknown): v is SimRoleCard {
  return v === 'cat' || v === 'dog' || v === 'whiteMouse';
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

export function parseCheeseThiefSimView(input: unknown): CheeseThiefSimPlayerView | null {
  if (!isObject(input)) return null;
  if (input.gameId !== 'cheese-thief' || input.rulesetId !== 'cheese_thief_sim_v1' || input.schemaVersion !== 1) return null;
  if (input.phase !== 'sim') return null;
  if (!Array.isArray(input.players) || input.players.some((p) => typeof p !== 'string')) return null;
  const props = parseProps(input.props);
  if (props === null) return null;
  const activityLogs = parseLogs(input.activityLogs);
  if (activityLogs === null) return null;

  const base: CheeseThiefSimPublicView = {
    gameId: 'cheese-thief',
    rulesetId: 'cheese_thief_sim_v1',
    schemaVersion: 1,
    phase: 'sim',
    players: input.players as string[],
    roleCardsEnabled: input.roleCardsEnabled === true,
    props,
    activityLogs,
  };
  if (input.me === null || input.me === undefined) return { ...base, me: null };
  if (!isObject(input.me) || typeof input.me.playerId !== 'string') return null;
  return {
    ...base,
    me: {
      playerId: input.me.playerId,
      wakeHour: typeof input.me.wakeHour === 'number' ? input.me.wakeHour : null,
      roleCard: isRole(input.me.roleCard) ? input.me.roleCard : null,
    },
  };
}
