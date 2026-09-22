/** night_testimony_v1 客户端严格视角类型与解析器（与服务端视图形状一一对应）。 */

export const CRIMES = [
  'arson',
  'theft',
  'forgery',
  'smuggling',
  'fraud',
  'kidnap',
  'littering',
  'public_urination',
  'noise_nuisance',
  'graffiti',
  'dine_and_dash',
  'line_cutting',
  'scalping',
  'public_smoking',
  'hacker',
  'wifi_leeching',
  'scalp_bot',
  'spoilers',
  'water_army',
  'office_theft',
  'pickpocket',
  'bike_theft',
  'counterfeiter',
  'blackmail',
  'prison_break',
  'poisoning',
  'grave_robbery',
  'transnational_crime',
  'money_laundering',
  'museum_heist',
  'arms_trafficking',
  'espionage',
  'poaching',
  'pyramid_scheme',
  'sea_pirate',
  'impersonation',
] as const;
export type CrimeId = (typeof CRIMES)[number];
export type NightTestimonyPhase = 'question' | 'deduction' | 'vote' | 'game_over';

/** 罪行中文档案（主页面与桌面模拟端共用；模拟端视图只带原始 key，必须经此映射展示）。 */
export const CRIME_META: Record<CrimeId, { name: string; traits: string }> = {
  // 传统恶性与人身侵财
  arson: { name: '恶意纵火', traits: '火源、高温、焦黑灰烬、不动产损毁、夜间' },
  theft: { name: '入室盗窃', traits: '撬锁、潜入、手套撬棍、实体财物、无声搜刮' },
  forgery: { name: '公文伪造', traits: '虚假公文、篡改印章、假学历假证书、高超摹仿' },
  smuggling: { name: '违禁走私', traits: '越境运输、违禁品仓储、集装箱黑市、逃避关税' },
  fraud: { name: '电信诈骗', traits: '杀猪盘、商业骗局、冒充公检法、诱导转账' },
  kidnap: { name: '密室绑架', traits: '人身控制、密室关押、勒索赎金、绳索胶带' },

  // 生活微罪与不文明行为
  littering: { name: '乱扔垃圾', traits: '随手丢弃、果皮纸屑、造假分类、弄脏环境' },
  public_urination: { name: '随地便溺', traits: '绿化带放水、墙角恶臭、避开监控、毫无公德' },
  noise_nuisance: { name: '深夜扰民', traits: '半夜电钻、深夜蹦迪、走廊喧哗、破坏睡眠' },
  graffiti: { name: '乱涂乱画', traits: '景区涂鸦、油漆小广告、刻字到此一游、破坏公物' },
  dine_and_dash: { name: '吃霸王餐', traits: '借口溜走、假装忘带手机、换桌逃单、专挑小店' },
  line_cutting: { name: '恶意插队', traits: '硬挤队伍、假装找朋友、强行加塞、公愤焦点' },
  scalping: { name: '倒卖黄牛', traits: '抢空门票、天价加价、黑市倒票、扰乱秩序' },
  public_smoking: { name: '禁烟区吸烟', traits: '电梯吸烟、楼道吐雾、乱弹烟灰、刺鼻烟味' },

  // 职场、网络与数字犯罪
  hacker: { name: '黑客入侵', traits: '远程攻破、植入木马、篡改数据、窃取源码' },
  wifi_leeching: { name: '蹭网盗密', traits: '万能钥匙、破解密码、偷吃带宽、偷窥流量' },
  scalp_bot: { name: '抢购外挂', traits: '脚本外挂、秒杀显卡、瘫痪服务器、自动化作弊' },
  spoilers: { name: '恶意剧透', traits: '首映剧透凶手、弹幕反转炸弹、毁灭观影体验' },
  water_army: { name: '网络水军', traits: '刷好评控评、操控舆论热搜、批量僵尸号' },
  office_theft: { name: '偷吃外卖', traits: '偷拿前台外卖、冰箱偷喝奶茶、神不知鬼不觉' },

  // 市井侵财与偷盗
  pickpocket: { name: '公交扒窃', traits: '拥挤人群、刀片割袋、顺手牵羊、手法极快' },
  bike_theft: { name: '偷电瓶车', traits: '剪断车锁、拔掉电瓶、假装车主、二手倒卖' },
  counterfeiter: { name: '制造假币', traits: '印刷假钞、特制纸张油墨、市面调包、以假乱真' },
  blackmail: { name: '敲诈勒索', traits: '私密黑料、匿名威胁、索要封口费、步步紧逼' },
  prison_break: { name: '密室越狱', traits: '挖地道、翻越高墙、换装潜逃、全城通缉' },
  poisoning: { name: '投毒暗害', traits: '无色无味、水杯下毒、伪装意外、化学试剂' },
  grave_robbery: { name: '盗掘古墓', traits: '洛阳铲、深夜探穴、炸开地宫、倒卖出土文物' },

  // 跨国犯罪与超级重案
  transnational_crime: { name: '跨国犯罪', traits: '跨国黑产、多本伪造护照、洗钱网络、国际红通' },
  money_laundering: { name: '地下洗钱', traits: '空壳公司、虚拟货币、海量资金分流、抹去流水' },
  museum_heist: { name: '名画盗窃', traits: '闪避红外激光、调包名画、切割防盗玻璃、价值连城' },
  arms_trafficking: { name: '军火走私', traits: '秘密军火箱、货轮改装、伪装农机、危险重武器' },
  espionage: { name: '商业间谍', traits: '针孔窃听、窃取芯片源码、高管卧底、高额赏金' },
  poaching: { name: '盗猎珍兽', traits: '深山猎夹、偷猎国家保护动物、剥取角牙皮毛' },
  pyramid_scheme: { name: '传销洗脑', traits: '秘密开会、没收手机、拉人头发展下线、精神控制' },
  sea_pirate: { name: '公海海盗', traits: '快艇劫持货轮、武装扣押船员、索要保护费' },
  impersonation: { name: '假冒军警', traits: '假制服假警官证、非法设卡检查、招摇撞骗' },
};

