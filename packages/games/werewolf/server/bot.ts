/**
 * 狼人杀机器人策略（测试用陪练）。
 *
 * 夜晚：狼随机杀一个非狼、预言家随机查一个没查过的人、女巫不救也不毒
 * （不救不毒是刻意的——女巫用药后夜晚流程分支更多，陪练先保证流程能往下走）。
 * 白天：确认信息、轮到就结束发言、投票随机投一个非自己的存活者。
 */
import type { BotDecisionInput } from '@ldj/shared';
import type { WerewolfAction, WerewolfPlayerView } from './module.ts';

/** 存活且不是自己的玩家 */
function otherAliveIds(view: WerewolfPlayerView, selfId: string): string[] {
  return view.players.filter((p) => p.alive && p.playerId !== selfId).map((p) => p.playerId);
}

function pickRandom(ids: readonly string[], random: BotDecisionInput<unknown>['random']): string | null {
  if (ids.length === 0) return null;
  return ids[random.nextInt(0, ids.length)]!;
}

export function pickWerewolfBotAction(
  input: BotDecisionInput<WerewolfPlayerView>,
): WerewolfAction | null {
  const { view, playerId, random } = input;
  const me = view.me;
  if (!me || !me.alive || view.phase === 'game_over') return null;

  switch (view.phase) {
    case 'night': {
      if (me.role === 'wolf') {
        // 狼队友不能杀；击杀目标由狼队任一成员提交即可，重复提交会被 reduce 覆盖
        const targets = otherAliveIds(view, playerId).filter(
          (id) => !me.wolfTeammateIds.includes(id),
        );
        const target = pickRandom(targets, random);
        return target ? { type: 'night_kill', targetPlayerId: target } : null;
      }
      if (me.role === 'seer') {
        // 已查验过的夜晚不再出手（reduce 会拒绝，白提交一次日志噪音）
        if (me.seerResult !== null) return null;
        const target = pickRandom(otherAliveIds(view, playerId), random);
        return target ? { type: 'seer_check', targetPlayerId: target } : null;
      }
      if (me.role === 'witch') {
        // 先答解药、再答毒药：两个决定都做完夜晚才算完整（nightComplete）
        if (!me.witchSaveUsed && me.nightVictimId !== null) {
          return { type: 'witch_save', save: false };
        }
        return { type: 'witch_poison', targetPlayerId: null };
      }
      return null; // 村民夜晚无动作
    }

    case 'day_announcement':
      return { type: 'finish_speech' };

    case 'discussion':
      return view.currentSpeakerId === playerId ? { type: 'finish_speech' } : null;

    case 'voting': {
      const target = pickRandom(otherAliveIds(view, playerId), random);
      return target ? { type: 'day_vote', targetPlayerId: target } : null;
    }

    default:
      return null;
  }
}
