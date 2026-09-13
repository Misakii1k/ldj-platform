/**
 * werewolf_platform_open_kill_v1 — LLM 决策材料。
 * 候选动作严格对齐 reduce 合法性（狼可刀任意存活含自己；预言家不能查自己；
 * 女巫无夜袭目标不产候选；守卫不守自己与昨夜目标）。
 *
 * 公屏上下文与阶段化 speech 声明由 BotRunner 的统一装饰层（play.ts 的
 * overlayWerewolfBotPrompt）注入一次，这里只产出核心局面，避免重复叠加。
 */
import type { BotActionOption, BotDecisionInput, BotPromptContext } from '@ldj/shared';
import type { V2Action, V2PlayerView, V2Role } from './types.ts';

const ROLE_NAMES: Record<V2Role, string> = { wolf: '狼人', villager: '村民', seer: '预言家', witch: '女巫', guard: '守卫', hunter: '猎人', idiot: '白痴' };
const seat = (view: V2PlayerView, id: string): string => { const s = view.players.find((p) => p.playerId === id)?.seat; return s === undefined ? '未知玩家' : `${s + 1} 号玩家`; };
const othersAlive = (view: V2PlayerView, pid: string) => view.players.filter((p) => p.alive && p.playerId !== pid);
const targetOptions = (view: V2PlayerView, targets: readonly { playerId: string }[], verb: string, mk: (id: string) => V2Action): BotActionOption<V2Action>[] =>
  targets.map((p) => ({ id: p.playerId, label: `${verb} ${seat(view, p.playerId)}`, action: mk(p.playerId) }));

export function buildV2BotPrompt(input: BotDecisionInput<V2PlayerView>): BotPromptContext<V2Action> | null {
  return buildV2BotPromptCore(input);
}

function buildV2BotPromptCore(input: BotDecisionInput<V2PlayerView>): BotPromptContext<V2Action> | null {
  const { view, playerId } = input;
  const me = view.me;
  if (!me || me.forfeited || view.phase === 'game_over') return null;
  const brief = '你在玩狼人杀（开放夜刀）：狼人夜刀可投任意存活玩家，含自己与同伴；白天通过发言与投票找出狼人。';
  const situation = `你是${seat(view, playerId)}，身份${ROLE_NAMES[me.role]}，第 ${view.day} 天。`;
  switch (view.phase) {
    case 'role_reveal':
      return me.confirmedRole
        ? null
        : { roleBrief: brief, situation, options: [{ id: 'confirm', label: '确认身份', action: { type: 'confirm_role' } }] };
    case 'night': {
      if (!me.alive) return null;
      const others = othersAlive(view, playerId);
      const options: BotActionOption<V2Action>[] = [];
      if (me.role === 'wolf' && !me.hasNightVoted) options.push(...targetOptions(view, view.players.filter((p) => p.alive), '刀', (id) => ({ type: 'night_kill', targetPlayerId: id })));
      if (me.role === 'seer' && !me.seerCheckedThisNight) options.push(...targetOptions(view, others, '查验', (id) => ({ type: 'seer_check', targetPlayerId: id })));
      if (me.role === 'witch') {
        if (me.witchSaveDecision === null) {
          if (me.nightVictimId !== null) {
            options.push({ id: 'save:no', label: '不用解药', action: { type: 'witch_save', save: false } });
            if (me.nightVictimId !== playerId || me.witchCanSelfSave) options.push({ id: 'save:yes', label: '使用解药', action: { type: 'witch_save', save: true } });
          }
        } else if (!me.witchPoisonDecided) {
          options.push({ id: 'poison:none', label: '不用毒药', action: { type: 'witch_poison', targetPlayerId: null } });
          if (!me.witchPoisonUsed) options.push(...targetOptions(view, others, '毒', (id) => ({ type: 'witch_poison', targetPlayerId: id })));
        }
      }
      if (me.role === 'guard' && !me.guardDecided) {
        options.push({ id: 'guard:none', label: '不守人', action: { type: 'guard_guard', targetPlayerId: null } });
        options.push(...targetOptions(view, view.players.filter((p) => p.alive && p.playerId !== me.lastGuardTargetId), '守护', (id) => ({ type: 'guard_guard', targetPlayerId: id })));
      }
      return options.length === 0 ? null : { roleBrief: brief, situation, options };
    }
    case 'hunter_shot':
      return me.pendingShoot
        ? { roleBrief: brief, situation, options: [{ id: 'shoot:none', label: '放弃开枪', action: { type: 'hunter_shoot', targetPlayerId: null } }, ...targetOptions(view, othersAlive(view, playerId), '开枪带走', (id) => ({ type: 'hunter_shoot', targetPlayerId: id }))] }
        : null;
    case 'day_announcement':
      return me.alive && !me.confirmedAnnouncement
        ? { roleBrief: brief, situation, options: [{ id: 'confirm', label: '确认天亮信息', action: { type: 'confirm_announcement' } }] }
        : null;
    case 'discussion':
      return view.currentSpeakerId === playerId
        ? { roleBrief: brief, situation, options: [{ id: 'speech', label: '结束发言', action: { type: 'finish_speech' } }] }
        : null;
    case 'free_discussion':
      return me.alive && !me.hasReadiedVote
        ? { roleBrief: brief, situation, options: [{ id: 'ready_vote', label: '准备进入投票', action: { type: 'ready_vote' } }] }
        : null;
    case 'voting':
    case 'runoff_voting': {
      if (!me.alive || me.idiotRevealed || me.hasVoted) return null;
      if (view.phase === 'runoff_voting' && view.runoffCandidates.includes(playerId)) return null;
      const candidates = view.players.filter((p) => p.alive && p.playerId !== playerId && !p.idiotRevealed && (view.phase !== 'runoff_voting' || view.runoffCandidates.includes(p.playerId)));
      return {
        roleBrief: brief,
        situation,
        options: [
          { id: 'abstain', label: '弃票', action: { type: 'day_vote', targetPlayerId: null } },
          ...targetOptions(view, candidates, '投给', (id) => ({ type: 'day_vote', targetPlayerId: id })),
        ],
      };
    }
    case 'last_words':
      return me.lastWordsPending
        ? { roleBrief: brief, situation, options: [{ id: 'done', label: '结束遗言', action: { type: 'finish_last_words' } }] }
        : null;
    default:
      return null;
  }
}
