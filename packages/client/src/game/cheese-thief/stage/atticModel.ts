/**
 * 奶酪大盗「阁楼世界」纯函数模型（可单测，不碰 DOM）。
 *
 * 视觉契约：docs/plans/2026-09-29-cheese-thief-visual/README.md §1。
 * 像素参照：docs/ui-preview/cheese-thief/directions/（B2 / S2 / S3 / S4 定稿）。
 *
 * 唯一事实源是服务端视角；本文件只做「视角 → 画面状态」的纯推导。
 */
import type { CheeseThiefPlayerView, CheeseThiefReveal, Vote } from '../types.ts';

type PlayerView = CheeseThiefPlayerView;

/* ── 昼夜 ─────────────────────────────────────────────────── */

export type AtticTime = 'night' | 'day';

/** hour_choice / night / accomplice_select = 夜；dawn / vote / game_over = 昼。 */
export function atticTimeFor(phase: PlayerView['phase']): AtticTime {
  return phase === 'hour_choice' || phase === 'night' || phase === 'accomplice_select' ? 'night' : 'day';
}

/* ── 席位分列与老鼠色 ─────────────────────────────────────── */

/** 左列 = 前 ceil(n/2) 个，右列 = 其余（照 _shared.js 的 place 逻辑）。 */
export function splitSeats(players: readonly string[]): { left: string[]; right: string[] } {
  const leftCount = Math.ceil(players.length / 2);
  return { left: players.slice(0, leftCount), right: players.slice(leftCount) };
}

/**
 * 老鼠色：「你」固定 m1（黄），其他人按座次顺序取 m2…m8。
 * 返回 1–8 的下标，配合 CSS 变量 --ct-m1..--ct-m8 使用。
 */
export function seatToneIndex(players: readonly string[], playerId: string, myId: string | null): number {
  if (playerId === myId) return 1;
  let tone = 2;
  for (const id of players) {
    if (id === playerId) return tone;
    if (id !== myId) tone += 1;
  }
  return tone;
}

/* ── 夜间：醒来集合与奶酪可见性口径（契约 §1.2） ───────────── */

/** 夜里的醒来高亮只给我自己 + 我的同醒者；别人的时刻是隐藏信息，谁也不标。 */
export function awakeSeatIds(view: PlayerView, myId: string | null): ReadonlySet<string> {
  const me = view.me;
  if (view.phase !== 'night' || !me || !myId) return new Set();
  if (view.currentHour < 1 || me.wakeHour !== view.currentHour) return new Set();
  return new Set([myId, ...me.coWakers]);
}

export type CheeseSight = 'on-board' | 'missing' | 'with-me';

/**
 * 玩家端夜间的奶酪渲染口径（不随 cheeseStolen 实时翻，否则泄露「几点被偷」）：
 * - 还没轮到我：按「在砧板上」渲染（我还不知道）；
 * - 正在醒来：真实状态；
 * - 醒过了：冻结在我醒来时所见（cheeseWasMissing / isThief）。
 * 天亮后（dawn 起）与观战者/大屏：按公开真实状态。
 */
export function cheeseSightFor(view: PlayerView, myId: string | null): CheeseSight {
  const me = view.me;
  if (view.phase === 'night') {
    if (!me || !myId) {
      // 观战者 / 大屏：桌面语义，实时公开
      return view.cheeseStolen ? 'missing' : 'on-board';
    }
    if (view.currentHour < 1 || me.wakeHour > view.currentHour) return 'on-board';
    if (me.wakeHour === view.currentHour) {
      if (!view.cheeseStolen) return 'on-board';
      return me.isThief ? 'with-me' : 'missing';
    }
    // 已醒过：冻结记忆
    if (me.isThief) return 'with-me';
    return me.cheeseWasMissing ? 'missing' : 'on-board';
  }
  // 天亮以后：真实状态（奶酪在谁手里由席位卡的 seat-loot 表达）
  if (!view.cheeseStolen) return 'on-board';
  return me?.isThief ? 'with-me' : 'missing';
}

/** 自动偷（用户定稿：没有「偷走奶酪」按钮）：独醒且奶酪在场 → 客户端应自动发 steal_cheese。 */
export function isAutoStealDue(view: PlayerView, myId: string | null): boolean {
  const me = view.me;
  if (view.phase !== 'night' || !me || !myId) return false;
  if (view.currentHour < 1 || me.wakeHour !== view.currentHour) return false;
  return !view.cheeseStolen && me.coWakers.length === 0;
}

/* ── ① 夜里醒来：告示牌 / 说明胶囊文案 ────────────────────── */

export interface NightNotice {
  readonly when: string;
  readonly title: string;
  readonly caption: string;
}

