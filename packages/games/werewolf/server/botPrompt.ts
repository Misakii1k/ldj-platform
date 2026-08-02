import type { BotActionOption, BotDecisionInput, BotPromptContext } from '@ldj/shared';
import type { WerewolfAction, WerewolfPlayerView, WerewolfRole } from './module.ts';

const ROLE_NAMES: Record<WerewolfRole, string> = {
  wolf: '狼人',
  villager: '村民',
  seer: '预言家',
  witch: '女巫',
  guard: '守卫',
  hunter: '猎人',
  idiot: '白痴',
};

function seatName(view: WerewolfPlayerView, id: string): string {
  const seat = view.players.find((player) => player.playerId === id)?.seat;
  return seat === undefined ? '未知玩家' : `${seat + 1} 号玩家`;
}

function board(view: WerewolfPlayerView, me: string): string {
  return view.players
    .map((player) => {
      const tags = [`${player.seat + 1} 号`, player.alive ? '存活' : '已出局'];
      if (player.playerId === me) tags.push('你');
      if (player.revealedRole) tags.push(ROLE_NAMES[player.revealedRole]);
      return tags.join('｜');
    })
    .join('；');
}

function roleBrief(role: WerewolfRole): string {
  const common = '你在玩狼人杀。狼人夜里共同投票击杀，好人阵营通过发言、预言家查验和女巫药剂找出狼人；狼人全灭则好人胜，狼人数量达到其他存活玩家数量则狼人胜。';
  if (role === 'wolf') return `${common} 你是狼人，夜间每名狼人独立投票，最高票目标被袭击；平票按座位顺序确定。`;
  if (role === 'seer') return `${common} 你是预言家，每夜查验一名其他存活玩家，历次查验结果仅你可见。`;
  if (role === 'witch') return `${common} 你是女巫，解药和毒药各一瓶；同夜不能同时使用，首夜后不能自救。`;
  if (role === 'guard') return `${common} 你是守卫，每夜可守护一名其他存活玩家（也可以跳过）；被守住的玩家当夜不被狼人袭击，但挡不住女巫的毒药；不能连续两夜守护同一人。`;
  if (role === 'hunter') return `${common} 你是猎人，被狼刀杀或放逐出局时可以开枪带走一名存活玩家（被女巫毒死时不能开枪）。`;
  if (role === 'idiot') return `${common} 你是白痴，被放逐时自动翻牌免死，但从此失去投票权，仍可发言。`;
  return `${common} 你是村民，没有夜间技能。`;
}

function aliveOthers(view: WerewolfPlayerView, playerId: string) {
  return view.players.filter((player) => player.alive && player.playerId !== playerId);
}

function targetOptions(
  players: WerewolfPlayerView['players'],
  verb: string,
  action: (id: string) => WerewolfAction,
): BotActionOption<WerewolfAction>[] {
  return players.map((player) => ({
    id: player.playerId,
    label: `${verb} ${player.seat + 1} 号玩家`,
    action: action(player.playerId),
  }));
}

