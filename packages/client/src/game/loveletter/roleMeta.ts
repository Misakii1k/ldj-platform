/**
 * 情书 · 八张角色牌的元数据（名称、点数、张数、技能文案）。
 *
 * U08 从 LoveLetterGamePage.tsx 拆出：这些是纯数据，页面、技能预览抽屉、
 * 记牌器三处都要读，留在页面里会让单文件继续膨胀。
 */
import type { LoveLetterRole } from './types.ts';

export const ROLE_LABELS: Record<LoveLetterRole, string> = {
  guard: '守卫', priest: '牧师', baron: '男爵', handmaid: '侍女',
  prince: '王子', king: '国王', countess: '伯爵夫人', princess: '公主',
};

export interface RoleAbilityMeta {
  role: LoveLetterRole;
  name: string;
  value: number;
  totalCount: number;
  icon: string;
  badge: string;
  summary: string;
  description: string;
  tips: string;
}

export const ROLE_ABILITIES: Record<LoveLetterRole, RoleAbilityMeta> = {
  guard: {
    role: 'guard',
    name: '守卫 (Guard)',
    value: 1,
    totalCount: 5,
    icon: '🛡️',
    badge: '猜牌淘汰',
    summary: '指定一名其他玩家并猜测其手牌（不能猜守卫），猜中淘汰！',
    description: '指定一名未被侍女庇护的其他玩家，猜测对方持有的角色牌（不可猜守卫）。若猜测正确，该玩家立即被淘汰出局！',
    tips: '牌库中数量最多（共 5 张），是试探与击杀的主力牌。',
  },
  priest: {
    role: 'priest',
    name: '牧师 (Priest)',
    value: 2,
    totalCount: 2,
    icon: '📜',
    badge: '秘密查验',
    summary: '秘密查验一名其他玩家的手牌（仅你可见）。',
    description: '指定一名未被侍女庇护的其他玩家，秘密查看其当前手牌。查验结果记录在你的专属记录本中。',
    tips: '掌握绝对情报，下回合配合守卫指名必杀或男爵绝杀。',
  },
  baron: {
    role: 'baron',
    name: '男爵 (Baron)',
    value: 3,
    totalCount: 2,
    icon: '⚔️',
    badge: '暗中比点',
    summary: '与一名玩家秘密比对手牌点数，较小者淘汰。',
    description: '指定一名未被侍女庇护的其他玩家，私下比对各自手牌点数。点数较小者立即被淘汰出局；点数相同则平安无事。',
    tips: '手持高点数牌（如王子、国王、伯爵夫人）时主动发起决斗。',
  },
  handmaid: {
    role: 'handmaid',
    name: '侍女 (Handmaid)',
    value: 4,
    totalCount: 2,
    icon: '✨',
    badge: '免受影响',
    summary: '直到你的下个回合开始前，免疫所有卡牌效果。',
    description: '打出后获得神圣庇护，直到你的下一个回合开始前，任何其他玩家打出的卡牌效果均无法以你为目标。',
    tips: '当局势危险或被多人盯上时打出保命，安全渡过轮次。',
  },
  prince: {
    role: 'prince',
    name: '王子 (Prince)',
    value: 5,
    totalCount: 2,
    icon: '👑',
    badge: '强迫弃牌',
    summary: '指定任意一名玩家（可自选），迫使其弃牌并重摸。',
    description: '指定任意一名未被侍女庇护的玩家（可以选择自己），迫使其弃掉当前手牌并重新摸一张（若弃掉公主则该玩家直接出局）。',
    tips: '破除对手关键手牌；当自己被查验暴露时对自己使用洗白手牌。',
  },
  king: {
    role: 'king',
    name: '国王 (King)',
    value: 6,
    totalCount: 1,
    icon: '⚜️',
    badge: '强制换牌',
    summary: '指定一名其他玩家，与对方强制交换各自的手牌。',
    description: '指定一名未被侍女庇护的其他玩家，与对方强制交换各自的手牌。',
    tips: '获知对方持有公主或高点数牌时，强行掠夺换牌。',
  },
  countess: {
    role: 'countess',
    name: '伯爵夫人 (Countess)',
    value: 7,
    totalCount: 1,
    icon: '💎',
    badge: '皇室羁绊',
    summary: '手中同时有王子或国王时，必须打出伯爵夫人。',
    description: '无指定效果。但若你的另一张手牌是王子 (5) 或国王 (6)，你必须打出伯爵夫人，不可打出王子或国王。',
    tips: '打出伯爵夫人往往让对手怀疑你手握王子或国王，可作为虚晃一枪的心理战。',
  },
  princess: {
    role: 'princess',
    name: '公主 (Princess)',
    value: 8,
    totalCount: 1,
    icon: '💖',
    badge: '离手即死',
    summary: '点数最高 (8)！若打出或被迫弃掉，立即淘汰出局。',
    description: '全场点数最高（8 点）。牌库耗尽比拼点数时持有公主必胜。但无论因任何原因打出或被弃掉，立即淘汰！',
    tips: '必须死守在手中，小心被王子迫使弃牌。',
  },
};

export const NEEDS_TARGET: readonly LoveLetterRole[] = ['guard', 'priest', 'baron', 'prince', 'king'];
