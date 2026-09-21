import { createHash } from 'node:crypto';
import type { GameContext, RandomSource } from '@ldj/shared';
import type {
  WitsWagersState,
  WitsWagersConfig,
  WitsWagersResolvedConfig,
  Question,
  BetPair,
} from './types.ts';

export const DEFAULT_RESOLVED_CONFIG: WitsWagersResolvedConfig = {
  answerSeconds: 30,
  betSeconds: 30,
  arrangingSeconds: 6,
  settlementSeconds: 11,
};

export const SAMPLE_TEST_QUESTIONS: Question[] = [
  {
    id: 'ww-test-01',
    prompt: '长江的总长度约为多少千米？',
    unit: '千米',
    answer: 6300,
    sourceUrl: 'https://zh.wikipedia.org/wiki/%E9%95%BF%E6%B1%9F',
    sourceNote: '中国官方地理普查标准数据',
    asOf: '2024',
    explanation: '长江发源于青藏高原唐古拉山脉，全长约6300千米。',
    reviewed: true,
  },
  {
    id: 'ww-test-02',
    prompt: '故宫紫禁城始建于公元哪一年？',
    unit: '年',
    answer: 1406,
    sourceUrl: 'https://www.dpm.org.cn',
    sourceNote: '故宫博物院官方沿革记录',
    asOf: '2024',
    explanation: '明成祖朱棣于永乐四年（1406年）开始营建北京紫禁城。',
    reviewed: true,
  },
  {
    id: 'ww-test-03',
    prompt: '珠穆朗玛峰在2020年中尼联合公布的雪面高程为多少米？',
    unit: '米',
    answer: 8848,
    sourceUrl: 'https://www.mnr.gov.cn',
    sourceNote: '自然资源部2020年珠峰高程测量公报',
    asOf: '2020',
    explanation: '2020年12月8日中尼联合宣布珠峰最新雪面高程为8848.86米（取整为8848）。',
    reviewed: true,
  },
  {
    id: 'ww-test-04',
    prompt: '国际空间站（ISS）环绕地球一周大约需要多少分钟？',
    unit: '分钟',
    answer: 92,
    sourceUrl: 'https://www.nasa.gov/mission_pages/station/main/index.html',
    sourceNote: 'NASA 国际空间站轨道飞行手册',
    asOf: '2024',
    explanation: '国际空间站在距地面约400公里的近地轨道运行，平均每90至93分钟绕地球一周。',
    reviewed: true,
  },
  {
    id: 'ww-test-05',
    prompt: '人类首次成功登月的阿波罗11号是在公历哪一年着陆月球的？',
    unit: '年',
    answer: 1969,
    sourceUrl: 'https://www.nasa.gov/apollo11',
    sourceNote: 'NASA 历史历史档案',
    asOf: '2024',
    explanation: '阿波罗11号登月舱于1969年7月20日降落在月球静海。',
    reviewed: true,
  },
  {
    id: 'ww-test-06',
    prompt: '标准成年人体内的骨骼数量一共有多少块？',
    unit: '块',
    answer: 206,
    sourceUrl: 'https://www.ncbi.nlm.nih.gov/books/NBK537199/',
    sourceNote: '医学解剖学教材标准数据',
    asOf: '2024',
    explanation: '成年人体正常有206块骨骼。',
    reviewed: true,
  },
  {
    id: 'ww-test-07',
    prompt: '世界一级方程式赛车（F1）正式大奖赛历史上，每个赛季总分获得分站冠军计多少分（现行自2010年起）？',
    unit: '分',
    answer: 25,
    sourceUrl: 'https://www.fia.com',
    sourceNote: '国际汽联 Sporting Regulations',
    asOf: '2024',
    explanation: '自2010赛季起，F1大奖赛正赛第一名获得25个积分。',
    reviewed: true,
  },
];

export function defaultBetPair(): BetPair {
  return [
    { chipId: 'A', targetId: null, extraStake: 0 },
    { chipId: 'B', targetId: null, extraStake: 0 },
  ];
}

/**
 * 纯函数生成 SHA-256 轮次标签（02 §3）。
 * 由域标识、ctx.now、round 与 4 个 PRNG 抽样值哈希而成，只防旧动作串轮。
 */
export function generateRoundToken(
  round: number,
  now: number,
  random: RandomSource,
): string {
  const r1 = random.nextInt(0, 0x7fffffff);
  const r2 = random.nextInt(0, 0x7fffffff);
  const r3 = random.nextInt(0, 0x7fffffff);
  const r4 = random.nextInt(0, 0x7fffffff);
  const data = `wits-wagers:round:${round}:${now}:${r1}:${r2}:${r3}:${r4}`;
  return createHash('sha256').update(data).digest('hex').slice(0, 16);
}

export interface CreateStateOptions {
  ctx: GameContext;
  players: string[];
  config?: WitsWagersConfig;
  questions?: Question[];
}

/**
 * 辅助函数：根据选项或测试题库创建状态。
 */
export function createState(options: CreateStateOptions): WitsWagersState {
  const { ctx, players, config, questions } = options;

  if (players.length < 3 || players.length > 7) {
    throw new Error(`一智千金支持 3..7 名玩家，当前传入: ${players.length}`);
  }
  const uniquePlayers = new Set(players);
  if (uniquePlayers.size !== players.length) {
    throw new Error('玩家列表存在重复项');
  }

  const resolvedConfig: WitsWagersResolvedConfig = {
    answerSeconds: config?.answerSeconds ?? DEFAULT_RESOLVED_CONFIG.answerSeconds,
    betSeconds: config?.betSeconds ?? DEFAULT_RESOLVED_CONFIG.betSeconds,
    arrangingSeconds: config?.arrangingSeconds ?? DEFAULT_RESOLVED_CONFIG.arrangingSeconds,
    settlementSeconds: config?.settlementSeconds ?? DEFAULT_RESOLVED_CONFIG.settlementSeconds,
  };

  const pool = questions && questions.length >= 7 ? questions : SAMPLE_TEST_QUESTIONS;
  if (pool.length < 7) {
    throw new Error(`题库数量不足 7 题（当前: ${pool.length}）`);
  }

  // 从题库中按确定性随机洗牌抽取前 7 题
  const shuffled = ctx.random.shuffle(pool);
  const questionPlan = shuffled.slice(0, 7);

  const scores: Record<string, number> = {};
  const winningGuesses: Record<string, number> = {};
  const guesses: Record<string, null> = {};
  const guessRevisions: Record<string, number> = {};
  const bets: Record<string, BetPair> = {};
  const betRevisions: Record<string, number> = {};

  for (const pid of players) {
    scores[pid] = 0;
    winningGuesses[pid] = 0;
    guesses[pid] = null;
    guessRevisions[pid] = 0;
    bets[pid] = defaultBetPair();
    betRevisions[pid] = 0;
  }

  return {
    schemaVersion: 1,
    rulesetId: 'wits_wagers_platform_v1',
    config: resolvedConfig,
    phase: 'created',
    round: 0,
    phaseEpoch: 0,
    roundToken: '',
    deadlineAt: null,
    players: [...players],
    forfeitedIds: [],
    scores,
    winningGuesses,
    questionPlan,
    guesses,
    guessRevisions,
    bets,
    betRevisions,
    board: [],
    history: [],
    result: null,
  };
}

export function createInitialState(
  ctx: GameContext,
  players: string[],
  config: WitsWagersConfig,
): WitsWagersState {
  return createState({ ctx, players, config });
}