/** 罪行 key → 中文名；未知 key 原样返回（视图数据异常时不至于白屏）。 */
export function crimeName(id: string | null | undefined): string {
  if (!id) return '';
  return (CRIME_META as Record<string, { name: string }>)[id]?.name ?? id;
}

export interface QuestionCardView {
  id: string;
  text: string;
  category: 'motive' | 'method' | 'time' | 'scene' | 'property' | 'personnel';
  categoryLabel: string;
}

export interface QuestionRecord {
  questionIndex: number;
  questionerId: string;
  cardId: string;
  question: string;
  answers: Record<string, 'yes' | 'no'>;
}

export interface NightTestimonyReveal {
  wardenId: string;
  crimes: Record<string, CrimeId>;
  history: QuestionRecord[];
  extraCrime: CrimeId | null;
  accusedId: string | null;
  wardenRevealed: boolean;
  wardenGuesses: Record<string, CrimeId> | null;
  crimesAllGuessed: boolean;
}

export interface NightTestimonyPublicView {
  gameId: 'night-testimony';
  rulesetId: 'night_testimony_v1';
  schemaVersion: 1;
  phase: NightTestimonyPhase;
  players: string[];
  currentQuestionerId: string;
  questionIndex: number;
  questionLimit: number;
  maxYesPerPlayer: number;
  history: QuestionRecord[];
  playerYesCounts: Record<string, number>;
  currentQuestion: {
    questionIndex: number;
    questionerId: string;
    cardId: string;
    text: string;
    answers: Record<string, 'yes' | 'no'>;
  } | null;
  revealedIdentities: Record<string, CrimeId | 'warden'>;
  extraCrime: CrimeId | null;
  availableGuessCrimes: CrimeId[] | null;
  votedPlayerIds: string[];
  accusedId: string | null;
  wardenRevealed: boolean | null;
  guessingInProgress: boolean;
  winners: string[];
  /** 当前阶段截止时刻；无计时阶段（选卡、终局）为 null */
  deadlineAt: number | null;
  reveal: NightTestimonyReveal | null;
}

export interface NightTestimonyPlayerView extends NightTestimonyPublicView {
  me: {
    playerId: string;
    isWarden: boolean;
    crime: CrimeId | null;
    myYesCount: number;
    hasAnsweredCurrent: boolean;
    hasVoted: boolean;
    pendingCardChoices: QuestionCardView[] | null;
  } | null;
}

const PUBLIC_KEYS = [
  'gameId', 'rulesetId', 'schemaVersion', 'phase', 'players', 'currentQuestionerId',
  'questionIndex', 'questionLimit', 'maxYesPerPlayer', 'history', 'playerYesCounts',
  'currentQuestion', 'revealedIdentities', 'extraCrime', 'availableGuessCrimes', 'votedPlayerIds',
  'accusedId', 'wardenRevealed', 'guessingInProgress', 'winners', 'deadlineAt', 'reveal',
] as const;
const ME_KEYS = ['playerId', 'isWarden', 'crime', 'myYesCount', 'hasAnsweredCurrent', 'hasVoted', 'pendingCardChoices'] as const;

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

