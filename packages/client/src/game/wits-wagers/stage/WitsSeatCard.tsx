import type { WitsWagersPhase } from '../types.ts';
import type { WitsSeat } from '../seats.ts';
import { WitsChip } from './WitsChip.tsx';

export interface WitsSeatCardProps {
  readonly seat: WitsSeat;
  readonly phase: WitsWagersPhase;
  readonly isMe: boolean;
  /**
   * 结算演出的 staging（X06 编排）：false 时增减徽章 / 作者签先藏起，
   * 由演出逐个放出。省略时按 phase 直接显示终态。
   */
  readonly effectsRevealed?: boolean;
  /** 名次章单独成拍：全部计分完成后统一放出；省略时跟随 effectsRevealed */
  readonly rankRevealed?: boolean;
  /** 第一名整卡高光 + 皇冠（X06 在全部计分后点亮） */
  readonly crowned?: boolean;
}

/**
 * 贵宾厅席位卡（01-CONTRACT.md §4.1，A2 的 .seat）。
 *
 * 左侧筹码形座位章（玩家色 + 座位号），右侧名字 + 状态区：
 * ① 作答：状态灯（已交牌 / 思考中…）；②③：衬线大余额 + 「分」；
 * ④ 结算：余额计数 + 增减徽章 + 作者签 + 名次章 + 第一名皇冠。
 *
 * 纯展示：计数与徽章由 props 驱动，组件本身不跑演出（X06 编排）。
 * 隐私：answering 阶段状态区只有灯，不渲染任何分数与估数。
 */
export function WitsSeatCard({
  seat,
  phase,
  isMe,
  effectsRevealed,
  rankRevealed,
  crowned = false,
}: WitsSeatCardProps) {
  const inSettlement = phase === 'settlement' || phase === 'game_over';
  // 省略 effectsRevealed 时按阶段落终态；演出进行中由编排方逐个放出
  const showEffects = effectsRevealed ?? inSettlement;
  const showRank = rankRevealed ?? showEffects;

  const classes = [
    'ww-seat-card',
    isMe ? 'ww-seat-card--me' : '',
    seat.forfeited ? 'ww-seat-card--forfeited' : '',
    crowned ? 'ww-seat-card--top' : '',
    phase === 'answering' && seat.hasSubmitted ? 'ww-seat-card--done' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const delta = seat.delta;
  const deltaClass =
    delta === null || delta === 0 ? 'ww-seat-card__delta--zero' : delta > 0 ? 'ww-seat-card__delta--up' : 'ww-seat-card__delta--down';

  return (
    <div className={classes} data-player-id={seat.id} data-seat-no={seat.seatNo}>
      {/* 名次圆章（左上角，结算才有；演出前透明占位） */}
      {inSettlement && seat.rank !== null && (
        <span className={`ww-seat-card__rank ${showRank ? 'is-on' : ''}`} aria-label={`第 ${seat.rank} 名`}>
          {seat.rank}
        </span>
      )}

      {/* 作者奖励签（右上角） */}
      {inSettlement && seat.authorBonus > 0 && (
        <span className={`ww-seat-card__author ${showEffects ? 'is-on' : ''}`}>作者 +{seat.authorBonus}</span>
      )}

      <WitsChip
        className="ww-seat-card__chip"
        color={seat.color}
        label={String(seat.seatNo)}
        size={52}
      />

      <div className="ww-seat-card__name" title={seat.name}>
        {seat.name}
        {isMe && <span className="ww-seat-card__you">你</span>}
      </div>

      <div className="ww-seat-card__status">
        {seat.forfeited ? (
          <span className="ww-seat-card__tag ww-seat-card__tag--forfeited">已退席</span>
        ) : phase === 'answering' ? (
          <span className="ww-seat-card__tag">{seat.hasSubmitted ? '已交牌' : '思考中'}</span>
        ) : inSettlement ? (
          <>
            <span className="ww-seat-card__score">{seat.scoreValue.toLocaleString('zh-CN')}</span>
            {delta !== null && (
              <span className={`ww-seat-card__delta ${deltaClass} ${showEffects ? 'is-on' : ''}`}>
                {delta === 0 ? '持平' : `${delta > 0 ? '+' : ''}${delta}`}
              </span>
            )}
          </>
        ) : (
          <span className="ww-seat-card__score">
            {seat.scoreValue.toLocaleString('zh-CN')}
            <small>分</small>
          </span>
        )}
      </div>
    </div>
  );
}
