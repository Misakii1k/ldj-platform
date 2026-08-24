export interface TopicCard {
  id: string;
  text: string;
  category: 'life' | 'imagination' | 'emotion' | 'weird' | 'philosophy' | 'social';
  categoryLabel: string;
}

export const TOPIC_DECK: readonly TopicCard[] = [
  {
    id: 'ej_t01',
    text: '分享一件你曾做过最冲动或至今想起来仍然觉得奇妙的决定。',
    category: 'life',
    categoryLabel: '生活经历',
  },
  {
    id: 'ej_t02',
    text: '如果明天醒来你拥有了一种超能力，你最希望它是什么，你会用它做什么？',
    category: 'imagination',
    categoryLabel: '奇思妙想',
  },
  {
    id: 'ej_t03',
    text: '童年时期你最害怕、但现在觉得荒诞好笑的一件事或一个物品是什么？',
    category: 'emotion',
    categoryLabel: '情感记忆',
  },
  {
    id: 'ej_t04',
    text: '如果世界末日还有最后 24 小时，你会如何度过这最后的时光？',
    category: 'weird',
    categoryLabel: '怪诞假设',
  },
  {
    id: 'ej_t05',
    text: '在你经历过的旅行中，哪一个瞬间或场景最让你难以忘怀？',
    category: 'life',
    categoryLabel: '生活经历',
  },
  {
    id: 'ej_t06',
    text: '你认为在人际交往中，最难以容忍的一种行为或性格特征是什么？',
    category: 'social',
    categoryLabel: '社交人际',
  },
  {
    id: 'ej_t07',
    text: '如果可以和历史上任何一个已故的名人共进晚餐，你会选择谁，想聊些什么？',
    category: 'imagination',
    categoryLabel: '奇思妙想',
  },
  {
    id: 'ej_t08',
    text: '在你的日常生活中，有没有什么特别奇怪但你一直坚持的小习惯？',
    category: 'weird',
    categoryLabel: '怪诞假设',
  },
  {
    id: 'ej_t09',
    text: '回想过去五年，你身上发生的最大改变是什么？',
    category: 'philosophy',
    categoryLabel: '灵魂拷问',
  },
  {
    id: 'ej_t10',
    text: '如果可以选择隐居在一个无人打扰的地方生活一年，你会选择哪里？',
    category: 'imagination',
    categoryLabel: '奇思妙想',
  },
  {
    id: 'ej_t11',
    text: '你吃过的最难忘的一顿饭是在哪里、和谁一起吃的？',
    category: 'life',
    categoryLabel: '生活经历',
  },
  {
    id: 'ej_t12',
    text: '当你心情极度低落时，什么事情或安慰最能让你重新振作起来？',
    category: 'emotion',
    categoryLabel: '情感记忆',
  },
  {
    id: 'ej_t13',
    text: '如果你突然获得了一笔无法被任何人知道的千万巨款，你第一件想买的是什么？',
    category: 'imagination',
    categoryLabel: '奇思妙想',
  },
  {
    id: 'ej_t14',
    text: '你曾经撒过最成功或者最让你啼笑皆非的一个谎言是什么？',
    category: 'social',
    categoryLabel: '社交人际',
  },
  {
    id: 'ej_t15',
    text: '如果可以随意修改现实世界的一条自然物理定律，你最想改动什么？',
    category: 'weird',
    categoryLabel: '怪诞假设',
  },
  {
    id: 'ej_t16',
    text: '你最喜欢的季节或天气是什么？在这个天气里你最喜欢做什么？',
    category: 'life',
    categoryLabel: '生活经历',
  },
  {
    id: 'ej_t17',
    text: '分享一个你曾经深信不疑、长大后才发现完全是假象的常识或传说。',
    category: 'emotion',
    categoryLabel: '情感记忆',
  },
  {
    id: 'ej_t18',
    text: '如果人类不再需要睡眠，你打算把每天多出来的 8 小时用来做什么？',
    category: 'imagination',
    categoryLabel: '奇思妙想',
  },
  {
    id: 'ej_t19',
    text: '在你的朋友或家人眼里，你最标志性的口头禅或小动作是什么？',
    category: 'social',
    categoryLabel: '社交人际',
  },
  {
    id: 'ej_t20',
    text: '如果你被困在一个神秘荒岛上，只允许带三样随身物品，你会带什么？',
    category: 'weird',
    categoryLabel: '怪诞假设',
  },
  {
    id: 'ej_t21',
    text: '你认为一个人真正走向成熟的标志是什么事件或心态转变？',
    category: 'philosophy',
    categoryLabel: '灵魂拷问',
  },
  {
    id: 'ej_t22',
    text: '如果能够穿越时空回到十年前，你最想对十年前的自己说一句什么话？',
    category: 'emotion',
    categoryLabel: '情感记忆',
  },
  {
    id: 'ej_t23',
    text: '在你看过的电影或读过的书中，哪一个反派角色最让你印象深刻甚至产生共情？',
    category: 'imagination',
    categoryLabel: '奇思妙想',
  },
  {
    id: 'ej_t24',
    text: '你曾经历过最尴尬、恨不得当场找地缝钻进去的场面是什么？',
    category: 'life',
    categoryLabel: '生活经历',
  },
  {
    id: 'ej_t25',
    text: '如果动物都可以开口说话，你最想和哪种动物深入长谈一次？',
    category: 'weird',
    categoryLabel: '怪诞假设',
  },
  {
    id: 'ej_t26',
    text: '如果只能保留一段人生最幸福的记忆，你会选择哪一天的哪一个场景？',
    category: 'emotion',
    categoryLabel: '情感记忆',
  },
  {
    id: 'ej_t27',
    text: '你觉得在这个世界上，金钱买不到但又至关重要的东西是什么？',
    category: 'philosophy',
    categoryLabel: '灵魂拷问',
  },
  {
    id: 'ej_t28',
    text: '如果未来人工智能完全接管了所有人类劳动，你希望自己以什么身份生活？',
    category: 'imagination',
    categoryLabel: '奇思妙想',
  },
  {
    id: 'ej_t29',
    text: '你经历过最奇特、最匪夷所思或者让你吓醒的梦境是什么？',
    category: 'weird',
    categoryLabel: '怪诞假设',
  },
  {
    id: 'ej_t30',
    text: '在面对重大人生十字路口时，你通常是依赖理性逻辑还是直觉冲动？',
    category: 'philosophy',
    categoryLabel: '灵魂拷问',
  },
  {
    id: 'ej_t31',
    text: '你最敬佩身边某位朋友身上的哪一种特质或能力？',
    category: 'social',
    categoryLabel: '社交人际',
  },
  {
    id: 'ej_t32',
    text: '如果要为你至今的人生写一本自传，你会给它取一个什么样富有深意的书名？',
    category: 'emotion',
    categoryLabel: '情感记忆',
  },
  {
    id: 'ej_t33',
    text: '如果突然让你去一所外星球大学任教一年，你最想给外星人讲授什么课程？',
    category: 'weird',
    categoryLabel: '怪诞假设',
  },
  {
    id: 'ej_t34',
    text: '你在生活中有没有尝试过某种看似奇葩但意外美味的食物搭配？',
    category: 'life',
    categoryLabel: '生活经历',
  },
  {
    id: 'ej_t35',
    text: '如果可以消除人类身上的一种负面情绪或生理缺陷，你最想消除什么？',
    category: 'philosophy',
    categoryLabel: '灵魂拷问',
  },
  {
    id: 'ej_t36',
    text: '当你独处一整天且没有任何电子屏幕时，你会如何安排自己的这一天？',
    category: 'life',
    categoryLabel: '生活经历',
  },
] as const;

export interface EchoRandomDeck {
  nextInt(minInclusive: number, maxExclusive: number): number;
  shuffle<T>(items: readonly T[]): T[];
}

export function drawThreeTopicCards(
  pool: readonly TopicCard[],
  usedCardIds: readonly string[],
  random: EchoRandomDeck,
): TopicCard[] {
  const unused = pool.filter((c) => !usedCardIds.includes(c.id));
  const available = unused.length >= 3 ? unused : pool;
  const shuffled = random.shuffle(available);
  return shuffled.slice(0, 3);
}
