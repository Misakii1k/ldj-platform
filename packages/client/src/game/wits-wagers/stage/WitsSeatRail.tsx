import type { WitsWagersPhase } from '../types.ts';
import type { WitsSeat } from '../seats.ts';
import { WitsSeatCard } from './WitsSeatCard.tsx';

export interface WitsSeatRailProps {
  readonly seats: readonly WitsSeat[];
  readonly phase: WitsWagersPhase;
  readonly myPlayerId?: string | null;
  /** 结算演出 staging（X06）：已放出结算特效的玩家集合；省略 = 全部落终态 */
  readonly effectsRevealedFor?: Readonly<Record<string, boolean>>;
  /** 名次章是否已统一放出；省略时跟随各卡 effectsRevealed */
  readonly ranksRevealed?: boolean;
  /** 第一名（全部计分完成后由 X06 点亮皇冠） */
  readonly crownedPlayerId?: string | null;
}

/**
 * 席位轨道（01-CONTRACT.md §4 共同点 + §4.1，A2 的 .seats）。
 *
 * 桌面：左 ⌈n/2⌉ 右 ⌊n/2⌋ 贴着椭圆桌两侧（绝对定位叠在场景上，不接事件之外的交互）；
 * 中间一张向外凸 8px 的错落照方向稿。
 * 手机：题目下方 3×2 网格（用户最终选定，不许改左右两列）。
 *
 * TODO(Q1)：方向稿只画了 6 人（左 3 右 3）；7–8 人按「左 ⌈n/2⌉ 右 ⌊n/2⌋、
 * 纵向等比压缩」处理，待用户看图确认。
 */
export function WitsSeatRail({
  seats,
  phase,
  myPlayerId = null,
  effectsRevealedFor,
  ranksRevealed,
  crownedPlayerId = null,
}: WitsSeatRailProps) {
  const leftCount = Math.ceil(seats.length / 2);
  const left = seats.slice(0, leftCount);
  const right = seats.slice(leftCount);

  const renderCard = (seat: WitsSeat) => (
    <WitsSeatCard
      key={seat.id}
      seat={seat}
      phase={phase}
      isMe={seat.id === myPlayerId}
      effectsRevealed={effectsRevealedFor ? Boolean(effectsRevealedFor[seat.id]) : undefined}
      rankRevealed={ranksRevealed}
      crowned={crownedPlayerId === seat.id}
    />
  );

  return (
    <div className="ww-seat-rail" aria-label="玩家席位">
      <div className="ww-seat-rail__side ww-seat-rail__side--left">{left.map(renderCard)}</div>
      <div className="ww-seat-rail__side ww-seat-rail__side--right">{right.map(renderCard)}</div>
    </div>
  );
}