export function nightNotice(
  view: PlayerView,
  myId: string | null,
  nameOf: (id: string) => string,
): NightNotice {
  const me = view.me;
  const hour = view.currentHour;
  if (hour < 1) {
    return { when: '入夜', title: '记住你的点数', caption: '天黑了，看好自己的骰盅' };
  }
  const when = `夜晚 · 第 ${hour} 点`;
  const awake = Boolean(me && myId && me.wakeHour === hour);
  if (!awake) {
    const slept = me && me.wakeHour >= 1 && me.wakeHour < hour;
    return {
      when,
      title: '夜深了……',
      caption: slept ? '你醒过了，继续装睡' : '闭眼装睡，轮到你的一刻才睁眼',
    };
  }
  if (me!.coWakers.length > 0) {
    return {
      when,
      title: '你们同时醒来了',
      caption: `看见了 ${me!.coWakers.map(nameOf).join('、')}，众目睽睽，无事发生`,
    };
  }
  if (me!.isThief) {
    return { when, title: '奶酪到手，别出声', caption: '' };
  }
  if (view.cheeseStolen || me!.cheeseWasMissing) {
    return { when, title: '奶酪不见了！', caption: '砧板上空空如也——可以偷看一人的骰子' };
  }
  return { when, title: '你独自醒来了', caption: '月光下，奶酪还在砧板上' };
}

/* ── ③ 投票：已投集合与（终局后的）票数统计 ───────────────── */

/** 投票中的「已投」名单：只用键集合，不看投向（隐私红线）。 */
export function votedSeatIds(view: PlayerView): ReadonlySet<string> {
  return new Set(Object.keys(view.votes ?? {}));
}

export interface VoteStats {
  readonly counts: Readonly<Record<string, number>>;
  readonly maxVotes: number;
  /** 并列最高票全部出局；全弃票 / 无人得票则空（rules.ts 口径）。 */
  readonly eliminated: readonly string[];
}

/** 仅 game_over 后调用（votes 此时才公开）。 */
export function voteStats(view: PlayerView): VoteStats {
  const counts: Record<string, number> = {};
  for (const vote of Object.values(view.votes ?? {}) as Vote[]) {
    if (vote.kind === 'accuse') counts[vote.targetPlayerId] = (counts[vote.targetPlayerId] ?? 0) + 1;
  }
  const maxVotes = Math.max(0, ...view.players.map((id) => counts[id] ?? 0));
  const eliminated = maxVotes === 0 ? [] : view.players.filter((id) => (counts[id] ?? 0) === maxVotes);
  return { counts, maxVotes, eliminated };
}

/* ── ④ 揭晓：三结局文案与时间线 ───────────────────────────── */

export interface VerdictCopy {
  readonly when: string;
  readonly title: string;
}

export function verdictCopy(view: PlayerView): VerdictCopy {
  if (view.thiefCaught === true) return { when: '大盗被投出', title: '村民胜！' };
  if (view.reveal?.thiefId) return { when: '投错了人', title: '大盗胜！' };
  return { when: '没人偷走奶酪', title: '平安夜！' };
}

export type TimelineKind = 'none' | 'multi' | 'steal' | 'peek' | 'solo';

export interface TimelineRow {
  readonly hour: number;
  readonly names: readonly string[];
  readonly kind: TimelineKind;
  readonly label: string;
}

const TIMELINE_LABEL: Record<TimelineKind, string> = {
  none: '没人醒',
  multi: '同醒·互相看见',
  steal: '独醒·偷走奶酪',
  peek: '独醒·偷看骰子',
  solo: '独醒',
};

/** 时间线小条：6 列，数据全部来自 reveal（仅 game_over）。skip_peek 记的是 target=自己，不算偷看。 */
export function timelineRows(
  reveal: CheeseThiefReveal,
  players: readonly string[],
  nameOf: (id: string) => string,
): TimelineRow[] {
  const peeked = new Set(reveal.peeks.filter((p) => p.viewer !== p.target).map((p) => p.viewer));
  const rows: TimelineRow[] = [];
  for (let hour = 1; hour <= 6; hour += 1) {
    const ids = players.filter((id) => reveal.wakeHours[id] === hour);
    let kind: TimelineKind = 'none';
    if (ids.length > 1) kind = 'multi';
    else if (ids.length === 1) {
      if (hour === reveal.stealHour) kind = 'steal';
      else if (peeked.has(ids[0]!)) kind = 'peek';
      else kind = 'solo';
    }
    rows.push({ hour, names: ids.map(nameOf), kind, label: TIMELINE_LABEL[kind] });
  }
  return rows;
}
