import { useState, useEffect, useRef } from 'react';
import { useConnection } from '../../connection/useConnection.ts';
import { useGameAction, nameFor } from '../useGameAction.ts';
import { TabletopShell } from '../tabletop/TabletopShell.tsx';
import { GameIcon } from '../../shared-ui/GameIcon.tsx';
import { WheelPropView } from './WheelPropView.tsx';
import { ScoreboardPropView } from './ScoreboardPropView.tsx';
import { CardDeckEditorModal } from './CardDeckEditorModal.tsx';
import type {
  PartySandboxPlayerView,
  SandboxCard,
  SandboxProp,
  RevolverProp,
  DiceProp,
  BellProp,
  DeckProp,
  TimerProp,
  CoinProp,
  WheelProp,
  ScoreboardProp,
} from './types.ts';

interface Props {
  view: PartySandboxPlayerView;
}

// 8 大精选高人气聚会预设卡包与题库
const PRESET_TEMPLATES: Array<{
  id: string;
  name: string;
  icon: string;
  desc: string;
  prompt: string;
  reply: string;
  cards: SandboxCard[];
  propsKind: Array<'revolver' | 'dice' | 'bell' | 'timer' | 'coin' | 'wheel' | 'scoreboard'>;
}> = [
  {
    id: 'truth_dare',
    name: '💖 真心话大冒险（30题豪华版）',
    icon: '💖',
    desc: '聚会破冰首选！涵盖社死尴尬、情感秘密、搞笑整蛊与大胆才艺挑战！',
    prompt: '来一套适合朋友聚会的真心话大冒险卡牌',
    reply: '已为您准备好【真心话大冒险】豪华卡牌堆，并布置了抢答铃、幸运硬币与指名大转盘！',
    propsKind: ['bell', 'coin', 'wheel'],
    cards: [
      { id: 'td_1', title: '真心话', content: '分享你至今想起来仍觉得最社死的尴尬瞬间！', category: 'truth' },
      { id: 'td_2', title: '真心话', content: '现场选一位异性/同性，说出 Ta 最吸引你的一个优点。', category: 'truth' },
      { id: 'td_3', title: '真心话', content: '你最近一次撒谎是因为什么？对谁说的？', category: 'truth' },
      { id: 'td_4', title: '真心话', content: '如果世界上只剩在场这些人，你最想和谁流落荒岛？', category: 'truth' },
      { id: 'td_5', title: '真心话', content: '手机相册里最新的一张搞怪自拍给大家看一眼。', category: 'truth' },
      { id: 'td_6', title: '真心话', content: '你谈过最长的一段恋爱有多久？因为什么分手的？', category: 'truth' },
      { id: 'td_7', title: '真心话', content: '在场所有玩家中，第一印象和现在反差最大的是谁？', category: 'truth' },
      { id: 'td_8', title: '真心话', content: '你做过最叛逆、至今没敢告诉父母的事情是什么？', category: 'truth' },
      { id: 'td_9', title: '真心话', content: '如果能拥有一项超能力，你最想拥有什么？为什么？', category: 'truth' },
      { id: 'td_10', title: '真心话', content: '说出你最不能接受的另一半的一个生活习惯。', category: 'truth' },
      { id: 'td_11', title: '大冒险', content: '用最深情的语气，对着左手边第一位玩家朗诵一段天气预报！', category: 'dare' },
      { id: 'td_12', title: '大冒险', content: '双手托腮做可爱鬼脸，保持 10 秒并让全场拍照！', category: 'dare' },
      { id: 'td_13', title: '大冒险', content: '模仿一种动物的叫声和动作，直到全场猜出是什么动物！', category: 'dare' },
      { id: 'td_14', title: '大冒险', content: '做 5 个标准的深蹲，每做一个大喊一声“我很棒”！', category: 'dare' },
      { id: 'td_15', title: '大冒险', content: '给微信最近聊天的第三个人发一句“其实我是一只外星猫”。', category: 'dare' },
      { id: 'td_16', title: '大冒险', content: '闭上眼睛，由右手边玩家喂你吃一口面前的食物或饮料。', category: 'dare' },
      { id: 'td_17', title: '大冒险', content: '与在场任意一位玩家对视 15 秒，期间谁先笑谁接受额外惩罚！', category: 'dare' },
      { id: 'td_18', title: '大冒险', content: '现场展示一段你最拿手（或最搞笑）的才艺（唱歌/跳舞/绕口令）。', category: 'dare' },
      { id: 'td_19', title: '大冒险', content: '模仿一位大家都认识的名人或在场玩家说话，让大家猜是谁！', category: 'dare' },
      { id: 'td_20', title: '大冒险', content: '用额头顶着一罐饮料走 5 步不掉下来！', category: 'dare' },
    ],
  },
  {
    id: 'sea_turtle_soup',
    name: '🐢 海龟汤（经典 8 大推理奇案）',
    icon: '🐢',
    desc: '经典情景推理！一人扮演主持人读汤面，全员提问，主持人只能回答“是/否/无关”！',
    prompt: '准备一套海龟汤情景推理卡牌，带抢答铃和计时器',
    reply: '已为您装载【海龟汤精选题库】卡牌堆，并配有抢答铃与思考倒计时炸弹！由一名玩家发牌读题，大家开始提问吧！',
    propsKind: ['bell', 'timer', 'coin'],
    cards: [
      {
        id: 'soup_1',
        title: '案1：海龟汤',
        content: '【汤面】一个男人走进一家餐馆，点了一碗海龟汤。喝完后他走出餐馆自尽了。为什么？\n\n【汤底】他曾与伙伴在荒岛求生，伙伴临死前做肉汤骗他是海龟汤救了他。如今喝到真正的海龟汤，他才明白当年吃的其实是伙伴的肉。',
        category: '推理',
      },
      {
        id: 'soup_2',
        title: '案2：水草',
        content: '【汤面】有个男子和他女友去河边散步，女友掉进河里淹死了。多年后他回到河边，一个老人说这里从不长水草。男子听后跳河自尽了。为什么？\n\n【汤底】当年他曾跳下河救人，摸到一把水草以为没抓住而放弃，老人说从无水草，他意识到当年摸到的是女友的头发。',
        category: '推理',
      },
      {
        id: 'soup_3',
        title: '案3：暴风雪木屋',
        content: '【汤面】暴风雪夜，木屋里有三个人，一人睡着，一人看书，一人在削苹果。突然停电，削苹果的人杀了看书的人。为什么？\n\n【汤底】看书的人是盲人，在读盲文书；削苹果的人听不见翻书声以为停电大家都看不见，趁机动手，却不知盲人并不受光线影响。',
        category: '推理',
      },
      {
        id: 'soup_4',
        title: '案4：半根火柴',
        content: '【汤面】茫茫沙漠中，一个一丝不挂的男人死在地上，手里紧紧握着半根折断的火柴。为什么？\n\n【汤底】他们乘热气球遭遇下坠危机，扔掉所有物资和衣服后仍不够轻，全员抽火柴，抽到半根的人必须跳伞/跳下牺牲自己拯救其他人。',
        category: '推理',
      },
      {
        id: 'soup_5',
        title: '案5：跳水比赛',
        content: '【汤面】一个男人参加十米跳水比赛，跃下空中时全场突然断电，他痛苦地尖叫却无法挽回。为什么？\n\n【汤底】他是盲人跳水冠军，依靠场馆泳池放水的回声判断距离。断电时泳池正在换水，水早已放空，他坠入了水泥地面。',
        category: '推理',
      },
      {
        id: 'soup_6',
        title: '案6：牛吃草',
        content: '【汤面】悬崖边的一片草地，上面的草被吃得干干净净，旁边有一具摔下悬崖的牛尸体。为什么？\n\n【汤底】牛的主人用一根绳子把牛拴在悬崖边的木桩上。绳子磨断了，牛在低头贪吃草时不知不觉走过了悬崖边缘。',
        category: '推理',
      },
      {
        id: 'soup_7',
        title: '案7：红衣服',
        content: '【汤面】一个住在顶楼的女子穿着一身红衣服在电梯口等电梯，电梯打开后她尖叫着逃跑了。为什么？\n\n【汤底】电梯里的镜子映出了站在她背后跟着她的人，而她穿红衣是为了在镜子中更容易看到背后的动静。',
        category: '推理',
      },
      {
        id: 'soup_8',
        title: '案8：午夜收音机',
        content: '【汤面】深夜，守灯塔的人在收音机里听到一则新闻后，崩溃地关掉灯塔自尽了。为什么？\n\n【汤底】新闻播报一艘大型客轮撞上暗礁沉没，全船遇难，而原因正是他昨晚擅离职守忘记开启灯塔导航。',
        category: '推理',
      },
    ],
  },
  {
    id: 'king_game',
    name: '👑 国王游戏（20条高能令）',
    icon: '👑',
    desc: '抽中数字编号，国王随机发号施令，配合指名大转盘与筹码计分板！',
    prompt: '准备一套国王游戏的指令卡牌，以及指名大转盘和筹码计分板',
    reply: '已为您摆放【国王游戏指令卡】、指名大转盘与筹码计分板！抽到国王牌的玩家可随时宣读指令！',
    propsKind: ['wheel', 'scoreboard', 'coin'],
    cards: [
      { id: 'kg_1', title: '国王令', content: '指定 1 号与 2 号玩家背靠背站立，回答国王提问的 3 个默契问题！', category: '国王令' },
      { id: 'kg_2', title: '国王令', content: '3 号玩家向 4 号玩家深情单膝跪地，用一句话打动全场！', category: '国王令' },
      { id: 'kg_3', title: '国王令', content: '指定 1 位玩家在接下来的两轮游戏中，所有说话末尾必须加“喵~”！', category: '国王令' },
      { id: 'kg_4', title: '国王令', content: '全场最小编号的玩家，为最大编号的玩家倒一杯水并称呼“尊贵的客人”。', category: '国王令' },
      { id: 'kg_5', title: '国王令', content: '由国王转动大转盘，转到谁谁必须向在场所有人各说一句真诚夸赞！', category: '国王令' },
      { id: 'kg_6', title: '国王令', content: '2 号玩家与 3 号玩家猜拳，输的人做 10 次空气吉他弹奏！', category: '国王令' },
      { id: 'kg_7', title: '国王令', content: '由国王指定两名玩家，进行 30 秒的“眼神对决”，眨眼算输！', category: '国王令' },
      { id: 'kg_8', title: '国王令', content: '所有单数号玩家与所有双数号玩家进行绕口令接龙，卡顿者罚 10 筹码！', category: '国王令' },
    ],
  },
  {
    id: 'drinking_party',
    name: '🍺 酒桌狂欢（20条惩罚卡）',
    icon: '🍺',
    desc: '酒局聚会大杀器！涵盖罚酒指令、免罚金牌、全场干杯与趣味酒桌游戏！',
    prompt: '准备酒桌狂欢惩罚卡牌、骰盅与指名转盘',
    reply: '酒桌派对道具就绪！摇骰盅、指名转盘与罚酒卡牌已全部摆上牌桌！',
    propsKind: ['dice', 'wheel', 'bell', 'coin'],
    cards: [
      { id: 'dp_1', title: '罚酒令', content: '自罚一杯，或者说出一个在场没人知道的小秘密！', category: '酒桌' },
      { id: 'dp_2', title: '幸运卡', content: '【免罚金牌】保留此卡，可在后续任意一次惩罚时免除罚酒！', category: '酒桌' },
      { id: 'dp_3', title: '全员令', content: '全场干杯！大家一起喝半口为今晚的友谊干杯！', category: '酒桌' },
      { id: 'dp_4', title: '指定令', content: '指定任意一位玩家替你喝半杯，或者与 Ta 一起喝！', category: '酒桌' },
      { id: 'dp_5', title: '酒桌游戏', content: '【数 7 游戏】从你开始顺时针报数，逢 7 或 7 的倍数拍手过，谁失误谁喝！', category: '酒桌' },
      { id: 'dp_6', title: '酒桌游戏', content: '【我从来没有】说一件你从来没做过的事，在场做过的人各喝一口！', category: '酒桌' },
      { id: 'dp_7', title: '惩罚令', content: '右手边第一位玩家摇骰子，掷出几点你就喝几小口！', category: '酒桌' },
      { id: 'dp_8', title: '合照令', content: '举杯与在场全员拍摄一张搞怪干杯合影！', category: '酒桌' },
    ],
  },
  {
    id: 'dont_do_it',
    name: '🤫 不要做挑战（16张禁忌卡）',
    icon: '🤫',
    desc: '每人抽取一张微动作陷阱卡，戴在头上不自知，诱导他人犯规触发淘汰！',
    prompt: '来一套不要做挑战卡牌，配有抢答铃和定时器',
    reply: '已生成【不要做挑战】卡牌堆，发牌给每个人后可查看自己的禁忌动作！',
    propsKind: ['bell', 'timer', 'scoreboard'],
    cards: [
      { id: 'dd_1', title: '禁忌动作', content: '说出“你”或者“我”字', category: 'trap' },
      { id: 'dd_2', title: '禁忌动作', content: '摸自己的头发、脸颊或耳朵', category: 'trap' },
      { id: 'dd_3', title: '禁忌动作', content: '笑出声或露出牙齿', category: 'trap' },
      { id: 'dd_4', title: '禁忌动作', content: '拿起水杯喝水或托腮', category: 'trap' },
      { id: 'dd_5', title: '禁忌动作', content: '点头表示赞同或叹气', category: 'trap' },
      { id: 'dd_6', title: '禁忌动作', content: '看手机屏幕或看手表', category: 'trap' },
      { id: 'dd_7', title: '禁忌动作', content: '用手指指向在场任何人', category: 'trap' },
      { id: 'dd_8', title: '禁忌动作', content: '回答别人的任何反问句', category: 'trap' },
      { id: 'dd_9', title: '禁忌动作', content: '说出任何英语单词或字母', category: 'trap' },
      { id: 'dd_10', title: '禁忌动作', content: '双手交叉抱胸', category: 'trap' },
      { id: 'dd_11', title: '禁忌动作', content: '推眼镜或扶镜框', category: 'trap' },
      { id: 'dd_12', title: '禁忌动作', content: '说出“好”、“行”或“对”字', category: 'trap' },
    ],
  },
  {
    id: 'undercover_sandbox',
    name: '🕵️ 谁是卧底沙盒（自由词库）',
    icon: '🕵️',
    desc: '随时发牌给全员分发平民与卧底词语，配有抢答铃与投票倒计时！',
    prompt: '准备一套谁是卧底的词语卡牌堆和抢答铃',
    reply: '已装载【谁是卧底自由词库】，全员发牌后可抽取私密词语，开始发言推理吧！',
    propsKind: ['bell', 'timer', 'scoreboard'],
    cards: [
      { id: 'uc_1', title: '词组 1', content: '【平民词】：状元  |  【卧底词】：榜眼', category: '词库' },
      { id: 'uc_2', title: '词组 2', content: '【平民词】：牛奶  |  【卧底词】：豆浆', category: '词库' },
      { id: 'uc_3', title: '词组 3', content: '【平民词】：保安  |  【卧底词】：保镖', category: '词库' },
      { id: 'uc_4', title: '词组 4', content: '【平民词】：辣椒  |  【卧底词】：芥末', category: '词库' },
      { id: 'uc_5', title: '词组 5', content: '【平民词】：橙子  |  【卧底词】：橘子', category: '词库' },
      { id: 'uc_6', title: '词组 6', content: '【平民词】：吉他  |  【卧底词】：尤克里里', category: '词库' },
      { id: 'uc_7', title: '词组 7', content: '【平民词】：气球  |  【卧底词】：泡泡', category: '词库' },
      { id: 'uc_8', title: '词组 8', content: '【平民词】：面包  |  【卧底词】：蛋糕', category: '词库' },
    ],
  },
  {
    id: 'roulette_duel',
    name: '🔫 俄罗斯轮盘生死局',
    icon: '🔫',
    desc: '俄罗斯轮盘生死对决，1发实弹+5发空包，旋转转轮扣动扳机！',
    prompt: '准备一把装有1发实弹的左轮手枪和一个定时炸弹与幸运金币',
    reply: '左轮手枪已装填完毕并旋转弹巢！另外放置了 30 秒定时炸弹与幸运硬币，轮流扣动扳机吧！',
    propsKind: ['revolver', 'timer', 'coin', 'scoreboard'],
    cards: [],
  },
  {
    id: 'all_props',
    name: '🎡 全能聚会社交大乱斗（全套 8 种道具）',
    icon: '🎪',
    desc: '全套豪华道具：左轮手枪 + 摇骰盅 + 抢答铃 + 炸弹计时 + 幸运金币 + 指名大转盘 + 筹码计分板！',
    prompt: '把所有聚会道具都摆到桌面上',
    reply: '已为您将左轮手枪、摇骰盅、抢答铃、计时炸弹、幸运硬币、指名转盘与筹码计分板全部布置就绪！',
    propsKind: ['revolver', 'dice', 'bell', 'timer', 'coin', 'wheel', 'scoreboard'],
    cards: [],
  },
];

