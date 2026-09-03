import { z } from 'zod';
import { CRIMES, type CrimeId, type NightTestimonyPlayerView, type NightTestimonyPublicView, type NightTestimonyState } from './types.ts';

const pid = z.string().min(1).max(64);
const phaseEnum = z.enum(['question', 'deduction', 'vote', 'game_over']);
const crimeSchema = z.enum(CRIMES);
const identitySchema = z.union([crimeSchema, z.literal('warden')]);

export function crimeLabel(crime: CrimeId): string {
  const map: Record<CrimeId, string> = {
    arson: '恶意纵火',
    theft: '入室盗窃',
    forgery: '公文伪造',
    smuggling: '违禁走私',
    fraud: '电信诈骗',
    kidnap: '密室绑架',
    littering: '乱扔垃圾',
    public_urination: '随地便溺',
    noise_nuisance: '深夜扰民',
    graffiti: '乱涂乱画',
    dine_and_dash: '吃霸王餐',
    line_cutting: '恶意插队',
    scalping: '倒卖黄牛',
    public_smoking: '禁烟区吸烟',
    hacker: '黑客入侵',
    wifi_leeching: '蹭网盗密',
    scalp_bot: '抢购外挂',
    spoilers: '恶意剧透',
    water_army: '网络水军',
    office_theft: '偷吃外卖',
    pickpocket: '公交扒窃',
    bike_theft: '偷电瓶车',
    counterfeiter: '制造假币',
    blackmail: '敲诈勒索',
    prison_break: '密室越狱',
    poisoning: '投毒暗害',
    grave_robbery: '盗掘古墓',
    transnational_crime: '跨国犯罪',
    money_laundering: '地下洗钱',
    museum_heist: '名画盗窃',
    arms_trafficking: '军火走私',
    espionage: '商业间谍',
    poaching: '盗猎珍兽',
    pyramid_scheme: '传销洗脑',
    sea_pirate: '公海海盗',
    impersonation: '假冒军警',
  };
  return map[crime] ?? crime;
}

const questionCardViewSchema = z
  .object({
    id: z.string().min(1),
    text: z.string().min(1),
    category: z.enum(['motive', 'method', 'time', 'scene', 'property', 'personnel']),
    categoryLabel: z.string().min(1),
  })
  .strict();

const questionRecordSchema = z
  .object({
    questionIndex: z.number().int().positive(),
    questionerId: pid,
    cardId: z.string().min(1),
    question: z.string().min(1),
    answers: z.record(pid, z.enum(['yes', 'no'])),
  })
  .strict();

const currentQuestionViewSchema = z
  .object({
    questionIndex: z.number().int().positive(),
    questionerId: pid,
    cardId: z.string().min(1),
    text: z.string().min(1),
    answers: z.record(pid, z.enum(['yes', 'no'])),
  })
  .strict();

const nightTestimonyRevealSchema = z
  .object({
    wardenId: pid,
    crimes: z.record(pid, crimeSchema),
    history: z.array(questionRecordSchema),
    extraCrime: crimeSchema.nullable(),
    accusedId: pid.nullable(),
    wardenRevealed: z.boolean(),
    wardenGuesses: z.record(pid, crimeSchema).nullable(),
    crimesAllGuessed: z.boolean(),
  })
  .strict();

const nightTestimonyPublicViewSchema = z
  .object({
    gameId: z.literal('night-testimony'),
    rulesetId: z.literal('night_testimony_v1'),
    schemaVersion: z.literal(1),
    phase: phaseEnum,
    players: z.array(pid),
    currentQuestionerId: pid,
    questionIndex: z.number().int().nonnegative(),
    questionLimit: z.number().int().positive(),
    maxYesPerPlayer: z.number().int().positive(),
    history: z.array(questionRecordSchema),
    playerYesCounts: z.record(pid, z.number().int().nonnegative()),
    currentQuestion: currentQuestionViewSchema.nullable(),
    revealedIdentities: z.record(pid, identitySchema),
    extraCrime: crimeSchema.nullable(),
    availableGuessCrimes: z.array(crimeSchema).nullable(),
    votedPlayerIds: z.array(pid),
    accusedId: pid.nullable(),
    wardenRevealed: z.boolean().nullable(),
    guessingInProgress: z.boolean(),
    winners: z.array(pid),
    reveal: nightTestimonyRevealSchema.nullable(),
  })
  .strict();

const nightTestimonyPlayerViewSchema = nightTestimonyPublicViewSchema.extend({
  me: z
    .object({
      playerId: pid,
      isWarden: z.boolean(),
      crime: crimeSchema.nullable(),
      myYesCount: z.number().int().nonnegative(),
      hasAnsweredCurrent: z.boolean(),
      hasVoted: z.boolean(),
      pendingCardChoices: z.array(questionCardViewSchema).nullable(),
    })
    .strict()
    .nullable(),
});

function parseOrThrow<T>(schema: z.ZodType<unknown>, input: unknown, label: string): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    const issue = result.error.issues[0]!;
    throw new Error(issue.code === 'unrecognized_keys' ? `${label} 字段无效` : issue.message);
  }
  return result.data as T;
}