export function buildWerewolfBotPrompt(
  input: BotDecisionInput<WerewolfPlayerView>,
): BotPromptContext<WerewolfAction> | null {
  const { view, playerId } = input;
  const me = view.me;
  if (!me || me.forfeited || view.phase === 'game_over') return null;
  const brief = roleBrief(me.role);
  const header = `你是${seatName(view, playerId)}，身份是${ROLE_NAMES[me.role]}。当前第 ${view.day} 天，场上：${board(view, playerId)}。`;
  const others = aliveOthers(view, playerId);

  switch (view.phase) {
    case 'role_reveal':
      return me.confirmedRole
        ? null
        : {
            roleBrief: brief,
            situation: `${header}\n请确认你已经看清身份。`,
            options: [{ id: 'confirm', label: '确认身份', action: { type: 'confirm_role' } }],
          };

    case 'night': {
      if (!me.alive) return null;
      if (me.role === 'wolf' && !me.hasNightVoted) {
        const targets = others.filter((player) => !me.wolfTeammateIds.includes(player.playerId));
        if (targets.length === 0) return null;
        return {
          roleBrief: brief,
          situation: `${header}\n狼队友：${me.wolfTeammateIds.map((id) => seatName(view, id)).join('、') || '无'}。提交你本夜锁定的独立击杀票。`,
          options: targetOptions(targets, '投票击杀', (id) => ({ type: 'night_kill', targetPlayerId: id })),
        };
      }
      if (me.role === 'seer' && !me.seerCheckedThisNight) {
        return {
          roleBrief: brief,
          situation: `${header}\n历史查验：${me.seerResults.map((result) => `${seatName(view, result.playerId)}=${result.team === 'wolves' ? '狼人' : '好人'}`).join('、') || '无'}。选择本夜查验目标。`,
          options: targetOptions(others, '查验', (id) => ({ type: 'seer_check', targetPlayerId: id })),
        };
      }
      if (me.role === 'witch' && me.nightVictimId !== null) {
        if (me.witchSaveDecision === null) {
          const victim = seatName(view, me.nightVictimId);
          const options: BotActionOption<WerewolfAction>[] = [
            { id: 'skip_save', label: '不使用解药', action: { type: 'witch_save', save: false } },
          ];
          if (!me.witchSaveUsed && (me.nightVictimId !== playerId || me.witchCanSelfSave)) {
            options.unshift({ id: 'save', label: `使用解药救 ${victim}`, action: { type: 'witch_save', save: true } });
          }
          return { roleBrief: brief, situation: `${header}\n今夜被袭击的是${victim}，决定是否使用解药。`, options };
        }
        if (!me.witchPoisonDecided) {
          const options: BotActionOption<WerewolfAction>[] = [
            { id: 'skip_poison', label: '不使用毒药', action: { type: 'witch_poison', targetPlayerId: null } },
          ];
          if (!me.witchPoisonUsed) {
            options.push(...targetOptions(others, '毒杀', (id) => ({ type: 'witch_poison', targetPlayerId: id })));
          }
          return { roleBrief: brief, situation: `${header}\n你没有在本夜使用解药，决定是否使用毒药。`, options };
        }
      }
      if (me.role === 'guard' && !me.guardDecided) {
        const candidates = others.filter((player) => player.playerId !== me.lastGuardTargetId);
        return {
          roleBrief: brief,
          situation: `${header}\n昨晚守护的是${me.lastGuardTargetId ? seatName(view, me.lastGuardTargetId) : '无人'}（不能连续两夜守同一人）。选择本夜守护目标，也可以跳过。`,
          options: [
            ...targetOptions(candidates, '守护', (id) => ({ type: 'guard_guard', targetPlayerId: id })),
            { id: 'skip_guard', label: '本夜不守人', action: { type: 'guard_guard', targetPlayerId: null } },
          ],
        };
      }
      return null;
    }

    case 'hunter_shot':
      if (me.pendingShoot) {
        return {
          roleBrief: brief,
          situation: `${header}\n你已出局，可以开枪带走一名存活玩家，也可以放弃开枪。`,
          options: [
            ...targetOptions(others, '开枪带走', (id) => ({ type: 'hunter_shoot', targetPlayerId: id })),
            { id: 'skip_shot', label: '放弃开枪', action: { type: 'hunter_shoot', targetPlayerId: null } },
          ],
        };
      }
      return null;

    case 'day_announcement':
      return me.alive && !me.confirmedAnnouncement
        ? {
            roleBrief: brief,
            situation: `${header}\n昨夜死亡：${view.lastNightDeaths.map((id) => seatName(view, id)).join('、') || '无人'}。确认公告后等待全员进入发言。`,
            options: [{ id: 'confirm', label: '确认天亮信息', action: { type: 'confirm_announcement' } }],
          }
        : null;

    case 'discussion':
      return view.currentSpeakerId === playerId
        ? {
            roleBrief: brief,
            situation: `${header}\n轮到你发言，发言内容走聊天通道；这里确认发言结束。`,
            options: [{ id: 'done', label: '结束发言', action: { type: 'finish_speech' } }],
          }
        : null;

    case 'voting':
    case 'runoff_voting': {
      if (!me.alive || me.hasVoted) return null;
      const candidates = others.filter(
        (player) => view.phase !== 'runoff_voting' || view.runoffCandidates.includes(player.playerId),
      );
      return {
        roleBrief: brief,
        situation: `${header}\n${view.phase === 'runoff_voting' ? '加赛投票，只能投给候选人。' : '选择放逐目标，也可以弃票。'}`,
        options: [
          ...targetOptions(candidates, '投票放逐', (id) => ({ type: 'day_vote', targetPlayerId: id })),
          { id: 'abstain', label: '弃票', action: { type: 'day_vote', targetPlayerId: null } },
        ],
      };
    }

    case 'last_words':
      return me.lastWordsPending
        ? {
            roleBrief: brief,
            situation: `${header}\n你已被放逐，发表遗言后结束。`,
            options: [{ id: 'done', label: '结束遗言', action: { type: 'finish_last_words' } }],
          }
        : null;

    case 'vote_result':
      return null;
  }
}