// 渲染真实圆角骨质骰子点数
function renderDicePips(val: number, diceType: 'd6' | 'd20') {
  if (diceType === 'd20') {
    return <span className="sandbox-dice-d20-text">{val}</span>;
  }

  const pipsMap: Record<number, number[]> = {
    1: [4],
    2: [0, 8],
    3: [0, 4, 8],
    4: [0, 2, 6, 8],
    5: [0, 2, 4, 6, 8],
    6: [0, 2, 3, 5, 6, 8],
  };

  const activePips = pipsMap[val] || [4];

  return (
    <div className={`sandbox-d6-face val-${val}`}>
      {Array.from({ length: 9 }).map((_, i) => (
        <span
          key={i}
          className={`sandbox-pip ${activePips.includes(i) ? 'is-active' : ''} ${
            val === 1 && i === 4 ? 'is-center-red' : ''
          }`}
        />
      ))}
    </div>
  );
}

export function PartySandboxGamePage({ view }: Props) {
  const { state } = useConnection();
  const members = state.room?.members ?? [];
  const { act, busy } = useGameAction();
  const myId = view.me?.playerId ?? null;

  // AI 助手面板与输入
  const [aiInput, setAiInput] = useState('');
  const [aiPanelOpen, setAiPanelOpen] = useState(false);

  // 自定义卡牌工坊编辑器
  const [cardEditorOpen, setCardEditorOpen] = useState(false);

  // 左轮设置弹窗
  const [revolverSetupOpen, setRevolverSetupOpen] = useState<string | null>(null);
  const [revolverLiveCount, setRevolverLiveCount] = useState(1);
  const [revolverChambers, setRevolverChambers] = useState(6);

  // 选中的手牌
  const [selectedHandCardId, setSelectedHandCardId] = useState<string | null>(null);

  // 骰盅私密查看状态
  const [peekDiceId, setPeekDiceId] = useState<string | null>(null);

  // 硬币翻转动画状态
  const [isFlippingCoin, setIsFlippingCoin] = useState(false);

  // 定时器本地 Tick 驱动
  useEffect(() => {
    const timers = Object.values(view.props).filter((p) => p.kind === 'timer' && p.isRunning) as TimerProp[];
    if (timers.length === 0) return;

    const interval = setInterval(() => {
      for (const t of timers) {
        if (myId) {
          void act({
            type: 'operate_timer',
            playerId: myId,
            propId: t.id,
            subAction: 'tick',
          });
        }
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [view.props, myId, act]);

  // 快捷生成预设
  const applyPreset = (preset: (typeof PRESET_TEMPLATES)[0]) => {
    if (!myId) return;

    const newProps: SandboxProp[] = [];
    if (preset.propsKind.includes('revolver')) {
      newProps.push({
        id: 'prop_revolver_1',
        kind: 'revolver',
        title: '左轮手枪 (1/6 实弹)',
        chambers: 6,
        currentChamber: 0,
        cylinder: ['live', 'blank', 'blank', 'blank', 'blank', 'blank'],
        lastAction: null,
      });
    }
    if (preset.propsKind.includes('dice')) {
      newProps.push({
        id: 'prop_dice_1',
        kind: 'dice',
        title: '摇骰盅',
        diceCount: 5,
        diceType: 'd6',
        values: [1, 2, 3, 4, 5],
        isCupCovered: false,
        lastRollBy: null,
        lastRollTimestamp: null,
      });
    }
    if (preset.propsKind.includes('bell')) {
      newProps.push({
        id: 'prop_bell_1',
        kind: 'bell',
        title: '抢答铃',
        rungBy: null,
        rungTimestamp: null,
        ringCount: 0,
      });
    }
    if (preset.propsKind.includes('timer')) {
      newProps.push({
        id: 'prop_timer_1',
        kind: 'timer',
        title: '定时炸弹',
        durationSeconds: 30,
        remainingSeconds: 30,
        isRunning: false,
        isExploded: false,
        startedBy: null,
        startedAt: null,
      });
    }
    if (preset.propsKind.includes('coin')) {
      newProps.push({
        id: 'prop_coin_1',
        kind: 'coin',
        title: '幸运硬币',
        lastFlipResult: null,
        flippedBy: null,
        flipTimestamp: null,
      });
    }
    if (preset.propsKind.includes('wheel')) {
      newProps.push({
        id: 'prop_wheel_1',
        kind: 'wheel',
        title: '指名大转盘',
        segments: [
          { label: '喝半杯', color: '#ef4444' },
          { label: '真心话', color: '#ec4899' },
          { label: '大冒险', color: '#8b5cf6' },
          { label: '指定他人喝', color: '#3b82f6' },
          { label: '全场干杯', color: '#10b981' },
          { label: '免罚幸运', color: '#f59e0b' },
        ],
        rotationAngle: 0,
        isSpinning: false,
        lastResult: null,
        spunBy: null,
        spinTimestamp: null,
      });
    }
    if (preset.propsKind.includes('scoreboard')) {
      const scores: Record<string, number> = {};
      for (const p of view.players) scores[p] = 100;
      newProps.push({
        id: 'prop_scoreboard_1',
        kind: 'scoreboard',
        title: '筹码计分板',
        currencyName: '筹码',
        scores,
      });
    }

    void act({
      type: 'ai_setup_table',
      playerId: myId,
      prompt: preset.prompt,
      reply: preset.reply,
      newProps: newProps.length > 0 ? newProps : undefined,
      replaceDeckCards:
        preset.cards.length > 0
          ? {
              deckId: 'prop_deck_1',
              title: preset.name,
              cards: preset.cards,
            }
          : undefined,
    });
    setAiPanelOpen(false);
  };

  // 自定义 AI 输入提交
  const handleAiSubmit = () => {
    if (!aiInput.trim() || !myId) return;
    const prompt = aiInput.trim();

    let reply = `已为您响应需求：“${prompt}”！`;
    const newProps: SandboxProp[] = [];

    if (prompt.includes('左轮') || prompt.includes('轮盘') || prompt.includes('枪')) {
      newProps.push({
        id: `revolver_${Date.now()}`,
        kind: 'revolver',
        title: '定制左轮手枪 (1/6 实弹)',
        chambers: 6,
        currentChamber: 0,
        cylinder: ['live', 'blank', 'blank', 'blank', 'blank', 'blank'],
        lastAction: null,
      });
      reply += ' 放置了左轮手枪；';
    }
    if (prompt.includes('骰') || prompt.includes('色')) {
      newProps.push({
        id: `dice_${Date.now()}`,
        kind: 'dice',
        title: '摇骰盅',
        diceCount: 5,
        diceType: 'd6',
        values: [1, 2, 3, 4, 5],
        isCupCovered: false,
        lastRollBy: null,
        lastRollTimestamp: null,
      });
      reply += ' 放置了摇骰盅；';
    }
    if (prompt.includes('铃') || prompt.includes('抢答')) {
      newProps.push({
        id: `bell_${Date.now()}`,
        kind: 'bell',
        title: '抢答铃',
        rungBy: null,
        rungTimestamp: null,
        ringCount: 0,
      });
      reply += ' 放置了抢答铃；';
    }
    if (prompt.includes('炸弹') || prompt.includes('计时') || prompt.includes('秒')) {
      newProps.push({
        id: `timer_${Date.now()}`,
        kind: 'timer',
        title: '定时炸弹',
        durationSeconds: 30,
        remainingSeconds: 30,
        isRunning: false,
        isExploded: false,
        startedBy: null,
        startedAt: null,
      });
      reply += ' 放置了定时炸弹；';
    }
    if (prompt.includes('币') || prompt.includes('硬币')) {
      newProps.push({
        id: `coin_${Date.now()}`,
        kind: 'coin',
        title: '幸运硬币',
        lastFlipResult: null,
        flippedBy: null,
        flipTimestamp: null,
      });
      reply += ' 放置了幸运硬币；';
    }
    if (prompt.includes('转盘') || prompt.includes('轮盘')) {
      newProps.push({
        id: `wheel_${Date.now()}`,
        kind: 'wheel',
        title: '指名大转盘',
        segments: [
          { label: '喝半杯', color: '#ef4444' },
          { label: '真心话', color: '#ec4899' },
          { label: '大冒险', color: '#8b5cf6' },
          { label: '免罚幸运', color: '#f59e0b' },
        ],
        rotationAngle: 0,
        isSpinning: false,
        lastResult: null,
        spunBy: null,
        spinTimestamp: null,
      });
      reply += ' 放置了指名大转盘；';
    }
    if (prompt.includes('筹码') || prompt.includes('计分') || prompt.includes('分')) {
      const scores: Record<string, number> = {};
      for (const p of view.players) scores[p] = 100;
      newProps.push({
        id: `scoreboard_${Date.now()}`,
        kind: 'scoreboard',
        title: '筹码计分板',
        currencyName: '筹码',
        scores,
      });
      reply += ' 放置了筹码计分板；';
    }

    if (newProps.length === 0) {
      newProps.push({
        id: `dice_${Date.now()}`,
        kind: 'dice',
        title: '摇骰盅',
        diceCount: 5,
        diceType: 'd6',
        values: [1, 2, 3, 4, 5],
        isCupCovered: false,
        lastRollBy: null,
        lastRollTimestamp: null,
      });
      newProps.push({
        id: `bell_${Date.now()}`,
        kind: 'bell',
        title: '抢答铃',
        rungBy: null,
        rungTimestamp: null,
        ringCount: 0,
      });
      reply += ' 为您摆放了基础聚会道具组！';
    }

    void act({
      type: 'ai_setup_table',
      playerId: myId,
      prompt,
      reply,
      newProps,
    });

    setAiInput('');
    setAiPanelOpen(false);
  };

  // 左轮重装弹确认
  const handleConfirmRevolverLoad = (propId: string) => {
    if (!myId) return;
    void act({
      type: 'operate_revolver',
      playerId: myId,
      propId,
      subAction: 'load',
      chambers: revolverChambers,
      liveCount: revolverLiveCount,
    });
    setRevolverSetupOpen(null);
  };

  // 保存卡牌工坊编辑并部署
  const handleDeployCustomDeck = (title: string, cards: SandboxCard[]) => {
    if (!myId) return;
    const existingDeck = Object.values(view.props).find((p) => p.kind === 'deck');
    const deckId = existingDeck ? existingDeck.id : `prop_deck_${Date.now()}`;

    if (existingDeck) {
      void act({
        type: 'operate_deck',
        playerId: myId,
        propId: deckId,
        subAction: 'load_cards',
        title,
        cards,
      });
    } else {
      void act({
        type: 'spawn_prop',
        playerId: myId,
        prop: {
          id: deckId,
          kind: 'deck',
          title,
          drawPile: cards,
          discardPile: [],
          tableCards: [],
        },
      });
    }
  };

  // 抛硬币带 3D 动画
  const handleFlipCoin = (propId: string) => {
    if (!myId || isFlippingCoin) return;
    setIsFlippingCoin(true);
    setTimeout(() => {
      void act({
        type: 'operate_coin',
        playerId: myId,
        propId,
        subAction: 'flip',
      });
      setIsFlippingCoin(false);
    }, 600);
  };

  // 手牌打出
  const handlePlayHandCard = (cardId: string, isPublic: boolean) => {
    if (!myId) return;
    const deck = Object.values(view.props).find((p) => p.kind === 'deck');
    if (!deck) return;

    void act({
      type: 'operate_deck',
      playerId: myId,
      propId: deck.id,
      subAction: 'play_hand',
      cardId,
      isPublic,
    });
    setSelectedHandCardId(null);
  };

  const tablePlayers = view.players.map((p) => ({
    id: p,
    name: nameFor(members, p),
    status: p === myId ? '我' : '在线',
    active: true,
  }));

  return (
    <TabletopShell
      gameId="party-sandbox"
      title="创意工坊"
      phase="自由沙盒"
      players={tablePlayers}
    >
      <div className="sandbox-arena">
        {/* 顶部控制栏：AI 助手入口、预设选择、自定义卡牌工坊、清空桌面 */}
        <div className="sandbox-top-bar">
          <button
            type="button"
            className="sandbox-top-btn sandbox-top-btn--ai"
            onClick={() => setAiPanelOpen(true)}
          >
            <span className="sandbox-top-btn__icon">🤖</span>
            <span>AI 小助手「锵锵」</span>
          </button>

          <button
            type="button"
            className="sandbox-top-btn sandbox-top-btn--editor"
            onClick={() => setCardEditorOpen(true)}
          >
            <GameIcon name="cards_deck" size={16} style={{ marginRight: '4px' }} />
            <span>自制卡牌工坊…</span>
          </button>

          <div className="sandbox-top-bar__divider" />

          {/* 快捷增减道具入口 */}
          <div className="sandbox-add-prop-group">
            <button
              type="button"
              className="sandbox-mini-add-btn"
              title="添加左轮手枪"
              onClick={() =>
                myId &&
                act({
                  type: 'spawn_prop',
                  playerId: myId,
                  prop: {
                    id: `revolver_${Date.now()}`,
                    kind: 'revolver',
                    title: '左轮手枪 (1/6 实弹)',
                    chambers: 6,
                    currentChamber: 0,
                    cylinder: ['live', 'blank', 'blank', 'blank', 'blank', 'blank'],
                    lastAction: null,
                  },
                })
              }
            >
              🔫 左轮
            </button>
            <button
              type="button"
              className="sandbox-mini-add-btn"
              title="添加摇骰盅"
              onClick={() =>
                myId &&
                act({
                  type: 'spawn_prop',
                  playerId: myId,
                  prop: {
                    id: `dice_${Date.now()}`,
                    kind: 'dice',
                    title: '摇骰盅',
                    diceCount: 5,
                    diceType: 'd6',
                    values: [1, 2, 3, 4, 5],
                    isCupCovered: false,
                    lastRollBy: null,
                    lastRollTimestamp: null,
                  },
                })
              }
            >
              🎲 骰盅
            </button>
            <button
              type="button"
              className="sandbox-mini-add-btn"
              title="添加抢答铃"
              onClick={() =>
                myId &&
                act({
                  type: 'spawn_prop',
                  playerId: myId,
                  prop: {
                    id: `bell_${Date.now()}`,
                    kind: 'bell',
                    title: '抢答铃',
                    rungBy: null,
                    rungTimestamp: null,
                    ringCount: 0,
                  },
                })
              }
            >
              🔔 抢答铃
            </button>
            <button
              type="button"
              className="sandbox-mini-add-btn"
              title="添加指名大转盘"
              onClick={() =>
                myId &&
                act({
                  type: 'spawn_prop',
                  playerId: myId,
                  prop: {
                    id: `wheel_${Date.now()}`,
                    kind: 'wheel',
                    title: '指名大转盘',
                    segments: [
                      { label: '喝半杯', color: '#ef4444' },
                      { label: '真心话', color: '#ec4899' },
                      { label: '大冒险', color: '#8b5cf6' },
                      { label: '免罚幸运', color: '#f59e0b' },
                    ],
                    rotationAngle: 0,
                    isSpinning: false,
                    lastResult: null,
                    spunBy: null,
                    spinTimestamp: null,
                  },
                })
              }
            >
              🎡 大转盘
            </button>
            <button
              type="button"
              className="sandbox-mini-add-btn"
              title="添加筹码计分板"
              onClick={() => {
                if (!myId) return;
                const scores: Record<string, number> = {};
                for (const p of view.players) scores[p] = 100;
                act({
                  type: 'spawn_prop',
                  playerId: myId,
                  prop: {
                    id: `scoreboard_${Date.now()}`,
                    kind: 'scoreboard',
                    title: '筹码计分板',
                    currencyName: '筹码',
                    scores,
                  },
                });
              }}
            >
              💰 计分板
            </button>
            <button
              type="button"
              className="sandbox-mini-add-btn"
              title="添加定时炸弹"
              onClick={() =>
                myId &&
                act({
                  type: 'spawn_prop',
                  playerId: myId,
                  prop: {
                    id: `timer_${Date.now()}`,
                    kind: 'timer',
                    title: '定时炸弹',
                    durationSeconds: 30,
                    remainingSeconds: 30,
                    isRunning: false,
                    isExploded: false,
                    startedBy: null,
                    startedAt: null,
                  },
                })
              }
            >
              💣 炸弹
            </button>
            <button
              type="button"
              className="sandbox-mini-add-btn"
              title="添加幸运金币"
              onClick={() =>
                myId &&
                act({
                  type: 'spawn_prop',
                  playerId: myId,
                  prop: {
                    id: `coin_${Date.now()}`,
                    kind: 'coin',
                    title: '幸运硬币',
                    lastFlipResult: null,
                    flippedBy: null,
                    flipTimestamp: null,
                  },
                })
              }
            >
              🪙 硬币
            </button>
          </div>

          <button
            type="button"
            className="sandbox-top-btn sandbox-top-btn--reset"
            title="清空并重置桌面"
            onClick={() => {
              if (confirm('确定要清空桌面重置为初始道具吗？')) {
                if (myId) act({ type: 'reset_table', playerId: myId });
              }
            }}
          >
            🧹 清空桌面
          </button>
        </div>

        {/* AI 助手「锵锵」提示横幅 */}
        {view.assistantMessage && (
          <div className="sandbox-assistant-banner">
            <div className="sandbox-assistant-banner__avatar">🤖</div>
            <div className="sandbox-assistant-banner__body">
              <div className="sandbox-assistant-banner__header">
                <strong>AI 助手「锵锵」：</strong>
                {view.assistantMessage.prompt && (
                  <span className="sandbox-assistant-banner__prompt">
                    “{view.assistantMessage.prompt}”
                  </span>
                )}
              </div>
              <p className="sandbox-assistant-banner__text">
                {view.assistantMessage.text}
              </p>
            </div>
          </div>
        )}

        {/* 桌面主要道具网格 */}
        <div className="sandbox-props-grid">
          {view.propOrder.map((propId) => {
            const prop = view.props[propId];
            if (!prop) return null;

            return (
              <div key={prop.id} className="sandbox-prop-card">
                <div className="sandbox-prop-card__header">
                  <span className="sandbox-prop-card__name">{prop.title}</span>
                  <button
                    type="button"
                    className="sandbox-prop-card__close"
                    title="收回此道具"
                    onClick={() =>
                      myId &&
                      act({
                        type: 'remove_prop',
                        playerId: myId,
                        propId: prop.id,
                      })
                    }
                  >
                    ✕
                  </button>
                </div>

                <div className="sandbox-prop-card__body">
                  {/* 1. 左轮手枪 */}
                  {prop.kind === 'revolver' && (
                    <div className="sandbox-prop-revolver">
                      <div className="sandbox-revolver-status">
                        {/* 金属轮转弹巢 SVG */}
                        <div className="sandbox-cylinder-wheel">
                          <svg width="76" height="76" viewBox="0 0 76 76">
                            <circle cx="38" cy="38" r="34" fill="#374151" stroke="#1f2937" strokeWidth="3" />
                            <circle cx="38" cy="38" r="10" fill="#1f2937" />
                            {prop.cylinder.map((bullet, idx) => {
                              const angle = (idx * (360 / prop.chambers) - 90) * (Math.PI / 180);
                              const cx = 38 + 22 * Math.cos(angle);
                              const cy = 38 + 22 * Math.sin(angle);
                              const isCurrent = idx === prop.currentChamber;
                              return (
                                <circle
                                  key={idx}
                                  cx={cx}
                                  cy={cy}
                                  r="5"
                                  fill={isCurrent ? '#ef4444' : bullet === 'live' ? '#f59e0b' : '#9ca3af'}
                                  stroke="#111827"
                                  strokeWidth="1.5"
                                />
                              );
                            })}
                          </svg>
                        </div>

                        {prop.lastAction && (
                          <div
                            className={`sandbox-revolver-feedback ${
                              prop.lastAction.result === 'live'
                                ? 'is-live'
                                : prop.lastAction.result === 'blank'
                                ? 'is-blank'
                                : ''
                            }`}
                          >
                            {prop.lastAction.result === 'live' && (
                              <span>💥 砰！实弹击发！💥</span>
                            )}
                            {prop.lastAction.result === 'blank' && (
                              <span>💨 咔哒！空包弹安全！</span>
                            )}
                            {prop.lastAction.result === 'spin' && (
                              <span>🌀 弹巢旋转完毕！</span>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="sandbox-prop-actions">
                        <button
                          type="button"
                          className="sandbox-btn sandbox-btn--primary"
                          onClick={() =>
                            myId &&
                            act({
                              type: 'operate_revolver',
                              playerId: myId,
                              propId: prop.id,
                              subAction: 'shoot',
                            })
                          }
                          disabled={busy}
                        >
                          <GameIcon name="bomb" size={16} />
                          <span>扣动扳机！</span>
                        </button>
                        <button
                          type="button"
                          className="sandbox-btn sandbox-btn--secondary"
                          onClick={() =>
                            myId &&
                            act({
                              type: 'operate_revolver',
                              playerId: myId,
                              propId: prop.id,
                              subAction: 'spin',
                            })
                          }
                          disabled={busy}
                        >
                          🌀 旋转弹巢
                        </button>
                        <button
                          type="button"
                          className="sandbox-btn sandbox-btn--outline"
                          onClick={() => {
                            setRevolverSetupOpen(prop.id);
                            setRevolverLiveCount(1);
                            setRevolverChambers(prop.chambers);
                          }}
                        >
                          ⚙️ 重新装弹
                        </button>
                      </div>
                    </div>
                  )}

                  {/* 2. 摇骰盅 */}
                  {prop.kind === 'dice' && (
                    <div className="sandbox-prop-dice">
                      <div className="sandbox-dice-container">
                        {prop.isCupCovered && peekDiceId !== prop.id ? (
                          <div className="sandbox-dice-cup-covered">
                            <span className="sandbox-dice-cup-icon">🪔</span>
                            <strong>暗盅已盖住！点数已锁定</strong>
                            <button
                              type="button"
                              className="sandbox-btn sandbox-btn--peek"
                              onClick={() => setPeekDiceId(prop.id)}
                            >
                              👀 仅自己偷看
                            </button>
                          </div>
                        ) : (
                          <div className="sandbox-dice-values">
                            {prop.values.map((v, i) => (
                              <div key={i} className="sandbox-dice-box">
                                {renderDicePips(v, prop.diceType)}
                              </div>
                            ))}
                            {peekDiceId === prop.id && prop.isCupCovered && (
                              <button
                                type="button"
                                className="sandbox-btn sandbox-btn--peek-hide"
                                onClick={() => setPeekDiceId(null)}
                              >
                                🙈 隐藏偷看
                              </button>
                            )}
                          </div>
                        )}
                        <span className="sandbox-dice-sum">
                          {prop.isCupCovered && peekDiceId !== prop.id
                            ? '点数未知'
                            : `合计：${prop.values.reduce((a, b) => a + b, 0)} 点`}
                        </span>
                      </div>

                      <div className="sandbox-prop-actions">
                        <button
                          type="button"
                          className="sandbox-btn sandbox-btn--primary"
                          onClick={() =>
                            myId &&
                            act({
                              type: 'operate_dice',
                              playerId: myId,
                              propId: prop.id,
                              subAction: 'roll',
                            })
                          }
                          disabled={busy}
                        >
                          🎲 摇骰子！
                        </button>
                        <button
                          type="button"
                          className="sandbox-btn sandbox-btn--secondary"
                          onClick={() =>
                            myId &&
                            act({
                              type: 'operate_dice',
                              playerId: myId,
                              propId: prop.id,
                              subAction: 'toggle_cup',
                            })
                          }
                          disabled={busy}
                        >
                          {prop.isCupCovered ? '✨ 开盅揭晓' : '🔒 盖上骰盅'}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* 3. 抢答铃 */}
                  {prop.kind === 'bell' && (
                    <div className="sandbox-prop-bell">
                      <div className="sandbox-bell-display">
                        <button
                          type="button"
                          className={`sandbox-big-bell-btn ${
                            prop.rungBy ? 'is-rung' : ''
                          }`}
                          onClick={() =>
                            myId &&
                            act({
                              type: 'operate_bell',
                              playerId: myId,
                              propId: prop.id,
                              subAction: 'ring',
                            })
                          }
                          disabled={busy}
                        >
                          <span className="sandbox-big-bell-icon">🔔</span>
                          <span className="sandbox-big-bell-text">拍铃抢答！</span>
                        </button>
                        <div className="sandbox-bell-info">
                          {prop.rungBy ? (
                            <div className="sandbox-bell-winner">
                              <span>🥇 首位抢答：</span>
                              <strong>{nameFor(members, prop.rungBy)}</strong>
                              <small>（累计被拍响 {prop.ringCount} 次）</small>
                            </div>
                          ) : (
                            <span className="sandbox-bell-idle">
                              铃声待命，看谁手速最快！
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="sandbox-prop-actions">
                        <button
                          type="button"
                          className="sandbox-btn sandbox-btn--outline"
                          onClick={() =>
                            myId &&
                            act({
                              type: 'operate_bell',
                              playerId: myId,
                              propId: prop.id,
                              subAction: 'reset',
                            })
                          }
                          disabled={busy}
                        >
                          🔄 重置抢答铃
                        </button>
                      </div>
                    </div>
                  )}

                  {/* 4. 指名大转盘 */}
                  {prop.kind === 'wheel' && (
                    <WheelPropView
                      prop={prop}
                      onSpin={() =>
                        myId &&
                        act({
                          type: 'operate_wheel',
                          playerId: myId,
                          propId: prop.id,
                          subAction: 'spin',
                        })
                      }
                      onEditSegments={(segments) =>
                        myId &&
                        act({
                          type: 'operate_wheel',
                          playerId: myId,
                          propId: prop.id,
                          subAction: 'set_segments',
                          segments,
                        })
                      }
                      disabled={busy}
                    />
                  )}

                  {/* 5. 筹码计分板 */}
                  {prop.kind === 'scoreboard' && (
                    <ScoreboardPropView
                      prop={prop}
                      players={view.players}
                      members={members.map((m) => ({ id: m.playerId, name: m.nickname }))}
                      onModifyScore={(targetPlayerId, delta) =>
                        myId &&
                        act({
                          type: 'operate_scoreboard',
                          playerId: myId,
                          propId: prop.id,
                          subAction: 'modify_score',
                          targetPlayerId,
                          delta,
                        })
                      }
                      onResetScores={(initialScore) =>
                        myId &&
                        act({
                          type: 'operate_scoreboard',
                          playerId: myId,
                          propId: prop.id,
                          subAction: 'reset_scores',
                          initialScore,
                        })
                      }
                      disabled={busy}
                    />
                  )}

                  {/* 6. 定时炸弹 */}
                  {prop.kind === 'timer' && (
                    <div className="sandbox-prop-timer">
                      <div
                        className={`sandbox-timer-clock ${
                          prop.isExploded
                            ? 'is-exploded'
                            : prop.isRunning
                            ? 'is-running'
                            : ''
                        }`}
                      >
                        <span className="sandbox-timer-digits">
                          {prop.remainingSeconds < 10
                            ? `0${prop.remainingSeconds}`
                            : prop.remainingSeconds}
                          s
                        </span>
                        {prop.isExploded && (
                          <span className="sandbox-timer-boom">💥 轰！时间到！</span>
                        )}
                      </div>

                      <div className="sandbox-prop-actions">
                        <button
                          type="button"
                          className="sandbox-btn sandbox-btn--primary"
                          onClick={() =>
                            myId &&
                            act({
                              type: 'operate_timer',
                              playerId: myId,
                              propId: prop.id,
                              subAction: prop.isRunning ? 'pause' : 'start',
                            })
                          }
                          disabled={busy}
                        >
                          {prop.isRunning ? '⏸️ 暂停' : '▶️ 启动倒计时'}
                        </button>
                        <button
                          type="button"
                          className="sandbox-btn sandbox-btn--outline"
                          onClick={() =>
                            myId &&
                            act({
                              type: 'operate_timer',
                              playerId: myId,
                              propId: prop.id,
                              subAction: 'reset',
                            })
                          }
                          disabled={busy}
                        >
                          🔄 重置 30s
                        </button>
                      </div>
                    </div>
                  )}

                  {/* 7. 幸运硬币 */}
                  {prop.kind === 'coin' && (
                    <div className="sandbox-prop-coin">
                      <div className="sandbox-coin-display">
                        <div
                          className={`sandbox-coin-disc ${
                            isFlippingCoin ? 'is-flipping' : ''
                          } ${prop.lastFlipResult ? `is-${prop.lastFlipResult}` : ''}`}
                        >
                          <div className="sandbox-coin-side front">👑</div>
                          <div className="sandbox-coin-side back">🌿</div>
                        </div>
                        <span className="sandbox-coin-result">
                          {prop.lastFlipResult === 'heads'
                            ? '👑 金色王冠（正面）'
                            : prop.lastFlipResult === 'tails'
                            ? '🌿 银色月桂（反面）'
                            : '点击下方抛硬币！'}
                        </span>
                      </div>

                      <div className="sandbox-prop-actions">
                        <button
                          type="button"
                          className="sandbox-btn sandbox-btn--primary"
                          onClick={() => handleFlipCoin(prop.id)}
                          disabled={busy || isFlippingCoin}
                        >
                          🪙 抛掷幸运金币！
                        </button>
                      </div>
                    </div>
                  )}

                  {/* 8. 卡牌堆 */}
                  {prop.kind === 'deck' && (
                    <div className="sandbox-prop-deck">
                      <div className="sandbox-deck-stats">
                        <span>🎴 牌堆：{prop.drawPile.length} 张</span>
                        <span>🗑️ 弃牌：{prop.discardPile.length} 张</span>
                        <span>📤 桌面：{prop.tableCards.length} 张</span>
                      </div>

                      {/* 桌面打出的公共展示卡牌 */}
                      {prop.tableCards.length > 0 && (
                        <div className="sandbox-table-cards-list">
                          {prop.tableCards.map((tc, idx) => (
                            <div
                              key={idx}
                              className={`sandbox-table-card ${
                                tc.isPublic ? 'is-public' : 'is-private'
                              }`}
                            >
                              <span className="sandbox-table-card__author">
                                {nameFor(members, tc.playedBy)} 打出：
                              </span>
                              <strong className="sandbox-table-card__title">
                                {tc.card.title}
                              </strong>
                              <p className="sandbox-table-card__content">
                                {tc.isPublic ? tc.card.content : '【暗置卡牌】'}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="sandbox-prop-actions">
                        <button
                          type="button"
                          className="sandbox-btn sandbox-btn--primary"
                          onClick={() =>
                            myId &&
                            act({
                              type: 'operate_deck',
                              playerId: myId,
                              propId: prop.id,
                              subAction: 'draw',
                            })
                          }
                          disabled={busy || prop.drawPile.length === 0}
                        >
                          🎴 抽 1 张到手牌
                        </button>
                        <button
                          type="button"
                          className="sandbox-btn sandbox-btn--secondary"
                          onClick={() =>
                            myId &&
                            act({
                              type: 'operate_deck',
                              playerId: myId,
                              propId: prop.id,
                              subAction: 'deal_all',
                            })
                          }
                          disabled={busy || prop.drawPile.length < view.players.length}
                        >
                          🃏 全员各发 1 张
                        </button>
                        <button
                          type="button"
                          className="sandbox-btn sandbox-btn--outline"
                          onClick={() =>
                            myId &&
                            act({
                              type: 'operate_deck',
                              playerId: myId,
                              propId: prop.id,
                              subAction: 'shuffle',
                            })
                          }
                          disabled={busy}
                        >
                          🔀 洗乱牌堆
                        </button>
                        {prop.tableCards.length > 0 && (
                          <button
                            type="button"
                            className="sandbox-btn sandbox-btn--outline"
                            onClick={() =>
                              myId &&
                              act({
                                type: 'operate_deck',
                                playerId: myId,
                                propId: prop.id,
                                subAction: 'discard_table',
                              })
                            }
                            disabled={busy}
                          >
                            🧹 清理桌面卡牌
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* 底部：我的私密手牌抽屉 */}
        {view.myHand.length > 0 && (
          <div className="sandbox-hand-drawer">
            <div className="sandbox-hand-drawer__header">
              <strong>🎴 我的私密手牌（共 {view.myHand.length} 张，仅自己可见）</strong>
            </div>
            <div className="sandbox-hand-cards-row">
              {view.myHand.map((card) => {
                const isSelected = selectedHandCardId === card.id;
                return (
                  <div
                    key={card.id}
                    className={`sandbox-hand-card ${isSelected ? 'is-selected' : ''}`}
                    onClick={() =>
                      setSelectedHandCardId(isSelected ? null : card.id)
                    }
                  >
                    <span className="sandbox-hand-card__title">{card.title}</span>
                    <p className="sandbox-hand-card__content">{card.content}</p>
                    {isSelected && (
                      <div className="sandbox-hand-card__actions">
                        <button
                          type="button"
                          className="sandbox-btn sandbox-btn--primary sandbox-btn--mini"
                          onClick={(e) => {
                            e.stopPropagation();
                            handlePlayHandCard(card.id, true);
                          }}
                        >
                          公开打出
                        </button>
                        <button
                          type="button"
                          className="sandbox-btn sandbox-btn--secondary sandbox-btn--mini"
                          onClick={(e) => {
                            e.stopPropagation();
                            handlePlayHandCard(card.id, false);
                          }}
                        >
                          暗置打出
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 侧边活动动态流水 */}
        <div className="sandbox-activity-box">
          <h4 className="sandbox-activity-title">📜 桌面动态日志</h4>
          <div className="sandbox-activity-list">
            {view.activityLogs.slice(0, 15).map((log) => (
              <div key={log.id} className="sandbox-activity-item">
                <span className="sandbox-activity-time">
                  {new Date(log.timestamp).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  })}
                </span>
                <span className="sandbox-activity-text">{log.text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* AI 小助手「锵锵」对话与玩法预设弹窗 */}
      {aiPanelOpen && (
        <div
          className="sandbox-modal-backdrop"
          onClick={() => setAiPanelOpen(false)}
        >
          <div
            className="sandbox-modal-dialog"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sandbox-modal-header">
              <h3>🤖 AI 小助手「锵锵」· 玩法定制工坊</h3>
              <button
                type="button"
                className="sandbox-modal-close"
                onClick={() => setAiPanelOpen(false)}
              >
                ✕
              </button>
            </div>

            <div className="sandbox-modal-body">
              <div className="sandbox-ai-input-section">
                <label className="sandbox-ai-label">
                  告诉「锵锵」你想怎么玩（自动布置道具与卡牌）：
                </label>
                <div className="sandbox-ai-input-row">
                  <input
                    type="text"
                    className="sandbox-ai-text-input"
                    value={aiInput}
                    onChange={(e) => setAiInput(e.target.value)}
                    placeholder="如：准备一把左轮和5颗骰子 / 来一套海龟汤卡牌"
                    onKeyDown={(e) => e.key === 'Enter' && handleAiSubmit()}
                  />
                  <button
                    type="button"
                    className="sandbox-btn sandbox-btn--primary"
                    onClick={handleAiSubmit}
                  >
                    一键布置桌面
                  </button>
                </div>
              </div>

              <h4 className="sandbox-presets-heading">
                ✨ 精选 8 大高人气聚会预设卡包
              </h4>
              <div className="sandbox-presets-grid">
                {PRESET_TEMPLATES.map((tmpl) => (
                  <div
                    key={tmpl.id}
                    className="sandbox-preset-card"
                    onClick={() => applyPreset(tmpl)}
                  >
                    <div className="sandbox-preset-card__top">
                      <span className="sandbox-preset-card__icon">
                        {tmpl.icon}
                      </span>
                      <strong className="sandbox-preset-card__name">
                        {tmpl.name}
                      </strong>
                    </div>
                    <p className="sandbox-preset-card__desc">{tmpl.desc}</p>
                    <span className="sandbox-preset-card__badge">
                      点击一键装载上桌 👉
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 左轮手枪装弹弹窗 */}
      {revolverSetupOpen && (
        <div
          className="sandbox-modal-backdrop"
          onClick={() => setRevolverSetupOpen(null)}
        >
          <div
            className="sandbox-modal-dialog sandbox-modal-dialog--small"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sandbox-modal-header">
              <h3>⚙️ 左轮手枪弹巢装填</h3>
              <button
                type="button"
                className="sandbox-modal-close"
                onClick={() => setRevolverSetupOpen(null)}
              >
                ✕
              </button>
            </div>
            <div className="sandbox-modal-body">
              <div className="sandbox-form-item">
                <label>弹巢总容量（2~12 发）：</label>
                <input
                  type="number"
                  min={2}
                  max={12}
                  className="sandbox-input"
                  value={revolverChambers}
                  onChange={(e) =>
                    setRevolverChambers(parseInt(e.target.value) || 6)
                  }
                />
              </div>
              <div className="sandbox-form-item">
                <label>实弹数量（1~{revolverChambers} 发）：</label>
                <input
                  type="number"
                  min={1}
                  max={revolverChambers}
                  className="sandbox-input"
                  value={revolverLiveCount}
                  onChange={(e) =>
                    setRevolverLiveCount(parseInt(e.target.value) || 1)
                  }
                />
              </div>
              <div className="sandbox-modal-actions">
                <button
                  type="button"
                  className="sandbox-btn sandbox-btn--primary"
                  onClick={() => handleConfirmRevolverLoad(revolverSetupOpen)}
                >
                  装填并随机洗乱弹巢
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 自定义卡牌工坊编辑器 Modal */}
      {cardEditorOpen && (
        <CardDeckEditorModal
          initialTitle="我的专属聚会卡牌包"
          initialCards={
            (Object.values(view.props).find((p) => p.kind === 'deck') as DeckProp)
              ?.drawPile ?? []
          }
          onSaveAndDeploy={handleDeployCustomDeck}
          onClose={() => setCardEditorOpen(false)}
        />
      )}
    </TabletopShell>
  );
}
