/**
 * 法庭旁听长椅：左右两排席位卡 + 座位分边纯函数。
 *
 * 像素参照：docs/ui-preview/echo-judge/directions/B-courtroom.css（.pew / .seat）。
 * 席位分边规则（计划 T1）：从审判长下家开始的发言顺序，前 ⌈n/2⌉ 在左，其余在右。
 */
import type { ReactNode } from 'react';
import { RollingNumber } from '../../../shared-ui/RollingNumber.tsx';

/** 参照稿 _shared.js 的玩家配色（去掉 #f7c84b——黄色按 C8 只给发言人外框/话筒/「你」徽章） */
const SEAT_PALETTE = ['#f29a7a', '#9cc7f0', '#8fd3b6', '#f6b7cf', '#b9a4e6', '#f0b35c', '#c9e27a', '#7fd1d8'];

/** 按玩家在 players 里的座次取色（确定性，刷新不变） */
export function seatColorOf(players: readonly string[], playerId: string): string {
  const idx = players.indexOf(playerId);
  return SEAT_PALETTE[(idx < 0 ? 0 : idx) % SEAT_PALETTE.length]!;
}

/**
 * 发言顺序（座位分边用）：从审判长下家开始绕场一周。
 * 注意这只是「座位怎么摆」；发言进度（谁先说完）以服务端 players 数组顺序为准。
 */
export function rotatedSpeakingOrder(players: readonly string[], judgeId: string): string[] {
  const idx = players.indexOf(judgeId);
  if (idx < 0) return players.filter((id) => id !== judgeId);
  const order: string[] = [];
  for (let k = 1; k < players.length; k += 1) {
    order.push(players[(idx + k) % players.length]!);
  }
  return order;
}

/** 左右分边：前 ⌈n/2⌉ 左排，其余右排 */
export function splitPews(players: readonly string[], judgeId: string): { left: string[]; right: string[] } {
  const order = rotatedSpeakingOrder(players, judgeId);
  const half = Math.ceil(order.length / 2);
  return { left: order.slice(0, half), right: order.slice(half) };
}

/**
 * 已发言集合（状态用）：与服务端 answerOrder 同形态（players 数组顺序去掉审判长），
 * 前 answeredCount 位已说完。
 */
export function answeredSeatIds(players: readonly string[], judgeId: string, answeredCount: number): ReadonlySet<string> {
  const order = players.filter((id) => id !== judgeId);
  return new Set(order.slice(0, Math.max(0, answeredCount)));
}

export type VerdictMark = 'caught' | 'wrong' | 'escaped';

export interface CourtSeatModel {
  readonly id: string;
  /** 座位号章（players 数组顺序，从 1 起） */
  readonly seatNo: number;
  readonly name: string;
  readonly color: string;
  /** 当前展示的分数（宣判演出中由调用方决定给旧值还是新值） */
  readonly score: number;
  readonly status: string;
  readonly isMe: boolean;
  readonly isSpeaking: boolean;
  /** 已发言：席位 62% 透明 */
  readonly isDone: boolean;
}

export interface CourtSeatCardProps {
  readonly seat: CourtSeatModel;
  /** 审判阶段：审判长点席位的临时指认（只有审判长自己看得到） */
  readonly accused?: boolean;
  /** 宣判翻面结果（caught 伪人 / wrong 人类 / escaped 逃脱） */
  readonly verdictMark?: VerdictMark | null;
  /** 宣判后挂的分差小牌（+2 / −1）；null 不显示 */
  readonly delta?: number | null;
  /** 终局暗号（只有 game_over 从 reveal.triggerWords 取，其余时刻一律不传） */
  readonly triggerWord?: string | null;
  /** 审判长视角可点 */
  readonly onClick?: (() => void) | null;
}

const VERDICT_STAMP: Record<VerdictMark, string> = {
  caught: '伪 人',
  wrong: '人 类',
  escaped: '逃 脱',
};

/** 头像剪影：统一人形，按玩家色填充（参照 _shared.js 的 BUST） */
export function SeatBust() {
  return (
    <svg className="ej-bust" viewBox="0 0 80 80" aria-hidden="true">
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

export function CourtSeatCard({ seat, accused = false, verdictMark = null, delta = null, triggerWord = null, onClick = null }: CourtSeatCardProps) {
  const classNames = ['ej-seat'];
  if (seat.isMe) classNames.push('is-me');
  if (seat.isSpeaking) classNames.push('is-speaking');
  if (seat.isDone) classNames.push('is-done');
  if (accused) classNames.push('is-accused');
  if (verdictMark) classNames.push(`is-${verdictMark}`);

  const inner: ReactNode = (
    <>
      <span className="ej-seat__no" aria-hidden="true">{seat.seatNo}</span>
      <div className="ej-seat__av" style={{ color: seat.color }}>
        <SeatBust />
      </div>
      <div className="ej-seat__nm">
        {seat.name}
        {seat.isMe && <em className="ej-seat__you">你</em>}
      </div>
      <div className="ej-seat__st">{seat.status}</div>
      <div className="ej-seat__sc">
        <RollingNumber value={seat.score} />
      </div>
      {verdictMark && (
        <span className={`ej-seat__idstamp ej-seat__idstamp--${verdictMark}`}>{VERDICT_STAMP[verdictMark]}</span>
      )}
      {delta !== null && delta !== 0 && (
        <span className={`ej-seat__delta ${delta > 0 ? 'is-plus' : 'is-minus'}`}>
          {delta > 0 ? '+' : '−'}{Math.abs(delta)}
        </span>
      )}
      {triggerWord && <span className="ej-seat__word">暗号「{triggerWord}」</span>}
      <span className="ej-seat__mic" data-seat-mic={seat.id} aria-hidden="true" />
    </>
  );

  const style = { ['--seat-c' as string]: seat.color };
  if (onClick) {
    return (
      <button
        type="button"
        className={classNames.join(' ')}
        style={style}
        data-player-id={seat.id}
        onClick={onClick}
        aria-pressed={accused}
      >
        {inner}
      </button>
    );
  }
  return (
    <div className={classNames.join(' ')} style={style} data-player-id={seat.id}>
      {inner}
    </div>
  );
}

export interface CourtPewProps {
  readonly side: 'left' | 'right';
  readonly seats: readonly CourtSeatModel[];
  readonly accusedIds?: ReadonlySet<string>;
  readonly verdictMarks?: Readonly<Record<string, VerdictMark>>;
  readonly deltas?: Readonly<Record<string, number | null>>;
  readonly triggerWords?: Readonly<Record<string, string | null>>;
  readonly onSeatClick?: ((playerId: string) => void) | null;
}

export function CourtPew({ side, seats, accusedIds, verdictMarks, deltas, triggerWords, onSeatClick }: CourtPewProps) {
  return (
    <div className={`ej-pew ej-pew--${side}`} data-pew={side}>
      {seats.map((seat) => (
        <CourtSeatCard
          key={seat.id}
          seat={seat}
          accused={accusedIds?.has(seat.id) ?? false}
          verdictMark={verdictMarks?.[seat.id] ?? null}
          delta={deltas?.[seat.id] ?? null}
          triggerWord={triggerWords?.[seat.id] ?? null}
          onClick={onSeatClick ? () => onSeatClick(seat.id) : null}
        />
      ))}
    </div>
  );
}
