export interface OpenSourceReference {
  readonly name: string;
  readonly url: string;
  readonly notes: string;
}

export interface GameRuleStep {
  readonly key: string;
  readonly title: string;
  readonly description: string;
}

export interface GameActionSpec {
  readonly action: string;
  readonly actor: 'host' | 'player' | 'system';
  readonly description: string;
}

export interface GameUiPanelSpec {
  readonly key: string;
  readonly title: string;
  readonly description: string;
}

export interface GamePreparationSpec {
  readonly gameId: 'uno' | 'landlord' | 'werewolf';
  readonly displayName: string;
  readonly implementationPriority: number;
  readonly designGoal: string;
  readonly ruleSteps: readonly GameRuleStep[];
  readonly actions: readonly GameActionSpec[];
  readonly uiPanels: readonly GameUiPanelSpec[];
  readonly openSourceReferences: readonly OpenSourceReference[];
  readonly nextMilestones: readonly string[];
}

export const GAME_PREPARATION_SPECS = [
  {
    gameId: 'uno',
    displayName: 'UNO',
    implementationPriority: 1,
    designGoal: '做成快节奏、手机友好的彩色手牌桌面：玩家主要看自己的手牌、当前弃牌、方向、轮到谁和可出牌提示。',
    ruleSteps: [
      { key: 'deal', title: '发牌与翻起始牌', description: '每人 7 张牌，翻开一张数字牌作为弃牌堆起点；特殊牌起始效果先按标准规则处理或在配置中简化。' },
      { key: 'turn', title: '按颜色或数字出牌', description: '玩家必须出同色、同数字或同功能牌；没有可出牌时摸 1 张，若可出可立即打出。' },
      { key: 'action_cards', title: '行动牌', description: '跳过、反转、+2、万能牌、万能 +4 需要服务端校验合法性并广播效果。' },
      { key: 'uno_call', title: 'UNO 提醒', description: '剩 1 张时需要喊 UNO；MVP 可先自动提示，之后再补忘喊惩罚。' },
      { key: 'finish', title: '出完手牌获胜', description: '任一玩家手牌清空时结束，可先做单局胜负，后续再做积分制。' },
    ],
    actions: [
      { action: 'play_card', actor: 'player', description: '出一张手牌，可附带万能牌指定颜色。' },
      { action: 'draw_card', actor: 'player', description: '从牌堆摸牌，服务端决定摸到哪张。' },
      { action: 'call_uno', actor: 'player', description: '声明自己只剩一张牌。' },
      { action: 'advance_turn', actor: 'system', description: '行动牌结算后推进回合。' },
    ],
    uiPanels: [
      { key: 'center_discard', title: '中央弃牌区', description: '显示当前颜色、当前牌、方向、惩罚累积。' },
      { key: 'hand', title: '我的手牌', description: '大按钮式卡牌，合法可出牌高亮，非法牌置灰。' },
      { key: 'players', title: '玩家环形状态', description: '显示每人手牌数量、当前回合、UNO 标记。' },
      { key: 'color_picker', title: '万能牌选色弹层', description: '出万能牌时选择红黄蓝绿。' },
    ],
    openSourceReferences: [
      { name: 'guilhermebkel/uno-game', url: 'https://github.com/guilhermebkel/uno-game', notes: '可参考 TypeScript UNO 规则建模、牌面结构和行动牌处理思路。' },
      { name: 'danguilherme/uno', url: 'https://github.com/danguilherme/uno', notes: '偏游戏逻辑实现，可借鉴纯规则函数拆分方式。' },
      { name: 'Merlin-Chest/UNO', url: 'https://github.com/Merlin-Chest/UNO', notes: '中文网页联机 UNO，可参考移动端联机体验与房间流程。' },
    ],
    nextMilestones: ['定义 UnoCard / UnoState / UnoAction', '实现洗牌发牌与可出牌判断', '做 UNO 专用手牌页面', '补完整单局规则测试'],
  },
  {
    gameId: 'landlord',
    displayName: '斗地主',
    implementationPriority: 2,
    designGoal: '做成三人扑克牌桌：地主在上方突出显示，玩家手牌可多选，系统实时提示当前要压过的牌型。',
    ruleSteps: [
      { key: 'deal', title: '洗牌发牌留底牌', description: '54 张牌，三名玩家各 17 张，剩 3 张作为地主底牌。' },
      { key: 'bid', title: '叫分 / 抢地主', description: 'MVP 可先用 1/2/3 分叫地主；后续可加抢地主、加倍。' },
      { key: 'landlord_cards', title: '地主拿底牌', description: '地主获得 3 张底牌，公开底牌给所有玩家。' },
      { key: 'play', title: '按牌型出牌', description: '支持单张、对子、三张、顺子、连对、三带、飞机、炸弹、王炸等牌型。' },
      { key: 'finish', title: '先出完获胜', description: '地主先出完地主胜；任一农民先出完农民阵营胜。' },
    ],
    actions: [
      { action: 'bid_score', actor: 'player', description: '叫 0/1/2/3 分或不叫。' },
      { action: 'play_combo', actor: 'player', description: '选择若干张牌组成合法牌型并出牌。' },
      { action: 'pass_turn', actor: 'player', description: '不出，直到一轮结束重置当前压制牌型。' },
      { action: 'settle_round', actor: 'system', description: '检查是否有人出完并计算胜负。' },
    ],
    uiPanels: [
      { key: 'table', title: '三人桌面', description: '固定三人位置，地主角标、剩牌数、当前出牌清晰可见。' },
      { key: 'hand_selector', title: '多选手牌', description: '点击抬起选牌，自动识别牌型并提示是否能压过上家。' },
      { key: 'bid_panel', title: '叫分面板', description: '开局阶段显示不叫/1分/2分/3分。' },
      { key: 'combo_hint', title: '牌型提示栏', description: '展示当前选择牌型、倍率、错误原因。' },
    ],
    openSourceReferences: [
      { name: 'CardsMP/cardsmp.github.io', url: 'https://github.com/CardsMP/cardsmp.github.io', notes: 'GitHub 搜索到的 TypeScript + Vite + Express + Socket.IO 斗地主项目，可参考实时多人和牌局结构。' },
    ],
    nextMilestones: ['定义扑克牌编码与排序', '实现牌型识别纯函数', '实现叫地主状态机', '做三人牌桌与多选手牌 UI'],
  },
  {
    gameId: 'werewolf',
    displayName: '狼人杀',
    implementationPriority: 3,
    designGoal: '沿用现有发言/投票体验，重点新增角色身份页、夜晚行动页、上帝流程提示和阵营胜负展示。',
    ruleSteps: [
      { key: 'roles', title: '分配角色', description: 'MVP 推荐 6-8 人局：狼人、村民、预言家、女巫，可后续加入猎人、守卫。' },
      { key: 'night', title: '夜晚行动', description: '狼人选择击杀目标，预言家查验，女巫救人或毒人；服务端按顺序结算。' },
      { key: 'day', title: '白天公布与发言', description: '公布夜晚死亡情况，所有存活玩家按顺序发言。' },
      { key: 'vote', title: '放逐投票', description: '存活玩家投票放逐一人，平票可重新投票或无人出局。' },
      { key: 'win', title: '阵营胜负', description: '狼人全灭好人胜；狼人数量达到或超过好人数量狼人胜。' },
    ],
    actions: [
      { action: 'night_kill', actor: 'player', description: '狼人阵营选择夜晚击杀目标。' },
      { action: 'seer_check', actor: 'player', description: '预言家查验一名玩家阵营。' },
      { action: 'witch_save_or_poison', actor: 'player', description: '女巫选择救人、毒人或跳过。' },
      { action: 'day_vote', actor: 'player', description: '白天投票放逐。' },
      { action: 'advance_phase', actor: 'system', description: '按夜晚、白天、投票、结算推进阶段。' },
    ],
    uiPanels: [
      { key: 'role_reveal', title: '身份揭示', description: '只给本人展示角色、阵营、能力说明。' },
      { key: 'night_action', title: '夜晚行动', description: '按角色显示可选目标，其他玩家看到等待页。' },
      { key: 'discussion', title: '白天发言', description: '复用谁是卧底的轮流发言结构，增加存活/死亡状态。' },
      { key: 'vote_board', title: '投票与遗言', description: '展示投票、出局、遗言和下一夜提示。' },
    ],
    openSourceReferences: [
      { name: 'xiong35/werewolf', url: 'https://github.com/xiong35/werewolf', notes: '中文线下狼人杀网页，可参考无上帝/替代卡牌的流程设计。' },
      { name: 'liziye627-design/hxlr', url: 'https://github.com/liziye627-design/hxlr', notes: 'React + TypeScript + Socket.IO 多人社交推理游戏平台，可参考房间与多人体验思路。' },
      { name: 'nshun/react-werewolf', url: 'https://github.com/nshun/react-werewolf', notes: 'React 狼人杀项目，可参考基础页面拆分。' },
    ],
    nextMilestones: ['确定 MVP 角色配置', '定义 WerewolfState 私有视图脱敏', '实现夜晚行动状态机', '复用并扩展发言/投票 UI'],
  },
] as const satisfies readonly GamePreparationSpec[];

export type PreparedGameId = (typeof GAME_PREPARATION_SPECS)[number]['gameId'];

export function getGamePreparationSpec(gameId: string | null | undefined): GamePreparationSpec | undefined {
  return GAME_PREPARATION_SPECS.find((spec) => spec.gameId === gameId);
}