function buildPublicView(state: NightTestimonyState): NightTestimonyPublicView {
  const showExtra = state.phase === 'deduction' || state.phase === 'game_over' || state.guessingInProgress;
  
  let availableGuessCrimes: CrimeId[] | null = null;
  if (state.guessingInProgress || state.phase === 'game_over') {
    const set = new Set<CrimeId>(Object.values(state.crimes ?? {}));
    if (state.extraCrime) set.add(state.extraCrime);
    availableGuessCrimes = Array.from(set).sort();
  }

  const currentQ = state.currentQuestion
    ? {
        questionIndex: state.currentQuestion.questionIndex,
        questionerId: state.currentQuestion.questionerId,
        cardId: state.currentQuestion.cardId,
        text: state.currentQuestion.text,
        answers: { ...(state.currentQuestionAnswers ?? {}) },
      }
    : null;

  const history = state.history ?? [];
  const playerYesCounts = state.playerYesCounts ?? Object.fromEntries((state.players ?? []).map((id) => [id, 0]));
  const questionLimit = state.config?.questionLimit ?? 5;
  const maxYesPerPlayer = state.config?.maxYesPerPlayer ?? 3;

  return {
    gameId: 'night-testimony',
    rulesetId: 'night_testimony_v1',
    schemaVersion: 1,
    phase: state.phase,
    players: [...(state.players ?? [])],
    currentQuestionerId: state.currentQuestionerId ?? state.players?.[0] ?? '',
    questionIndex: history.length + (state.currentQuestion ? 1 : 0),
    questionLimit,
    maxYesPerPlayer,
    history: history.map((h) => ({
      questionIndex: h.questionIndex,
      questionerId: h.questionerId,
      cardId: h.cardId,
      question: h.question,
      answers: { ...(h.answers ?? {}) },
    })),
    playerYesCounts: { ...playerYesCounts },
    currentQuestion: currentQ,
    revealedIdentities: { ...(state.revealedIdentities ?? {}) },
    extraCrime: showExtra ? (state.extraCrime ?? null) : null,
    availableGuessCrimes,
    votedPlayerIds: Object.keys(state.votes ?? {}),
    accusedId: state.accusedId ?? null,
    wardenRevealed: state.wardenRevealed ?? null,
    guessingInProgress: Boolean(state.guessingInProgress),
    winners: [...(state.winners ?? [])],
    reveal:
      state.phase === 'game_over'
        ? {
            wardenId: state.wardenId,
            crimes: { ...(state.crimes ?? {}) },
            history: history.map((h) => ({
              questionIndex: h.questionIndex,
              questionerId: h.questionerId,
              cardId: h.cardId,
              question: h.question,
              answers: { ...(h.answers ?? {}) },
            })),
            extraCrime: state.extraCrime ?? null,
            accusedId: state.accusedId ?? null,
            wardenRevealed: state.wardenRevealed ?? false,
            wardenGuesses: state.wardenGuesses ? { ...state.wardenGuesses } : null,
            crimesAllGuessed: state.crimesAllGuessed ?? false,
          }
        : null,
  };
}

export function buildNightTestimonyPlayerView(
  state: NightTestimonyState,
  playerId: string,
): NightTestimonyPlayerView {
  const base = buildPublicView(state);
  if (!state.players?.includes(playerId)) return { ...base, me: null };

  const isWarden = state.wardenId === playerId;
  const isQuestioner = (state.currentQuestionerId ?? state.players?.[0]) === playerId;
  const isPickingCard = state.phase === 'question' && state.currentQuestion === null && isQuestioner;

  const pendingCardChoices =
    isPickingCard && state.pendingCardChoices
      ? state.pendingCardChoices.map((c) => ({
          id: c.id,
          text: c.text,
          category: c.category,
          categoryLabel: c.categoryLabel,
        }))
      : null;

  const hasAnsweredCurrent = state.currentQuestion !== null && state.currentQuestionAnswers?.[playerId] !== undefined;
  const hasVoted = Boolean(state.votes && state.votes[playerId]);

  return {
    ...base,
    me: {
      playerId,
      isWarden,
      crime: isWarden ? null : (state.crimes?.[playerId] ?? null),
      myYesCount: state.playerYesCounts?.[playerId] ?? 0,
      hasAnsweredCurrent,
      hasVoted,
      pendingCardChoices,
    },
  };
}

export function buildNightTestimonySpectatorView(state: NightTestimonyState): NightTestimonyPublicView {
  return buildPublicView(state);
}

export function parseNightTestimonySpectatorView(input: unknown): NightTestimonyPublicView {
  return parseOrThrow<NightTestimonyPublicView>(nightTestimonyPublicViewSchema, input, '囚徒之夜 视图');
}

export function parseNightTestimonyPlayerView(input: unknown): NightTestimonyPlayerView {
  return parseOrThrow<NightTestimonyPlayerView>(nightTestimonyPlayerViewSchema, input, '囚徒之夜 玩家视图');
}
