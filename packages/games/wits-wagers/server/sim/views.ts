/**
 * 一智千金桌面模拟模式 —— 视图构建与严格解析。
 * 两样私密内容各有一道闸：猜测数值只在亮牌后进公共视图（亮牌前只进本人 me.myGuess）；
 * 标准答案只在翻面后进 question.answer。
 */
import { z } from 'zod';
import { currentQuestion } from './rules.ts';
import type {
  SimQuestionView,
  WitsWagersSimPlayerView,
  WitsWagersSimPublicView,
  WitsWagersSimState,
} from './types.ts';

const targetIdSchema = z.string().regex(/^(lower|g:[1-9]\d*)$/);

const boardTargetSchema = z.object({
  id: targetIdSchema,
  value: z.number().nullable(),
  slot: z.enum(['L3', 'L2', 'L1', 'C', 'R1', 'R2', 'R3', 'LOWER']),
  odds: z.number(),
  authors: z.array(z.string()),
});

const chipSchema = z.object({ chipId: z.enum(['A', 'B']), targetId: targetIdSchema.nullable() });
const chipPairSchema = z.tuple([chipSchema, chipSchema]);

const questionSchema = z.object({
  id: z.string(),
  prompt: z.string(),
  unit: z.string(),
  answer: z.number().optional(),
});

const logEntrySchema = z.object({ text: z.string(), at: z.number() });

const timerSchema = z.object({
  durationSeconds: z.number(),
  remainingSeconds: z.number(),
  isRunning: z.boolean(),
  isExploded: z.boolean(),
});

const diceSchema = z.object({
  diceCount: z.number(),
  sides: z.number(),
  values: z.array(z.number()),
  lastRollBy: z.string().nullable(),
});

const bellSchema = z.object({
  rungBy: z.string().nullable(),
  ringCount: z.number(),
  lastRingAt: z.number(),
});

const propsSchema = z.object({
  timer: timerSchema.nullable(),
  dice: diceSchema.nullable(),
  bell: bellSchema.nullable(),
});

const publicViewSchema = z.object({
  gameId: z.literal('wits-wagers'),
  rulesetId: z.literal('wits_wagers_sim_v1'),
  schemaVersion: z.literal(1),
  phase: z.literal('sim'),
  players: z.array(z.string()),
  questionNumber: z.number(),
  question: questionSchema.nullable(),
  answerRevealed: z.boolean(),
  revealed: z.boolean(),
  submittedIds: z.array(z.string()),
  guesses: z.record(z.string(), z.number()).nullable(),
  board: z.array(boardTargetSchema),
  chips: z.record(z.string(), chipPairSchema),
  money: z.record(z.string(), z.number()),
  props: propsSchema,
  activityLogs: z.array(logEntrySchema),
});

const playerViewSchema = publicViewSchema.extend({
  me: z.object({ playerId: z.string(), myGuess: z.number().nullable() }).nullable(),
});

function questionView(state: WitsWagersSimState): SimQuestionView | null {
  const q = currentQuestion(state);
  if (!q) return null;
  const view: SimQuestionView = { id: q.id, prompt: q.prompt, unit: q.unit };
  if (state.answerRevealed) view.answer = q.answer;
  return view;
}

export function buildWitsWagersSimPublicView(state: WitsWagersSimState): WitsWagersSimPublicView {
  const submittedIds = state.players.filter((pid) => typeof state.guesses[pid] === 'number');
  let guesses: Record<string, number> | null = null;
  if (state.revealed) {
    guesses = {};
    for (const pid of submittedIds) guesses[pid] = state.guesses[pid] as number;
  }
  const chips: WitsWagersSimPublicView['chips'] = {};
  for (const pid of state.players) {
    const pair = state.chips[pid];
    if (pair) chips[pid] = [{ ...pair[0] }, { ...pair[1] }];
  }
  return {
    gameId: 'wits-wagers',
    rulesetId: 'wits_wagers_sim_v1',
    schemaVersion: 1,
    phase: 'sim',
    players: [...state.players],
    questionNumber: state.questionHistory.length,
    question: questionView(state),
    answerRevealed: state.answerRevealed,
    revealed: state.revealed,
    submittedIds,
    guesses,
    board: state.board.map((t) => ({ ...t, authors: [...t.authors] })),
    chips,
    money: { ...state.money },
    props: {
      timer: state.props.timer ? { ...state.props.timer } : null,
      dice: state.props.dice ? { ...state.props.dice, values: [...state.props.dice.values] } : null,
      bell: state.props.bell ? { ...state.props.bell } : null,
    },
    activityLogs: state.activityLogs.map((l) => ({ ...l })),
  };
}

export function buildWitsWagersSimPlayerView(state: WitsWagersSimState, playerId: string): WitsWagersSimPlayerView {
  const base = buildWitsWagersSimPublicView(state);
  return {
    ...base,
    me: state.players.includes(playerId) ? { playerId, myGuess: state.guesses[playerId] ?? null } : null,
  };
}

export function parseWitsWagersSimPlayerView(input: unknown): WitsWagersSimPlayerView {
  return playerViewSchema.parse(input) as WitsWagersSimPlayerView;
}

export function parseWitsWagersSimPublicView(input: unknown): WitsWagersSimPublicView {
  return publicViewSchema.parse(input) as WitsWagersSimPublicView;
}
