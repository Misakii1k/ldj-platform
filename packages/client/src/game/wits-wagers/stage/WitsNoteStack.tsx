import { breakdownNotes, type ChipId, type NoteDenomination } from '../types.ts';
import { WitsBanknote } from './WitsBanknote.tsx';

export interface WitsNoteStackProps {
  /** 基础筹码：一张带 A/B 角标的 100 元钞（官方规则里永久筹码 = 最小计分单位） */
  readonly badge?: ChipId | null;
  /** 附加注的积分数，会拆成具体面值 */
  readonly extraStake?: number;
  /** 单张钞票宽度（px） */
  readonly noteWidth?: number;
  readonly pending?: boolean;
  readonly className?: string;
}

/** 超过这个张数就折叠，否则小屏上一叠钞票能盖掉半张牌 */
const MAX_VISIBLE = 5;

/**
 * 桌上的一叠钞票。
 *
 * 扇形错开叠放，而不是整齐码成一摞——真钞票被人随手按在桌上就是歪的，
 * 而且错开后能看出张数。张数太多时只画前几张，剩下的用「×N」角标交代。
 */
export function WitsNoteStack({
  badge = null,
  extraStake = 0,
  noteWidth = 40,
  pending = false,
  className = '',
}: WitsNoteStackProps) {
  const extraNotes = breakdownNotes(extraStake);
  const notes: Array<{ denom: NoteDenomination; badge: ChipId | null }> = [
    ...(badge ? [{ denom: 100 as NoteDenomination, badge }] : []),
    ...extraNotes.map((denom) => ({ denom, badge: null })),
  ];

  if (notes.length === 0) return null;

  const visible = notes.slice(0, MAX_VISIBLE);
  const hidden = notes.length - visible.length;

  return (
    <span
      className={`ww-note-stack ${pending ? 'ww-note-stack--pending' : ''} ${className}`.trim()}
      data-ww-notes={notes.length}
      style={{ width: noteWidth, height: Math.round(noteWidth * 0.53) }}
      aria-label={
        badge
          ? `筹码 ${badge}${extraStake > 0 ? `，附加 ${extraStake} 分` : ''}`
          : `附加 ${extraStake} 分`
      }
    >
      {visible.map((note, index) => (
        <span
          key={`${note.denom}-${index}`}
          className="ww-note-stack__item"
          style={{
            // 每张往上叠 2px、左右错开、角度交替，形成手按出来的扇形
            ['--ww-note-i' as string]: String(index),
            ['--ww-note-rot' as string]: `${(index % 2 === 0 ? -1 : 1) * (3 + index * 2)}deg`,
            ['--ww-note-dx' as string]: `${((index % 3) - 1) * 3}px`,
          }}
        >
          <WitsBanknote denomination={note.denom} badge={note.badge} width={noteWidth} pending={pending} />
        </span>
      ))}
      {hidden > 0 && <span className="ww-note-stack__more">×{notes.length}</span>}
    </span>
  );
}