function isCrime(value: unknown): value is CrimeId {
  return typeof value === 'string' && (CRIMES as readonly string[]).includes(value);
}

function parseAnswersRecord(value: unknown): Record<string, 'yes' | 'no'> | null {
  if (!isObject(value)) return null;
  const result: Record<string, 'yes' | 'no'> = {};
  for (const key of Object.keys(value)) {
    if (!isPlayerId(key)) return null;
    const v = value[key];
    if (v !== 'yes' && v !== 'no') return null;
    result[key] = v;
  }
  return result;
}

function parseQuestionRecord(value: unknown): QuestionRecord | null {
  if (!isObject(value) || !hasExactKeys(value, ['questionIndex', 'questionerId', 'cardId', 'question', 'answers'])) return null;
  if (!isNonNegativeInteger(value.questionIndex) || !isPlayerId(value.questionerId)) return null;
  if (typeof value.cardId !== 'string' || typeof value.question !== 'string') return null;
  const answers = parseAnswersRecord(value.answers);
  if (answers === null) return null;
  return {
    questionIndex: value.questionIndex as number,
    questionerId: value.questionerId,
    cardId: value.cardId,
    question: value.question,
    answers,
  };
}

function parseHistory(value: unknown): QuestionRecord[] | null {
  if (!Array.isArray(value)) return null;
  const list: QuestionRecord[] = [];
  for (const item of value) {
    const parsed = parseQuestionRecord(item);
    if (parsed === null) return null;
    list.push(parsed);
  }
  return list;
}

function parseCurrentQuestion(value: unknown): NightTestimonyPublicView['currentQuestion'] | null {
  if (value === null) return null;
  if (!isObject(value) || !hasExactKeys(value, ['questionIndex', 'questionerId', 'cardId', 'text', 'answers'])) return null;
  if (!isNonNegativeInteger(value.questionIndex) || !isPlayerId(value.questionerId)) return null;
  if (typeof value.cardId !== 'string' || typeof value.text !== 'string') return null;
  const answers = parseAnswersRecord(value.answers);
  if (answers === null) return null;
  return {
    questionIndex: value.questionIndex as number,
    questionerId: value.questionerId,
    cardId: value.cardId,
    text: value.text,
    answers,
  };
}

function parseReveal(value: unknown): NightTestimonyReveal | null {
  if (value === null) return null;
  if (!isObject(value) || !hasExactKeys(value, ['wardenId', 'crimes', 'history', 'extraCrime', 'accusedId', 'wardenRevealed', 'wardenGuesses', 'crimesAllGuessed'])) return null;
  if (!isPlayerId(value.wardenId) || !isBool(value.wardenRevealed) || !isBool(value.crimesAllGuessed)) return null;
  if (value.extraCrime !== null && !isCrime(value.extraCrime)) return null;
  if (value.accusedId !== null && !isPlayerId(value.accusedId)) return null;
  if (!isObject(value.crimes)) return null;
  const crimes: Record<string, CrimeId> = {};
  for (const key of Object.keys(value.crimes)) {
    if (!isCrime(value.crimes[key])) return null;
    crimes[key] = value.crimes[key];
  }
  const history = parseHistory(value.history);
  if (history === null) return null;
  let wardenGuesses: Record<string, CrimeId> | null = null;
  if (value.wardenGuesses !== null) {
    if (!isObject(value.wardenGuesses)) return null;
    wardenGuesses = {};
    for (const key of Object.keys(value.wardenGuesses)) {
      if (!isCrime(value.wardenGuesses[key])) return null;
      wardenGuesses[key] = value.wardenGuesses[key];
    }
  }
  return {
    wardenId: value.wardenId,
    crimes,
    history,
    extraCrime: value.extraCrime as CrimeId | null,
    accusedId: value.accusedId as string | null,
    wardenRevealed: value.wardenRevealed,
    wardenGuesses,
    crimesAllGuessed: value.crimesAllGuessed,
  };
}

