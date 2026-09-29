/**
 * 谁是狱警 · 档案室道具与纯视图模型。
 *
 * 纯函数（build*）被 packages/client/tests/nightTestimonyStage.test.ts 直接单测：
 * - 全员答完前，答题格的模型里只有「已答」布尔，绝不含 yes/no（隐私红线）；
 * - 猜罪期间（wardenGuesses 未下发）模型里不出现任何囚犯真罪行。
 */
import type { ReactNode } from 'react';
import { CRIME_META, crimeName, type CrimeId, type NightTestimonyPlayerView } from '../types.ts';

/** 参照稿的固定席位配色（按座次循环）。 */
export const SEAT_COLORS = ['#f29a7a', '#f7c84b', '#8fd3b6', '#9cc7f0', '#f6b7cf', '#b9a4e6'] as const;

export function seatColor(seatIndex: number): string {
  return SEAT_COLORS[seatIndex % SEAT_COLORS.length]!;
}

/** 参照稿的囚号编号规则：#007 起，每座 +11。 */
export function inmateNo(seatIndex: number): string {
  return String(7 + seatIndex * 11).padStart(3, '0');
}

/** 证件照人形剪影（玩家色填充）。 */
export function BustSvg(): ReactNode {
  return (
    <svg className="nt-bust" viewBox="0 0 80 80" aria-hidden="true">
      <path
        d="M8 80 C8 58 22 50 40 50 C58 50 72 58 72 80 Z"
        fill="currentColor"
        stroke="var(--game-ink)"
        strokeWidth="3.5"
        strokeLinejoin="round"
      />
      <circle cx="40" cy="30" r="17" fill="currentColor" stroke="var(--game-ink)" strokeWidth="3.5" />
    </svg>
  );
}

/** 告示牌（奶油卡纸 + 墨线 + 硬投影）。 */
export function NoticeBoard({
  title,
  sub,
  tone,
  className,
}: {
  title: ReactNode;
  sub?: ReactNode;
  tone?: 'plain' | 'danger' | 'ok' | 'warden';
  className?: string;
}): ReactNode {
  return (
    <div className={`nt-notice${tone ? ` nt-notice--${tone}` : ''}${className ? ` ${className}` : ''}`}>
      <div className="nt-notice__title">{title}</div>
      {sub ? <div className="nt-notice__sub">{sub}</div> : null}
    </div>
  );
}

/** 「嫌 疑」红封条。 */
export function SealTape({ className }: { className?: string }): ReactNode {
  return <span className={`nt-seal-tape${className ? ` ${className}` : ''}`}>嫌 疑</span>;
}

/* ── 答题格视图模型（隐私红线见文件头） ───────────────────── */

export interface AnswerCellModel {
  readonly playerId: string;
  /** empty = 未答；stamped = 已答但未翻开；yes/no = 已翻开 */
  readonly state: 'empty' | 'stamped' | 'yes' | 'no';
}

/**
 * 答题格模型。
 *
 * flipRecord 为 null（问答进行中）时：只输出「谁已答」，绝不输出 yes/no——
 * 即使服务端视角里已经带着别人的答案，渲染模型也不读它。
 * flipRecord 非 null（该题已归档、答案公开）时：输出真实答案用于同时翻开。
 */
export function buildAnswerCells(
  view: NightTestimonyPlayerView,
  flipRecord: { answers: Record<string, 'yes' | 'no'> } | null,
): AnswerCellModel[] {
  return view.players.map((playerId) => {
    if (flipRecord) {
      const ans = flipRecord.answers[playerId];
      return { playerId, state: ans === 'yes' ? 'yes' : ans === 'no' ? 'no' : 'empty' };
    }
    const answered = view.currentQuestion?.answers[playerId] !== undefined;
    return { playerId, state: answered ? 'stamped' : 'empty' };
  });
}

/* ── 猜罪板视图模型 ─────────────────────────────────────── */

export interface GuessSlotModel {
  readonly playerId: string;
  /** locked = 已自告预贴；filled = 狱警已贴；empty = 待贴 */
  readonly state: 'locked' | 'filled' | 'empty';
  /** 标签上的罪行名；empty 时为占位文案 */
  readonly text: string;
  /** 核对章：提交后逐袋落下 */
  readonly mark: 'ok' | 'bad' | null;
  /** 核对为错时露出的真罪行（仅核对阶段） */
  readonly truth: string | null;
}

export interface GuessBoardModel {
  /** 候选罪行标签池（已排序，含 1 张干扰项） */
  readonly pool: readonly CrimeId[];
  /** 已被贴掉的标签（在池里变灰） */
  readonly used: ReadonlySet<CrimeId>;
  /** 每名囚犯一个标签位 */
  readonly slots: Readonly<Record<string, GuessSlotModel>>;
  /** 已贴 / 应贴总数（不含狱警自己） */
  readonly filledCount: number;
  readonly inmateCount: number;
}

/**
 * 猜罪板模型。
 *
 * 隐私红线：wardenGuesses 未下发（猜罪进行中）时，输出里不含任何囚犯的真实罪行——
 * 已自告者的罪行来自公开字段 revealedIdentities，不算泄露。
 * checkProgress：核对动画进度（已核对只数）；null = 全部一次性显示（低动效档/刷新重连）。
 */
export function buildGuessBoard(
  view: NightTestimonyPlayerView,
  wardenId: string | null,
  localGuesses: Readonly<Record<string, CrimeId>>,
  checkProgress: number | null,
  viewerIsWarden = true,
): GuessBoardModel {
  const pool = view.availableGuessCrimes ?? [];
  const wardenGuesses = view.reveal?.wardenGuesses ?? null;
  const revealed = wardenGuesses !== null;

  const inmates = view.players.filter((id) => id !== wardenId);
  const used = new Set<CrimeId>();
  const slots: Record<string, GuessSlotModel> = {};
  let filledCount = 0;

  inmates.forEach((id, inmateIndex) => {
    const exposedCrime = view.revealedIdentities[id];
    const isExposed = Boolean(exposedCrime && exposedCrime !== 'warden');

    // 核对章与真罪行只在提交后出现；checkProgress 控制逐袋落下
    let mark: 'ok' | 'bad' | null = null;
    let truth: string | null = null;
    if (revealed) {
      const actual = view.reveal?.crimes[id];
      const guess = wardenGuesses[id];
      const checked = checkProgress === null || inmateIndex < checkProgress;
      if (checked) {
        mark = guess !== undefined && actual !== undefined && guess === actual ? 'ok' : 'bad';
        if (mark === 'bad' && actual) truth = crimeName(actual);
      }
    }

    let state: GuessSlotModel['state'] = 'empty';
    let text = viewerIsWarden ? '贴罪行' : '待贴';
    if (isExposed) {
      state = 'locked';
      text = crimeName(exposedCrime);
      filledCount += 1;
    } else if (revealed) {
      const guess = wardenGuesses[id];
      if (guess) {
        state = 'filled';
        text = crimeName(guess);
        used.add(guess);
        filledCount += 1;
      }
    } else {
      const local = localGuesses[id];
      if (local) {
        state = 'filled';
        text = crimeName(local);
        used.add(local);
        filledCount += 1;
      }
    }

    slots[id] = { playerId: id, state, text, mark, truth };
  });

  return { pool, used, slots, filledCount, inmateCount: inmates.length };
}

/** 罪行中文名（CRIME_META 直通，未知 key 兜底）。 */
export function crimeLabel(crime: CrimeId): string {
  return CRIME_META[crime]?.name ?? crime;
}
