/**
 * 狼人杀的 LLM 决策材料。
 *
 * 这是四个游戏里最吃推理的一个：夜狼要挑软柿子、预言家要选查验价值高的人、
 * 白天投票要结合已公开的信息判断。规则策略在这里只能随机瞎投，
 * 换成大模型才能看出点像人的样子。
 *
 * 视角边界仍由 getPlayerView 决定：狼看得到队友，预言家看得到自己的查验结果，
 * 女巫看得到今夜的受害者——这里只是把这些私有信息翻译成中文，不多给一个字。
 */
import type { BotActionOption, BotDecisionInput, BotPromptContext } from '@ldj/shared';
import type { WerewolfAction, WerewolfPlayerView, WerewolfRole } from './module.ts';

const ROLE_NAMES: Record<WerewolfRole, string> = {
  wolf: '狼人',
  villager: '村民',
  seer: '预言家',
  witch: '女巫',
};

function seatOf(view: WerewolfPlayerView, playerId: string): number | null {
  return view.players.find((p) => p.playerId === playerId)?.seat ?? null;
}

/** "3 号玩家"：座位号比 uuid 好读，也省 token */
function seatName(view: WerewolfPlayerView, playerId: string): string {
  const seat = seatOf(view, playerId);
  return seat === null ? '未知玩家' : `${seat + 1} 号玩家`;
}

function describeBoard(view: WerewolfPlayerView, myId: string): string {
  return view.players
    .map((p) => {
      const tags = [`${p.seat + 1} 号`];
      if (p.playerId === myId) tags.push('你');
      tags.push(p.alive ? '存活' : '已出局');
      if (p.revealedRole) tags.push(`身份是${ROLE_NAMES[p.revealedRole]}`);
      return tags.join('｜');
    })
    .join('；');
}

function describeDeaths(view: WerewolfPlayerView): string {
  if (view.lastNightDeaths.length === 0) return '昨夜是平安夜，没有人死亡。';
  const names = view.lastNightDeaths.map((id) => seatName(view, id)).join('、');
  return `昨夜死亡：${names}。`;
}

/** 角色专属的目标说明：模型据此知道自己该往哪边使劲 */
function roleBrief(role: WerewolfRole): string {
  const common = `你在玩「狼人杀」。场上有狼人、村民、预言家、女巫。
狼人每晚可以杀一个人，白天要伪装成好人误导投票；
好人阵营（村民、预言家、女巫）要在白天投票投出狼人。
狼人杀光好人则狼人胜，好人票出所有狼人则好人胜。`;
  switch (role) {
    case 'wolf':
      return `${common}
你的身份是狼人。夜里和队友一起决定杀谁，白天要藏住身份，
可以适度伪装成好人，甚至假称自己是预言家来搅乱局势。`;
    case 'seer':
      return `${common}
你的身份是预言家。每晚可以查验一个人的阵营，这是好人最重要的信息来源。
白天要考虑什么时候公开身份：说了能带票，但也会成为狼人的首要目标。`;
    case 'witch':
      return `${common}
你的身份是女巫。你有一瓶解药和一瓶毒药，每种只能用一次。
解药能救回今夜被杀的人，毒药能在夜里毒死一个人。`;
    case 'villager':
      return `${common}
你的身份是普通村民。你没有夜间技能，只能靠白天的发言和投票找出狼人。`;
  }
}

