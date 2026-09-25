import type { WerewolfPlayRole, WerewolfPlayView } from './play.ts';

const ROLE_NAMES: Record<WerewolfPlayRole, string> = {
  wolf: '狼人', villager: '村民', seer: '预言家', witch: '女巫',
  guard: '守卫', hunter: '猎人', idiot: '白痴',
};
const seat = (view: WerewolfPlayView, id: string) => {
  const player = view.players.find((p) => p.playerId === id);
  return player ? `${player.seat + 1} 号` : '未知玩家';
};

const ROLE_STRATEGY: Record<WerewolfPlayRole, string> = {
  wolf: '你为狼人阵营争胜，不是替好人找狼。白天建立可信的好人视角，主动提出有公开依据的怀疑与放逐主张；可以按游戏规则悍跳或伪装身份，但不要捏造他人发言、系统公告或历史票数来作证。保护狼队秘密，不自曝狼身份或队友名单；不要机械保队友，必要时可切割，但要有胜率收益。夜间优先处理威胁狼队的神职或可信好人，结合队友已投目标协调；开放夜刀不等于应该自刀或刀队友，只有明确战术收益才这样做。',
  seer: '你是好人阵营的信息核心。白天有查杀、遭到对跳或自己可能被放逐时，应主动跳预言家，报实际查验对象、结果和可见的查验夜次，给出放逐建议。只有金水时也要利用它缩小嫌疑范围；若暂不跳，仍须给出公开证据支持的独立判断，不能以藏身份为由整轮划水。严禁编造查验；夜里优先查尚未查验、能区分对立阵营的关键玩家。',
  witch: '你属于好人阵营。把刀口、药剂余量与公开局势结合，不把被刀或被救等同于铁好人（可能自刀）。解药可用时积极评估救人的收益，不默认留药；毒药不可逆，有具体强证据才毒，无依据不用毒是合理选择。需要纠正关键误导、对跳或自救辩护时可以跳女巫并披露自己确实知道的用药信息，不虚构救毒历史，也不无故公布剩余药剂。',
  guard: '你属于好人阵营。结合可信身份与夜袭风险选择保护目标，优先保护高价值好人，遵守候选中的连守限制；不要无理由空守。白天同样参与找狼，不提前公开今晚守护计划；必要时可报身份或实际可见的守护信息，但平安夜不等于守护成功，也不能据此认定被守者为好人。',
  hunter: '你属于好人阵营。主动找狼、回应质疑，不靠“谁投我就带谁”代替分析；有必要可跳猎人。开枪时比较目标证据与误伤代价，有明确狼嫌疑再开枪；放弃需要具体局势理由，不为显得积极而乱带好人。',
  idiot: '你属于好人阵营。未翻牌时正常分析和投票；翻牌失去投票权后仍可利用公开身份帮助好人梳理疑点、提出放逐建议，不因不能投票而放弃参与。',
  villager: '你属于好人阵营。没有夜间技能不等于没有信息：比较身份声明、查验主张、前后矛盾、拉票动机与公开票数，主动提出最值得追问的人和暂定站边。不要装成掌握查验的神职，不因别人语气强硬或人数多就跟票。',
};

/** 只描述策略，不扩大合法动作集合，也不读取裁判状态。 */
export function buildWerewolfStrategy(view: WerewolfPlayView): string {
  if (!view.me) return '';
  const win = view.config?.winCondition === 'roles'
    ? '胜负目标：狼人全灭则好人胜；神职全部出局或平民全部出局则狼人胜。'
    : view.config?.winCondition === 'numbers'
      ? '胜负目标：狼人全灭则好人胜；狼人数量达到其他存活玩家数量则狼人胜。'
      : '';
  const phase = view.phase === 'discussion'
    ? '发言阶段：先给出自己的暂定结论，再说具体依据与下一步。有人质疑你就正面回应，不能只附和或把判断交给别人。信息不足时指出缺少什么，点名一个待核实对象并提出可回答的问题，说明什么回答会改变判断；不要把首轮无发言、座位顺序或沉默本身当狼证据，也不要硬编一个狼。'
    : view.phase === 'last_words'
      ? '遗言阶段：这是最后一次传递信息。好人明确留下自己确知的信息、最值得核查的疑点及下一轮建议；狼人继续按伪装争取阵营收益，不泄露狼队。不要只说“你们投错了”或“听预言家的”。'
      : view.phase === 'voting' || view.phase === 'runoff_voting'
        ? '投票阶段：在合法候选中比较证据，选当前最有利于己方阵营的目标。投票应与自己此前公开立场一致；若改变，reason 简述新增依据。平票加赛只比较加赛候选，不要因原目标不在名单就习惯弃票。信息不完全不是自动弃票的理由；确有具体战术收益或无合理目标才弃票，并说明理由。'
        : view.phase === 'night' || view.phase === 'hunter_shot'
          ? '技能阶段：结合自己的私有信息、公开证据与阵营目标挑选合法动作，在 reason 中简述目标和收益；不能只因跳过排在列表前面就跳过，也不能为了主动而盲目用毒或开枪。本阶段不向公屏发言。'
          : view.phase === 'free_discussion'
            ? '自由讨论结束确认：回顾争议和自己的站边，为随后投票准备具体目标；此动作只确认准备进入投票，不额外发公屏。'
            : '确认阶段：按当前合法动作确认信息，不杜撰新的游戏事件。';
  return [
    '【狼人杀参与原则】你是争取己方阵营获胜的在场玩家，不是旁观者或主持人。独立判断，允许不确定但不要逃避决策。',
    win, ROLE_STRATEGY[view.me.role], phase,
    '区分系统公开事实、本人确知信息、玩家自述和你的推测。别人报身份或报查验不自动成为事实；支持或反对都要有自己的理由，注意反证。只用给定玩家视角，不能读取未知身份、未展示的历史或把截断聊天中没有的话编出来。',
    'reason 只写简短决策摘要（关键依据、选择与必要的保留意见），不需要长篇思考过程。speech 是公开表达，不能复制含狼队秘密的内部摘要。行动只能从候选中选；候选排列先后不代表推荐。',
  ].filter(Boolean).join('\n');
}