function parseBase(view: Record<string, unknown>, withMe: boolean): NightTestimonyPublicView | null {
  if (!hasExactKeys(view, withMe ? [...PUBLIC_KEYS, 'me'] : PUBLIC_KEYS)) return null;
  if (view.gameId !== 'night-testimony' || view.rulesetId !== 'night_testimony_v1' || view.schemaVersion !== 1) return null;
  const phases: NightTestimonyPhase[] = ['question', 'deduction', 'vote', 'game_over'];
  if (typeof view.phase !== 'string' || !phases.includes(view.phase as NightTestimonyPhase)) return null;
  if (!isPlayerIds(view.players) || !isPlayerId(view.currentQuestionerId)) return null;
  if (!isNonNegativeInteger(view.questionIndex) || !isNonNegativeInteger(view.questionLimit) || !isNonNegativeInteger(view.maxYesPerPlayer)) return null;
  const history = parseHistory(view.history);
  if (history === null) return null;
  if (!isObject(view.playerYesCounts) || !isObject(view.revealedIdentities)) return null;
  const playerYesCounts: Record<string, number> = {};
  for (const k of Object.keys(view.playerYesCounts)) {
    if (!isNonNegativeInteger(view.playerYesCounts[k])) return null;
    playerYesCounts[k] = view.playerYesCounts[k];
  }
  const revealedIdentities: Record<string, CrimeId | 'warden'> = {};
  for (const k of Object.keys(view.revealedIdentities)) {
    const v = view.revealedIdentities[k];
    if (v !== 'warden' && !isCrime(v)) return null;
    revealedIdentities[k] = v;
  }
  const currentQuestion = parseCurrentQuestion(view.currentQuestion);
  if (currentQuestion === null && view.currentQuestion !== null) return null;
  if (view.extraCrime !== null && !isCrime(view.extraCrime)) return null;
  let availableGuessCrimes: CrimeId[] | null = null;
  if (view.availableGuessCrimes !== null) {
    if (!Array.isArray(view.availableGuessCrimes) || !view.availableGuessCrimes.every(isCrime)) return null;
    availableGuessCrimes = [...view.availableGuessCrimes];
  }
  if (view.accusedId !== null && !isPlayerId(view.accusedId)) return null;
  if (view.wardenRevealed !== null && !isBool(view.wardenRevealed)) return null;
  if (!isPlayerIds(view.votedPlayerIds) || !isBool(view.guessingInProgress) || !isPlayerIds(view.winners)) return null;
  const reveal = parseReveal(view.reveal);
  if (reveal === null && view.reveal !== null) return null;
  if (view.deadlineAt !== null && typeof view.deadlineAt !== 'number') return null;

  return {
    gameId: 'night-testimony',
    rulesetId: 'night_testimony_v1',
    schemaVersion: 1,
    phase: view.phase as NightTestimonyPhase,
    players: [...view.players],
    currentQuestionerId: view.currentQuestionerId as string,
    questionIndex: view.questionIndex as number,
    questionLimit: view.questionLimit as number,
    maxYesPerPlayer: view.maxYesPerPlayer as number,
    history,
    playerYesCounts,
    currentQuestion,
    revealedIdentities,
    extraCrime: view.extraCrime as CrimeId | null,
    availableGuessCrimes,
    votedPlayerIds: [...view.votedPlayerIds],
    accusedId: view.accusedId as string | null,
    wardenRevealed: view.wardenRevealed as boolean | null,
    guessingInProgress: view.guessingInProgress as boolean,
    winners: [...view.winners],
    deadlineAt: view.deadlineAt as number | null,
    reveal,
  };
}

function parseQuestionCards(value: unknown): QuestionCardView[] | null {
  if (value === null) return null;
  if (!Array.isArray(value)) return null;
  const list: QuestionCardView[] = [];
  for (const item of value) {
    if (!isObject(item)) return null;
    if (typeof item.id !== 'string' || typeof item.text !== 'string' || typeof item.category !== 'string' || typeof item.categoryLabel !== 'string') return null;
    list.push({
      id: item.id,
      text: item.text,
      category: item.category as QuestionCardView['category'],
      categoryLabel: item.categoryLabel,
    });
  }
  return list;
}

function parseMe(value: unknown): NightTestimonyPlayerView['me'] {
  if (value === null) return null;
  if (!isObject(value) || !hasExactKeys(value, ME_KEYS) || !isPlayerId(value.playerId)) return null;
  if (!isBool(value.isWarden) || !isNonNegativeInteger(value.myYesCount) || !isBool(value.hasAnsweredCurrent) || !isBool(value.hasVoted)) return null;
  if (value.crime !== null && !isCrime(value.crime)) return null;
  const pendingCardChoices = parseQuestionCards(value.pendingCardChoices);
  if (pendingCardChoices === null && value.pendingCardChoices !== null) return null;

  return {
    playerId: value.playerId,
    isWarden: value.isWarden,
    crime: value.crime as CrimeId | null,
    myYesCount: value.myYesCount as number,
    hasAnsweredCurrent: value.hasAnsweredCurrent as boolean,
    hasVoted: value.hasVoted,
    pendingCardChoices,
  };
}

export function parseNightTestimonyView(
  view: unknown,
  role: 'player' | 'spectator',
): NightTestimonyPlayerView | NightTestimonyPublicView | null {
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
