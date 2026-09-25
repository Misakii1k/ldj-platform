import type { BellClashCard } from '../types.ts';

/**
 * 铃身剪影：装饰艺术层用，currentColor 着色，压在毡面正中 12% 透明度。
 *
 * 做法照搬狼人杀 WerewolfThemeArt：一张 SVG、一个 <pattern> 斜线阴影伪装刻痕，
 * 短屏靠 .stage-art 的 max-height 递减，520h 以下整个不显示。
 */
export function BellArt() {
  return (
    <svg viewBox="0 0 640 400" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
      <defs>
        <pattern id="bc-cuts" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(38)">
          <line x1="0" y1="0" x2="0" y2="7" stroke="currentColor" strokeWidth="1.4" />
        </pattern>
      </defs>
      {/* 声波：三道从铃顶散开的弧线 */}
      <path d="M180 120 A160 160 0 0 1 460 120" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" opacity="0.35" />
      <path d="M140 150 A200 200 0 0 1 500 150" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" opacity="0.22" />
      <path d="M100 180 A240 240 0 0 1 540 180" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" opacity="0.12" />
      {/* 按钮头 */}
      <rect x="302" y="112" width="36" height="26" rx="6" fill="currentColor" />
      {/* 铃体：半球 + 刻痕阴影 */}
      <path d="M200 300 Q200 150 320 150 Q440 150 440 300 Z" fill="currentColor" />
      <path d="M232 300 Q232 190 320 190 Q408 190 408 300 Z" fill="url(#bc-cuts)" opacity="0.55" />
      {/* 底座 */}
      <rect x="170" y="300" width="300" height="22" rx="8" fill="currentColor" />
      <rect x="150" y="322" width="340" height="14" rx="6" fill="currentColor" opacity="0.7" />
    </svg>
  );
}

export interface DiscardTrailEntry {
  readonly seq: number;
  readonly card: BellClashCard;
  readonly playerName: string;
}

export interface DiscardTrailProps {
  readonly entries: readonly DiscardTrailEntry[];
  readonly renderCard: (card: BellClashCard) => React.ReactNode;
}

/**
 * 弃牌历史带：最近几手散落在铃的左手边，每张下面一行小字写谁出的。
 *
 * 这是狼人杀「装饰层是空间填充物」那条的 Ding 版本——只不过填充的是
 * 真实对局信息而不是纯装饰：谁在出什么色、节奏快不快，一眼扫过去就知道。
 */
export function DiscardTrail({ entries, renderCard }: DiscardTrailProps) {
  if (entries.length === 0) {
    return (
      <div className="bc-trail bc-trail--empty" aria-label="尚无出牌记录">
        <span className="stage-eyebrow">Recent plays</span>
        <span className="bc-trail__hint">刚开局，还没人出牌</span>
      </div>
    );
  }
  return (
    <div className="bc-trail" aria-label="最近出牌">
      <span className="stage-eyebrow">Recent plays</span>
      <ol className="bc-trail__list">
        {entries.map((entry, index) => (
          <li
            key={entry.seq}
            className="bc-trail__item"
            // 最新的一张最正、最亮；往回越歪越淡
            style={{ ['--i' as string]: index }}
          >
            <div className="bc-trail__card">{renderCard(entry.card)}</div>
            <span className="bc-trail__who">{entry.playerName}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export interface ClaimBoardRow {
  readonly playerId: string;
  readonly name: string;
  readonly claims: number;
  readonly handCount: number;
  readonly isCurrent: boolean;
  readonly isClaimant: boolean;
  readonly isMe: boolean;
}

export interface ClaimBoardProps {
  readonly rows: readonly ClaimBoardRow[];
}

/**
 * 抢铃记分板：铃的右手边，每人一行——抢到过几次、手里还剩几张。
 *
 * 数字走 .stage-numeral（衬线大号），行状态照狼人杀的多信号编码：
 * 当前行动者左侧 4px 竖条，抢铃人整行反色，不靠颜色单独说话。
 */
export function ClaimBoard({ rows }: ClaimBoardProps) {
  return (
    <div className="bc-board" aria-label="抢铃记分板">
      <span className="stage-eyebrow">Bell claims</span>
      <ol className="bc-board__list">
        {rows.map((row) => (
          <li
            key={row.playerId}
            className="bc-board__row stage-chip"
            data-active={row.isCurrent ? 'true' : undefined}
            data-claimant={row.isClaimant ? 'true' : undefined}
            data-me={row.isMe ? 'true' : undefined}
          >
            <span className="bc-board__name">{row.name}</span>
            <span className="bc-board__claims stage-numeral" aria-label={`抢铃 ${row.claims} 次`}>
              {row.claims}
            </span>
            <span className="bc-board__hand" aria-label={`手牌 ${row.handCount} 张`}>
              {row.handCount}<small>张</small>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
