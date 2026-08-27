/**
 * 谁是卧底的 LLM 决策材料。
 *
 * 设计要点：把玩家视角翻译成自然语言，并枚举全部合法动作。
 * 大模型只从候选项里挑一个 id，因此再怎么胡说也产不出非法动作。
 *
 * 这里是唯一能看到"自己的词"的地方——它属于该机器人的私有视角，
 * 和真人客户端收到的完全一致，不含任何别人的秘密。
 */
import type { BotDecisionInput, BotPromptContext } from '@ldj/shared';
import type { UndercoverAction } from './state.ts';
import type { UndercoverPlayerView } from './views.ts';

/** 席位号对玩家更友好："3 号玩家" 比一串 uuid 好读，也省 token */
function seatName(view: UndercoverPlayerView, playerId: string): string {
  const seat = view.players.find((p) => p.playerId === playerId)?.seat;
  return seat === undefined ? '未知玩家' : `${seat + 1} 号玩家`;
}

function describePlayers(view: UndercoverPlayerView, myId: string): string {
  return view.players
    .map((p) => {
      const tags = [`${p.seat + 1} 号`];
      if (p.playerId === myId) tags.push('你');
      if (!p.alive) {
        tags.push('已淘汰');
        if (p.revealedRole) tags.push(p.revealedRole === 'undercover' ? '身份是卧底' : '身份是平民');
      }
      return tags.join('｜');
    })
    .join('；');
}

/** 上一轮投票结果：给模型一点推理依据，否则它只能瞎猜 */
function describeLastVote(view: UndercoverPlayerView): string {
  const summary = view.lastVoteSummary;
  if (!summary) return '';
  const tally = Object.entries(summary.tally)
    .map(([id, n]) => `${seatName(view, id)} ${n} 票`)
    .join('，');
  switch (summary.outcome) {
    case 'eliminated': {
      const who = summary.eliminatedPlayerId ? seatName(view, summary.eliminatedPlayerId) : '有人';
      const role = summary.eliminatedRole === 'undercover' ? '卧底' : '平民';
      return `上一轮投票（${tally}）：${who} 被淘汰，身份是${role}。`;
    }
    case 'tie':
      return `上一轮投票平票（${tally}），进入加赛。`;
    case 'runoff_tie':
      return `上一轮加赛再次平票（${tally}），无人淘汰。`;
    case 'no_votes':
      return '上一轮全员弃票，无人淘汰。';
  }
}

const ROLE_BRIEF = `你在玩「谁是卧底」。每人拿到一个词，大多数人的词相同（平民），少数人拿到的是相近但不同的词（卧底）。
平民要找出卧底并投票淘汰；卧底要隐藏自己，活到卧底人数不少于平民人数就赢。
你只知道自己的词，不知道自己是平民还是卧底——这需要你从别人的发言里推断。`;

const SPEECH_INSTRUCTION =
  '用 1 到 2 句中文描述你拿到的词的特征或用途，接前面玩家的话茬（附和或质疑）；不要直接说出你的词，也不要点破谁可能是卧底。';

/** 把近期公屏翻译成带席位号的对话记录；没有发言时返回空串 */
function describeRecentChat(
  view: UndercoverPlayerView,
  input: BotDecisionInput<UndercoverPlayerView>,
): string {
  const chat = (input.recentChat ?? []).slice(-12);
  if (chat.length === 0) return '';
  const lines = chat.map((line) =>
    `${line.fromPlayerId ? seatName(view, line.fromPlayerId) : '系统'}：${line.text}`,
  );
  return ['目前大家的发言：', ...lines].join('\n');
}

export function buildUndercoverBotPrompt(
  input: BotDecisionInput<UndercoverPlayerView>,
): BotPromptContext<UndercoverAction> | null {
  const { view, playerId } = input;
  const me = view.me;
  if (!me || !me.alive) return null;

  const header = [
    `你是${seatName(view, playerId)}。你的词是「${me.word ?? '未知'}」。`,
    `当前第 ${view.round} 轮。场上：${describePlayers(view, playerId)}。`,
    describeLastVote(view),
  ]
    .filter(Boolean)
    .join('\n');

  switch (view.phase) {
    case 'word_reveal': {
      if (me.confirmed) return null;
      return {
        roleBrief: ROLE_BRIEF,
        situation: `${header}\n现在是看词阶段，确认后进入发言。`,
        options: [{ id: 'confirm', label: '确认已看到自己的词', action: { type: 'confirm_word' } }],
      };
    }

    case 'speaking': {
      if (view.currentSpeakerId !== playerId) return null;
      // 发言内容走聊天通道，动作本身只是"我说完了"。
      // speech 请求让模型写真正的描述词发言，BotRunner 会先发到公屏再结束发言。
      return {
        roleBrief: ROLE_BRIEF,
        situation: `${header}\n轮到你发言。你需要描述自己的词，但不能直接说出它——说得太具体会暴露卧底身份，说得太模糊会被当成卧底。${
          describeRecentChat(view, input) ? `\n${describeRecentChat(view, input)}` : ''
        }`,
        options: [{ id: 'done', label: '结束我的发言', action: { type: 'finish_speech' } }],
        speech: { maxChars: 120, instruction: SPEECH_INSTRUCTION },
      };
    }

    case 'voting':
    case 'runoff_voting': {
      if (me.hasVoted) return null;
      const runoff = view.phase === 'runoff_voting';
      const targets = view.players
        .filter((p) => p.alive && p.playerId !== playerId)
        .filter((p) => !runoff || view.runoffCandidates.includes(p.playerId));
      if (targets.length === 0) return null;
      const chatBlock = describeRecentChat(view, input);
      return {
        roleBrief: ROLE_BRIEF,
        situation: `${header}\n${
          runoff ? '进入加赛投票，只能投候选人。' : '现在投票淘汰你认为是卧底的人。'
        }结合大家的发言判断谁拿到了不同的词。${chatBlock ? `\n${chatBlock}` : ''}`,
        options: targets.map((p) => ({
          id: p.playerId,
          label: `投票淘汰 ${p.seat + 1} 号玩家`,
          action: { type: 'cast_vote', targetPlayerId: p.playerId },
        })),
      };
    }

    case 'vote_result':
    case 'game_over':
      return null;
  }
}
