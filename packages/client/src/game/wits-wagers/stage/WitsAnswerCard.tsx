import { UserAvatar } from '../../../user/UserAvatar.tsx';
import { resolveMemberAvatar } from '../../../user/avatar.ts';
import { nameFor, type MemberLike } from '../../useGameAction.ts';
import type { BoardTargetView } from '../types.ts';
import { targetLabel } from '../types.ts';

export interface WitsAnswerCardProps {
  /** 已揭晓的槽位；传 null 表示这是一张尚未翻开的背面牌 */
  readonly target: BoardTargetView | null;
  readonly members?: readonly MemberLike[];
  readonly faceUp: boolean;
  readonly isWinner?: boolean;
  readonly isSelected?: boolean;
  readonly interactive?: boolean;
  readonly onActivate?: () => void;
  /** 逐张翻开时的错落序号 */
  readonly revealIndex?: number;
  readonly children?: React.ReactNode;
}

/**
 * 桌面上的实体答案牌。
 *
 * 背面在 faceUp=false 时朝上——作答阶段谁都不能从 DOM 里读到别人的数字，
 * 所以未翻开时不渲染任何数值文本，而不是靠 CSS 藏起来。
 */
export function WitsAnswerCard({
  target,
  members = [],
  faceUp,
  isWinner = false,
  isSelected = false,
  interactive = false,
  onActivate,
  revealIndex = 0,
  children,
}: WitsAnswerCardProps) {
  const isEdge = target?.id === 'lower' || target?.id === 'higher';

  const classes = [
    'ww-answer-card',
    // ww-target-card 是对外的稳定选择器契约（E2E 与视觉基线都依赖它计数已揭晓的槽位），
    // 只挂在真正代表版图槽位的牌上，背面牌不算。
    target ? 'ww-target-card' : '',
    faceUp ? 'is-face-up' : 'is-face-down',
    isEdge ? `ww-answer-card--edge ww-answer-card--${target!.id}` : '',
    isWinner ? 'ww-answer-card--winner' : '',
    isSelected ? 'ww-answer-card--selected' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (!interactive || !onActivate) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onActivate();
    }
  };

  return (
    <div
      className={classes}
      data-slot={target?.slot}
      data-target-id={target?.id}
      data-stage-anchor={target ? `target:${target.id}` : undefined}
      style={{ ['--ww-reveal-index' as string]: String(revealIndex) }}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={interactive ? onActivate : undefined}
      onKeyDown={handleKeyDown}
      aria-label={
        faceUp && target
          ? isEdge
            ? `${target.id === 'lower' ? '答案低于全部估数' : '答案高于全部估数'}，净赢 ${target.odds} 倍`
            : `估数 ${target.value?.toLocaleString()}，净赢 ${target.odds} 倍`
          : '未翻开的答案牌'
      }
    >
      <div className="ww-answer-card__inner">
        {/* 背面：花纹而非数字，保证未翻开时 DOM 中没有任何答案信息 */}
        <div className="ww-answer-card__back" aria-hidden={faceUp}>
          <svg viewBox="0 0 90 126" width="100%" height="100%" aria-hidden="true" focusable="false">
            <rect x="1" y="1" width="88" height="124" rx="8" fill="#115665" stroke="#0b3741" strokeWidth="2" />
            <rect x="8" y="8" width="74" height="110" rx="5" fill="none" stroke="#2b8ba3" strokeWidth="1.6" />
            <g stroke="#2b8ba3" strokeWidth="1.1" opacity="0.7">
              {[22, 40, 58, 76, 94, 112].map((y) => (
                <path key={y} d={`M14 ${y} L45 ${y - 11} L76 ${y}`} fill="none" />
              ))}
            </g>
            <circle cx="45" cy="63" r="15" fill="#0b3741" stroke="#f7c84b" strokeWidth="1.6" />
            <text
              x="45"
              y="63"
              textAnchor="middle"
              dominantBaseline="central"
              fill="#f7c84b"
              fontSize="15"
              fontWeight="800"
              fontFamily="inherit"
            >
              智
            </text>
          </svg>
        </div>

        {/* 正面 */}
        <div className="ww-answer-card__face" aria-hidden={!faceUp}>
          {faceUp && target && (
            <>
              <div className="ww-answer-card__slot">
                {isEdge ? '边缘槽位' : `槽位 ${target.slot}`}
              </div>

              <div className="ww-answer-card__value">
                {targetLabel(target)}
              </div>

              <div className="ww-answer-card__odds">净赢 ×{target.odds}</div>

              {target.authors.length > 0 && (
                <div className="ww-answer-card__authors">
                  {target.authors.map((author) => {
                    const member = members.find((m) => m.playerId === author);
                    return (
                      <span
                        key={author}
                        className="ww-answer-card__author"
                        title={nameFor(members, author)}
                      >
                        <UserAvatar
                          avatar={resolveMemberAvatar({ avatar: member?.avatar, playerId: author })}
                          nickname={nameFor(members, author)}
                          size={20}
                        />
                      </span>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* 押在这张牌上的筹码 */}
      {children && <div className="ww-answer-card__chips">{children}</div>}
    </div>
  );
}
