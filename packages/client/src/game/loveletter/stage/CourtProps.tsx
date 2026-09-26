import { ROLE_LABELS } from '../roleMeta.ts';
import type { LoveLetterCard } from '../types.ts';

/**
 * 羽毛笔 + 花体框线：装饰艺术层，currentColor 着色，压在书信桌正中 12% 透明度。
 *
 * 做法同 Ding 的 BellArt / 狼人杀 WerewolfThemeArt：一张 SVG、一个 <pattern>
 * 斜线阴影伪装铜版刻痕；短屏靠 .stage-art 的 max-height 递减，520h 以下不显示。
 */
export function QuillArt() {
  return (
    <svg viewBox="0 0 640 400" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
      <defs>
        <pattern id="ll-cuts" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(-32)">
          <line x1="0" y1="0" x2="0" y2="6" stroke="currentColor" strokeWidth="1.2" />
        </pattern>
      </defs>
      {/* 花体框线：上下两道卷草，四角各一个涡卷 */}
      <path d="M90 60 Q160 20 240 52 T400 52 T550 60" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
      <path d="M90 340 Q160 380 240 348 T400 348 T550 340" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
      <path d="M90 60 q-30 10 -24 38 q6 22 28 14" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
      <path d="M550 60 q30 10 24 38 q-6 22 -28 14" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
      <path d="M90 340 q-30 -10 -24 -38 q6 -22 28 -14" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
      <path d="M550 340 q30 -10 24 -38 q-6 -22 -28 -14" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
      {/* 羽毛：一片斜放的羽片 + 刻痕阴影 + 羽轴 */}
      <path d="M430 70 Q300 110 230 250 Q300 200 360 190 Q330 170 350 150 Q400 150 430 70 Z" fill="currentColor" />
      <path d="M410 100 Q320 140 262 232 Q310 196 350 186 Q336 170 350 156 Q390 150 410 100 Z" fill="url(#ll-cuts)" opacity="0.6" />
      <path d="M430 70 Q330 170 214 300" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
      {/* 笔尖落下的一道墨迹 */}
      <path d="M214 300 q-40 22 -96 16 q40 -6 70 -26" fill="currentColor" opacity="0.7" />
      {/* 墨水瓶 */}
      <path d="M430 262 h70 v14 q22 8 22 36 v28 h-114 v-28 q0 -28 22 -36 Z" fill="currentColor" />
      <rect x="440" y="246" width="50" height="16" rx="4" fill="currentColor" opacity="0.8" />
    </svg>
  );
}

/**
 * 蜡封：好感进度的计数单位。点亮 = 一枚压好的红蜡，未点亮 = 一个浅色蜡痕。
 * 除颜色外还有形状差异（点亮带压印星纹），色弱也读得出进度。
 */
export function WaxSeal({ lit, size = 'md' }: { lit: boolean; size?: 'sm' | 'md' }) {
  return <i className={`ll-seal ll-seal--${size} ${lit ? 'is-lit' : ''}`} aria-hidden="true" />;
}

export interface LedgerRow {
  readonly playerId: string;
  readonly name: string;
  readonly points: number;
  readonly isMe: boolean;
  readonly isCurrent: boolean;
  readonly isOut: boolean;
}

/**
 * 情书进度板：本局要攒多少枚蜡封、每人已经攒到几枚。
 *
 * 这是中央区最大块的「真实信息」——原先好感只以 12px 红心散落在对手头像下，
 * 自己的进度根本不显示。
 */
export function AffectionLedger({ rows, target, round }: { rows: readonly LedgerRow[]; target: number; round: number }) {
  return (
    <section className="ll-ledger stage-sticker" aria-label={`好感进度，先攒满 ${target} 枚蜡封者获胜`}>
      <header className="ll-ledger__head">
        <span className="stage-eyebrow ll-ledger__eyebrow">Round {round}</span>
        <span className="ll-ledger__target">
          <span className="stage-numeral ll-ledger__target-num">{target}</span>
          <span className="ll-ledger__target-label">枚蜡封获胜</span>
        </span>
      </header>
      <ul className="ll-ledger__rows">
        {rows.map((row) => (
          <li
            key={row.playerId}
            className={`ll-ledger__row stage-chip ${row.isMe ? 'is-me' : ''}`}
            data-active={row.isCurrent ? 'true' : undefined}
            data-out={row.isOut ? 'true' : undefined}
          >
            <span className="ll-ledger__name">{row.isMe ? '你' : row.name}</span>
            <span className="ll-ledger__seals" aria-label={`${row.points} / ${target}`}>
              {Array.from({ length: target }, (_, i) => (
                <WaxSeal key={i} lit={i < row.points} size="sm" />
              ))}
            </span>
            <span className="stage-numeral ll-ledger__points">{row.points}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** 牌库：几张牌背错落叠放，张数用展示数字写在旁边。 */
export function DeckPile({ count }: { count: number }) {
  const layers = Math.min(3, Math.max(0, count));
  return (
    <div className={`ll-pile ll-pile--deck ${count <= 3 ? 'is-low' : ''}`} data-stage-anchor="deck">
      <div className="ll-pile__stack" aria-label={`牌库剩余 ${count} 张`}>
        {layers === 0 ? (
          <div className="ll-pile__empty" />
        ) : (
          Array.from({ length: layers }, (_, i) => (
            <div key={i} className="ll-court-card ll-court-card--back" style={{ ['--layer' as string]: layers - 1 - i }} />
          ))
        )}
      </div>
      <div className="ll-pile__caption">
        <span className="stage-numeral ll-pile__num" key={count}>{count}</span>
        <span className="stage-eyebrow ll-pile__label">Deck · 牌库</span>
      </div>
    </div>
  );
}

export interface LastPlayed {
  readonly card: LoveLetterCard;
  readonly playerName: string;
}

/**
 * 弃牌堆：最近一张正面朝上，此前打出的以牌背错开垫在下面，
 * 让「这一轮已经走了多少张」有体积感。
 */
export function DiscardPile({
  last,
  total,
  onInspect,
}: {
  last: LastPlayed | null;
  total: number;
  onInspect: (card: LoveLetterCard, target: HTMLElement) => void;
}) {
  const under = Math.min(3, Math.max(0, total - 1));
  return (
    <div className="ll-pile ll-pile--discard" data-stage-anchor="discard">
      <div className="ll-pile__stack">
        {Array.from({ length: under }, (_, i) => (
          <div
            key={i}
            className="ll-court-card ll-court-card--back ll-court-card--under"
            style={{ ['--layer' as string]: under - i }}
          />
        ))}
        {last ? (
          <button
            type="button"
            className="ll-court-card ll-court-card--face"
            onClick={(event) => onInspect(last.card, event.currentTarget)}
            aria-label={`${last.playerName} 刚打出 ${ROLE_LABELS[last.card.role]}，点击查看技能`}
          >
            <img src={`/assets/loveletter/${last.card.role}.png`} alt="" />
            <span className="stage-numeral ll-court-card__value">{last.card.value}</span>
            <span className="ll-court-card__name">{ROLE_LABELS[last.card.role]}</span>
          </button>
        ) : (
          <div className="ll-pile__empty">
            <span>尚无出牌</span>
          </div>
        )}
      </div>
      <div className="ll-pile__caption">
        <span className="stage-eyebrow ll-pile__label">Last letter</span>
        <span className="ll-pile__who">{last ? last.playerName : '—'}</span>
      </div>
    </div>
  );
}
