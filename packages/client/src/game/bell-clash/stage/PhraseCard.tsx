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
 * 口令卡。
 *
 * 与 /assets/uno/*.png 数字牌用同一套牌框：同圆角、同 ink 粗边、同斜白椭圆底版、
 * 同四角角标——数字牌角标是数字，这里是「口令」。之前两种牌一张是图片一张是
 * CSS 色块，摆在一起像两个游戏；现在只有内容不同。
 *
 * 牌面语义色（红黄绿蓝）不是主题色，不受「一款一个 accent」约束。
 */
export function PhraseCard({ card, isTop = false }: PhraseCardProps) {
  const isPhrase = card.kind === 'phrase';
  const text = isPhrase ? card.phrase : String(card.number);
  // 短语越长字越小：4 字以内按大号，8 字以上压到最小
  const len = text.length;
  const size = len <= 4 ? 'lg' : len <= 7 ? 'md' : 'sm';
  return (
    <div
      className="bc-phrase"
      data-color={card.color}
      data-top={isTop ? 'true' : undefined}
      data-size={size}
    >
      <span className="bc-phrase__frame" aria-hidden="true" />
      <span className="bc-phrase__corner bc-phrase__corner--tl" aria-hidden="true">
        <b>口令</b>
      </span>
      <span className="bc-phrase__corner bc-phrase__corner--br" aria-hidden="true">
        <b>口令</b>
      </span>
      <span className="bc-phrase__oval" aria-hidden="true" />
      <span className="bc-phrase__text">{text}</span>
    </div>
  );
}
