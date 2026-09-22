/**
 * 奶酪大盗演出事件推导（纯函数，可单测）。
 *
 * 唯一事实源是服务端视角的差分：本地永不预测成功。
 * 夜幕、天亮、开票一律看 phase / votes / thiefCaught 的变化，
 * 而不是看用户点了按钮。
 *
 * 这款一局只有一轮（无 round 字段），阶段线性推进：
 * hour_choice → night → accomplice_select → dawn → vote → game_over。
 */
import type { CheeseThiefPlayerView } from '../types.ts';

export type StageEvent =
  /** 夜幕降临：暗角压下 */
  | { kind: 'nightFell' }
  /** 拉同伙阶段 */
  | { kind: 'accompliceStarted' }
  /** 天亮：暗角散去 */
  | { kind: 'dawnBroke' }
  /** 进入投票 */
  | { kind: 'voteStarted' }
  /** 开票：票从各席位飞向得票最多者 */
  | { kind: 'voteResolved'; accusedId: string | null; voterIds: string[] }
  /** 终局揭晓（three.js 奶酪结算已有，这里只负责去重防重播） */
  | { kind: 'gameOver' };

/**
 * 一次性演出的去重键。
 * 一局一轮，所以键不带轮次——roundToken 已经把整局隔离开了。
 * 返回 null 表示每次都播（纯音效、无时间线的轻量反馈）。
 */
export function stageEventKey(event: StageEvent): string | null {
  switch (event.kind) {
    case 'nightFell':
      return 'night';
    case 'dawnBroke':
      return 'dawn';
    case 'voteResolved':
      return 'vote';
    case 'gameOver':
      // 终局揭晓最需要防重播：演到一半刷新不能重演一次
      return 'over';
    case 'accompliceStarted':
    case 'voteStarted':
      return null;
  }
}

/**
 * 本轮标识。
 *
 * 一局一轮，用玩家名单做 token 即可把不同对局的记忆隔离开；
 * 同一局内刷新重连读到的是同一个 token，所以已播过的演出不会重播。
 */
export function roundTokenOf(view: CheeseThiefPlayerView): string {
  return `ct:${view.players.join(',')}`;
}

/** 从票面统计出得票最多者；平票取第一个（只用于演出落点，不影响判定）。 */
function topVoted(votes: CheeseThiefPlayerView['votes']): string | null {
  if (!votes) return null;
  const tally: Record<string, number> = {};
  for (const vote of Object.values(votes)) {
    const target = typeof vote === 'string' ? vote : (vote as { targetPlayerId?: string }).targetPlayerId;
    if (!target) continue;
    tally[target] = (tally[target] ?? 0) + 1;
  }
  let best: string | null = null;
  let max = 0;
  for (const [id, count] of Object.entries(tally)) {
    if (count > max) {
      max = count;
      best = id;
    }
  }
  return best;
}

export function deriveStageEvents(
  prev: CheeseThiefPlayerView,
  next: CheeseThiefPlayerView,
): StageEvent[] {
  const events: StageEvent[] = [];

  if (prev.phase !== 'night' && next.phase === 'night') {
    events.push({ kind: 'nightFell' });
  }
  if (prev.phase !== 'accomplice_select' && next.phase === 'accomplice_select') {
    events.push({ kind: 'accompliceStarted' });
  }
  if (prev.phase !== 'dawn' && next.phase === 'dawn') {
    events.push({ kind: 'dawnBroke' });
  }
  if (prev.phase !== 'vote' && next.phase === 'vote') {
    events.push({ kind: 'voteStarted' });
  }

  // 开票：thiefCaught 从未定变成有值即代表投票已结算
  if (prev.thiefCaught === null && next.thiefCaught !== null) {
    events.push({
      kind: 'voteResolved',
      // 投票者与落点取开票前那一刻的票面，服务端结算后不会再改
      accusedId: topVoted(prev.votes) ?? topVoted(next.votes),
      voterIds: Object.keys(prev.votes ?? next.votes ?? {}),
    });
  }

  if (prev.phase !== 'game_over' && next.phase === 'game_over') {
    events.push({ kind: 'gameOver' });
  }

  return events;
}