export function buildWerewolfBotPrompt(
  input: BotDecisionInput<WerewolfPlayerView>,
): BotPromptContext<WerewolfAction> | null {
  const { view, playerId } = input;
  const me = view.me;
  if (!me || !me.alive || view.phase === 'game_over') return null;

  const brief = roleBrief(me.role);
  const header = [
    `你是${seatName(view, playerId)}，身份是${ROLE_NAMES[me.role]}。`,
    `现在是第 ${view.day} 天。场上：${describeBoard(view, playerId)}。`,
    describeDeaths(view),
  ].join('\n');

  /** 存活的其他玩家，狼人再排掉队友 */
  const others = view.players.filter((p) => p.alive && p.playerId !== playerId);

  switch (view.phase) {
    case 'night': {
      if (me.role === 'wolf') {
        const targets = others.filter((p) => !me.wolfTeammateIds.includes(p.playerId));
        if (targets.length === 0) return null;
        const teammates =
          me.wolfTeammateIds.length > 0
            ? `你的狼队友是：${me.wolfTeammateIds.map((id) => seatName(view, id)).join('、')}。`
            : '你是唯一的狼人。';
        return {
          roleBrief: brief,
          situation: `${header}\n${teammates}\n天黑了，选择今晚要杀的人。优先考虑可能是预言家或女巫的玩家。`,
          options: targets.map((p) => ({
            id: p.playerId,
            label: `杀掉 ${p.seat + 1} 号玩家`,
            action: { type: 'night_kill', targetPlayerId: p.playerId },
          })),
        };
      }

      if (me.role === 'seer') {
        if (me.seerResult !== null) return null; // 今夜已查验
        if (others.length === 0) return null;
        return {
          roleBrief: brief,
          situation: `${header}\n天黑了，选择今晚要查验的人。挑一个发言可疑、或者明天可能有话语权的玩家。`,
          options: others.map((p) => ({
            id: p.playerId,
            label: `查验 ${p.seat + 1} 号玩家的阵营`,
            action: { type: 'seer_check', targetPlayerId: p.playerId },
          })),
        };
      }

      if (me.role === 'witch') {
        // 先答解药、再答毒药：两个决定都做完这一夜才算完整
        if (!me.witchSaveUsed && me.nightVictimId !== null) {
          const victim = seatName(view, me.nightVictimId);
          return {
            roleBrief: brief,
            situation: `${header}\n今夜 ${victim} 被狼人杀了。你的解药还没用过，要不要救？\n解药只有一瓶，救了之后这一晚就不能再救别人。`,
            options: [
              { id: 'save', label: `用解药救 ${victim}`, action: { type: 'witch_save', save: true } },
              { id: 'skip', label: '不救，留着解药', action: { type: 'witch_save', save: false } },
            ],
          };
        }
        if (me.witchPoisonUsed) {
          // 毒药已用完，只需把"不毒"这一步答完
          return {
            roleBrief: brief,
            situation: `${header}\n你的毒药已经用过了，今夜没有别的事可做。`,
            options: [
              { id: 'none', label: '结束我的夜晚行动', action: { type: 'witch_poison', targetPlayerId: null } },
            ],
          };
        }
        const options: BotActionOption<WerewolfAction>[] = [
          { id: 'none', label: '不用毒药', action: { type: 'witch_poison', targetPlayerId: null } },
          ...others.map((p) => ({
            id: p.playerId,
            label: `用毒药毒死 ${p.seat + 1} 号玩家`,
            action: { type: 'witch_poison', targetPlayerId: p.playerId } as WerewolfAction,
          })),
        ];
        return {
          roleBrief: brief,
          situation: `${header}\n要不要用毒药？毒药只有一瓶，毒错好人会帮到狼人，所以没把握时不用也是合理的选择。`,
          options,
        };
      }

      return null; // 村民夜晚无动作
    }

    case 'day_announcement': {
      const seerInfo =
        me.role === 'seer' && me.seerResult
          ? `\n你昨晚查验了 ${seatName(view, me.seerResult.playerId)}，结果是${
              me.seerResult.team === 'wolves' ? '狼人阵营' : '好人阵营'
            }。`
          : '';
      return {
        roleBrief: brief,
        situation: `${header}${seerInfo}\n天亮了，确认昨夜的情况后进入讨论。`,
        options: [{ id: 'ok', label: '确认，进入讨论', action: { type: 'finish_speech' } }],
      };
    }

    case 'discussion': {
      if (view.currentSpeakerId !== playerId) return null;
      const seerInfo =
        me.role === 'seer' && me.seerResult
          ? `\n你的查验信息：${seatName(view, me.seerResult.playerId)} 属于${
              me.seerResult.team === 'wolves' ? '狼人阵营' : '好人阵营'
            }。要不要公开，你自己权衡。`
          : '';
      return {
        roleBrief: brief,
        situation: `${header}${seerInfo}\n轮到你发言了。发言内容走聊天通道，这里只需要确认发言结束。`,
        options: [{ id: 'done', label: '结束我的发言', action: { type: 'finish_speech' } }],
      };
    }

    case 'voting': {
      if (others.length === 0) return null;
      const seerInfo =
        me.role === 'seer' && me.seerResult
          ? `\n你查验过：${seatName(view, me.seerResult.playerId)} 属于${
              me.seerResult.team === 'wolves' ? '狼人阵营' : '好人阵营'
            }。`
          : '';
      const wolfInfo =
        me.role === 'wolf' && me.wolfTeammateIds.length > 0
          ? `\n别投你的狼队友：${me.wolfTeammateIds.map((id) => seatName(view, id)).join('、')}。`
          : '';
      return {
        roleBrief: brief,
        situation: `${header}${seerInfo}${wolfInfo}\n开始投票，选一个你要投出去的人。`,
        options: others.map((p) => ({
          id: p.playerId,
          label: `投票出局 ${p.seat + 1} 号玩家`,
          action: { type: 'day_vote', targetPlayerId: p.playerId },
        })),
      };
    }

    default:
      return null;
  }
}
