import type { BellClashCard, CardColor } from '../types.ts';

const COLOR_LABELS: Record<CardColor, string> = {
  red: '红',
  yellow: '黄',
  green: '绿',
  blue: '蓝',
};

export function colorLabel(color: CardColor | null | undefined): string {
  if (!color) return '无';
  return COLOR_LABELS[color] ?? color;
}

export function cardLabel(card: BellClashCard): string {
  return card.kind === 'number'
    ? `${COLOR_LABELS[card.color]} ${card.number}`
    : `${COLOR_LABELS[card.color]}·「${card.phrase}」`;
}

export interface PhraseCardProps {
  readonly card: BellClashCard;
  /** 弃牌堆顶：比手牌里的大一号 */
  readonly isTop?: boolean;
}

/**
 * 口令卡（UNO 风格）。
 *
 * 四角「口令」角标 + 倾斜白椭圆 + 中心短语。牌面语义色（红黄绿蓝）
 * 不是主题色，不受「一款一个 accent」约束。
 */
export function PhraseCard({ card, isTop = false }: PhraseCardProps) {
  const isPhrase = card.kind === 'phrase';
  return (
    <div className="bc-phrase" data-color={card.color} data-top={isTop ? 'true' : undefined}>
      <span className="bc-phrase__corner bc-phrase__corner--tl" aria-hidden="true">口令</span>
      <span className="bc-phrase__corner bc-phrase__corner--br" aria-hidden="true">口令</span>
      <span className="bc-phrase__oval" aria-hidden="true" />
      <span className="bc-phrase__text">{isPhrase ? card.phrase : card.number}</span>
    </div>
  );
}
