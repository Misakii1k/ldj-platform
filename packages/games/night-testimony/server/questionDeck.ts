import type { CrimeId } from './types.ts';

export interface QuestionCard {
  id: string;
  text: string;
  category: 'motive' | 'method' | 'time' | 'scene' | 'property' | 'personnel';
  categoryLabel: string;
  associatedCrimes: readonly CrimeId[];
}

export const QUESTION_DECK: readonly QuestionCard[] = [
  {
    id: 'nt_q01',
    text: '作案现场是否有火烧或焦黑痕迹？',
    category: 'scene',
    categoryLabel: '现场痕迹',
    associatedCrimes: ['arson'],
  },
  {
    id: 'nt_q02',
    text: '作案是否发生在深夜黑暗或无人时？',
    category: 'time',
    categoryLabel: '作案时间',
    associatedCrimes: ['arson', 'theft', 'grave_robbery', 'noise_nuisance', 'public_urination'],
  },
  {
    id: 'nt_q03',
    text: '你是否直接盗取了他人的实体物品？',
    category: 'property',
    categoryLabel: '财物涉及',
    associatedCrimes: ['theft', 'pickpocket', 'bike_theft', 'office_theft', 'museum_heist'],
  },
  {
    id: 'nt_q04',
    text: '你是否使用了假证件、假公章或伪造文件？',
    category: 'method',
    categoryLabel: '作案手段',
    associatedCrimes: ['forgery', 'fraud', 'transnational_crime', 'impersonation'],
  },
  {
    id: 'nt_q05',
    text: '作案是否需要跨国运输或秘密出入境？',
    category: 'scene',
    categoryLabel: '现场痕迹',
    associatedCrimes: ['smuggling', 'transnational_crime', 'arms_trafficking', 'sea_pirate'],
  },
  {
    id: 'nt_q06',
    text: '你是否将受害人关押在秘密地点限制人身？',
    category: 'personnel',
    categoryLabel: '受害接触',
    associatedCrimes: ['kidnap', 'pyramid_scheme', 'sea_pirate'],
  },
  {
    id: 'nt_q07',
    text: '作案是否使用了打火机、汽油或易燃物？',
    category: 'method',
    categoryLabel: '作案手段',
    associatedCrimes: ['arson', 'public_smoking'],
  },
  {
    id: 'nt_q08',
    text: '你是否通过谎言诱导对方转账或投钱？',
    category: 'method',
    categoryLabel: '作案手段',
    associatedCrimes: ['fraud', 'pyramid_scheme', 'blackmail'],
  },
  {
    id: 'nt_q09',
    text: '作案时是否与受害者或路人面对面直接接触？',
    category: 'personnel',
    categoryLabel: '受害接触',
    associatedCrimes: ['kidnap', 'pickpocket', 'line_cutting', 'dine_and_dash', 'pyramid_scheme', 'impersonation'],
  },
  {
    id: 'nt_q10',
    text: '你是否撬开过门锁、保险柜或防盗栏？',
    category: 'method',
    categoryLabel: '作案手段',
    associatedCrimes: ['theft', 'museum_heist', 'prison_break', 'bike_theft'],
  },
  {
    id: 'nt_q11',
    text: '你是否倒卖过黑市货物、门票或出土文物？',
    category: 'property',
    categoryLabel: '财物涉及',
    associatedCrimes: ['smuggling', 'scalping', 'grave_robbery', 'arms_trafficking', 'poaching'],
  },
  {
    id: 'nt_q12',
    text: '你是否向他人索要过巨额赎金或封口费？',
    category: 'motive',
    categoryLabel: '作案动机',
    associatedCrimes: ['kidnap', 'blackmail', 'sea_pirate'],
  },
  {
    id: 'nt_q13',
    text: '作案是否需要精湛的画作、印章或印刷技术？',
    category: 'method',
    categoryLabel: '作案手段',
    associatedCrimes: ['forgery', 'counterfeiter', 'graffiti'],
  },
  {
    id: 'nt_q14',
    text: '现场是否留下了大片灰烬、浓烟或刺鼻异味？',
    category: 'scene',
    categoryLabel: '现场痕迹',
    associatedCrimes: ['arson', 'public_smoking', 'public_urination'],
  },
  {
    id: 'nt_q15',
    text: '受害人是否过了数日甚至更久才察觉被盗？',
    category: 'time',
    categoryLabel: '作案时间',
    associatedCrimes: ['theft', 'forgery', 'fraud', 'office_theft', 'wifi_leeching'],
  },
  {
    id: 'nt_q16',
    text: '作案是否涉及合同、支票、名画或假钞？',
    category: 'property',
    categoryLabel: '财物涉及',
    associatedCrimes: ['forgery', 'fraud', 'museum_heist', 'counterfeiter'],
  },
  {
    id: 'nt_q17',
    text: '作案是否借助了集装箱、货轮或大卡车？',
    category: 'method',
    categoryLabel: '作案手段',
    associatedCrimes: ['smuggling', 'transnational_crime', 'arms_trafficking', 'sea_pirate'],
  },
  {
    id: 'nt_q18',
    text: '作案时是否刻意避开了所有活人的视线？',
    category: 'personnel',
    categoryLabel: '受害接触',
    associatedCrimes: ['arson', 'theft', 'hacker', 'wifi_leeching', 'grave_robbery', 'office_theft'],
  },
  {
    id: 'nt_q19',
    text: '受害人是否曾误以为你是朋友、同事或客户？',
    category: 'motive',
    categoryLabel: '作案动机',
    associatedCrimes: ['fraud', 'pyramid_scheme', 'office_theft', 'blackmail'],
  },
  {
    id: 'nt_q20',
    text: '你的罪行是否造成人身拘禁或精神控制？',
    category: 'personnel',
    categoryLabel: '受害接触',
    associatedCrimes: ['kidnap', 'pyramid_scheme'],
  },
  {
    id: 'nt_q21',
    text: '是否涉及海关严查的违禁品或珍稀动植物？',
    category: 'property',
    categoryLabel: '财物涉及',
    associatedCrimes: ['smuggling', 'arms_trafficking', 'poaching'],
  },
  {
    id: 'nt_q22',
    text: '作案时是否戴了手套或抹除了现场指纹？',
    category: 'scene',
    categoryLabel: '现场痕迹',
    associatedCrimes: ['theft', 'arson', 'museum_heist', 'grave_robbery', 'poisoning'],
  },
  {
    id: 'nt_q23',
    text: '你是否伪造过军警制服、官方授权或公章？',
    category: 'method',
    categoryLabel: '作案手段',
    associatedCrimes: ['forgery', 'fraud', 'impersonation'],
  },
  {
    id: 'nt_q24',
    text: '你的罪行是否损毁了房屋、墙面或公共设施？',
    category: 'scene',
    categoryLabel: '现场痕迹',
    associatedCrimes: ['arson', 'graffiti', 'noise_nuisance', 'prison_break'],
  },
  {
    id: 'nt_q25',
    text: '作案工具中是否包含绳索、胶带或捕兽夹？',
    category: 'method',
    categoryLabel: '作案手段',
    associatedCrimes: ['kidnap', 'poaching', 'sea_pirate'],
  },
  {
    id: 'nt_q26',
    text: '犯罪收益是否通过离岸账户或虚拟币洗白？',
    category: 'property',
    categoryLabel: '财物涉及',
    associatedCrimes: ['money_laundering', 'transnational_crime', 'hacker', 'fraud'],
  },
  {
    id: 'nt_q27',
    text: '作案是否在大白天、众目睽睽之下进行？',
    category: 'time',
    categoryLabel: '作案时间',
    associatedCrimes: ['line_cutting', 'public_smoking', 'scalping', 'dine_and_dash', 'impersonation'],
  },
  {
    id: 'nt_q28',
    text: '作案时是否随身携带了撬棍、扳手或剪线钳？',
    category: 'method',
    categoryLabel: '作案手段',
    associatedCrimes: ['theft', 'bike_theft', 'prison_break'],
  },
  {
    id: 'nt_q29',
    text: '你是否为了逃避关税或税款而倒运物资？',
    category: 'motive',
    categoryLabel: '作案动机',
    associatedCrimes: ['smuggling', 'transnational_crime', 'money_laundering'],
  },
  {
    id: 'nt_q30',
    text: '受害人是否在签署协议或听课时落入圈套？',
    category: 'method',
    categoryLabel: '作案手段',
    associatedCrimes: ['fraud', 'forgery', 'pyramid_scheme'],
  },
  {
    id: 'nt_q31',
    text: '你是否使用了电脑、代码脚本或抢购外挂？',
    category: 'method',
    categoryLabel: '作案手段',
    associatedCrimes: ['hacker', 'wifi_leeching', 'scalp_bot', 'water_army', 'espionage'],
  },
  {
    id: 'nt_q32',
    text: '你的罪行是否属于日常生活中的微小不文明行为？',
    category: 'motive',
    categoryLabel: '作案动机',
    associatedCrimes: ['littering', 'public_urination', 'noise_nuisance', 'line_cutting', 'public_smoking', 'spoilers', 'office_theft'],
  },
  {
    id: 'nt_q33',
    text: '作案现场是否散发出液体污渍或刺鼻臭味？',
    category: 'scene',
    categoryLabel: '现场痕迹',
    associatedCrimes: ['public_urination', 'littering', 'public_smoking', 'poisoning'],
  },
  {
    id: 'nt_q34',
    text: '你是否在公共交通、排队或电梯中制造过麻烦？',
    category: 'scene',
    categoryLabel: '现场痕迹',
    associatedCrimes: ['pickpocket', 'line_cutting', 'public_smoking', 'noise_nuisance'],
  },
  {
    id: 'nt_q35',
    text: '你的罪行是否惊动了国际刑警、特警或海警？',
    category: 'personnel',
    categoryLabel: '受害接触',
    associatedCrimes: ['transnational_crime', 'sea_pirate', 'arms_trafficking', 'museum_heist', 'prison_break'],
  },
  {
    id: 'nt_q36',
    text: '你是否偷吃过别人的午餐或偷喝过冰箱奶茶？',
    category: 'property',
    categoryLabel: '财物涉及',
    associatedCrimes: ['office_theft'],
  },
  {
    id: 'nt_q37',
    text: '你是否在电影或小说上映时恶意剧透关键剧情？',
    category: 'personnel',
    categoryLabel: '受害接触',
    associatedCrimes: ['spoilers'],
  },
  {
    id: 'nt_q38',
    text: '你是否破解蹭用过邻居的无线 WiFi 网络？',
    category: 'method',
    categoryLabel: '作案手段',
    associatedCrimes: ['wifi_leeching'],
  },
  {
    id: 'nt_q39',
    text: '你是否在景区石碑、电线杆或墙面涂鸦刻字？',
    category: 'scene',
    categoryLabel: '现场痕迹',
    associatedCrimes: ['graffiti'],
  },
  {
    id: 'nt_q40',
    text: '你是否穿戴过假军装假警服冒充执法人员？',
    category: 'method',
    categoryLabel: '作案手段',
    associatedCrimes: ['impersonation'],
  },
] as const;

export interface TestimonyRandomDeck {
  nextInt(minInclusive: number, maxExclusive: number): number;
  shuffle<T>(items: readonly T[]): T[];
}

export function drawThreeQuestionCards(
  pool: readonly QuestionCard[],
  usedCardIds: readonly string[],
  random: TestimonyRandomDeck,
): QuestionCard[] {
  const unused = pool.filter((c) => !usedCardIds.includes(c.id));
  const available = unused.length >= 3 ? unused : pool;
  const shuffled = random.shuffle(available);
  return shuffled.slice(0, 3);
}