/** 白名单提取玩家投影；不序列化全量 view，避免引入服务端隐藏字段。 */
export function buildWerewolfEvidence(view: WerewolfPlayView): string {
  const me = view.me;
  if (!me) return '';
  const lines = [
    '【当前可见事实】',
    `场上座位：${view.players.map((p) => `${seat(view, p.playerId)}=${p.alive ? '存活' : '已出局'}${p.revealedRole ? `，公开身份${ROLE_NAMES[p.revealedRole]}` : ''}${p.idiotRevealed ? '，白痴已翻牌' : ''}`).join('；')}。`,
  ];
  if (view.lastNightDeaths !== undefined) lines.push(`最近夜间死亡公告：${view.lastNightDeaths.map((id) => seat(view, id)).join('、') || '无人或尚未结算'}；不能仅凭死亡或平安夜推断死因、身份。`);
  const vote = view.lastVoteSummary;
  if (vote) {
    lines.push(`最近公开票数（第 ${vote.day} 天${vote.kind === 'runoff' ? '加赛' : '普通'}投票）：${Object.entries(vote.tally).map(([id, count]) => `${seat(view, id)} ${count} 票`).join('、') || '无有效票'}；弃票 ${vote.abstained}；放逐 ${vote.eliminatedPlayerId ? seat(view, vote.eliminatedPlayerId) : '无人'}。这里只提供汇总，不能据此编造谁投了谁。`);
  }
  if (view.phase === 'runoff_voting') lines.push(`加赛候选：${(view.runoffCandidates ?? []).map((id) => seat(view, id)).join('、') || '无'}。`);
  lines.push('【本人私有信息：供决策使用，是否公开遵循身份策略】');
  if (me.role === 'wolf') {
    lines.push(`狼同伴：${(me.wolfTeammateIds ?? []).map((id) => seat(view, id)).join('、') || '当前视角无名单'}。`);
    lines.push(`可见狼队夜刀投票：${Object.entries(me.wolfVotes ?? {}).map(([id, target]) => `${seat(view, id)}→${seat(view, target)}`).join('；') || '无'}；这是夜刀，不是白天票型。`);
  }
  if (me.role === 'seer') lines.push(`本人查验记录：${(me.seerResults ?? []).map((r) => `${r.night === undefined ? '' : `第 ${r.night} 夜 `}${seat(view, r.playerId)}=${r.team === 'wolves' ? '狼人（查杀）' : '好人（金水）'}`).join('；') || '当前视角无查验记录，不可编造'}。`);
  if (me.role === 'witch' && !me.alive) lines.push('已出局：当前视角不再提供药剂与刀口私有状态，不能把缺省值当成药剂未用或无人被刀，也不能编造历史。');
  if (me.role === 'witch' && me.alive) {
    lines.push(`药剂状态：解药${me.witchSaveUsed === undefined ? '未知' : me.witchSaveUsed ? '已用' : '未用'}；毒药${me.witchPoisonUsed === undefined ? '未知' : me.witchPoisonUsed ? '已用' : '未用'}。`);
    lines.push(`当前可见刀口：${me.nightVictimId ? seat(view, me.nightVictimId) : '无可见目标（不代表没有狼刀）'}；当前${me.witchCanSelfSave ? '允许' : '不允许'}自救；本夜解药决定：${me.witchSaveDecision === true ? '已选择使用' : me.witchSaveDecision === false ? '不使用' : '尚未决定'}。具体用药合法性以候选为准。`);
  }
  if (me.role === 'guard') lines.push(`上次守护目标：${me.lastGuardTargetId ? seat(view, me.lastGuardTargetId) : '当前视角无记录'}；本夜守护是否已决定：${me.guardDecided ? '是' : '否'}。`);
  return lines.join('\n');
}
