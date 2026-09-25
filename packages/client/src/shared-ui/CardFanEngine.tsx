import React, { useEffect, useRef, useState } from 'react';
import { webAudio } from './WebAudioManager.ts';
import { GameIcon } from './GameIcon.tsx';
import { computeDenseHandLayout } from './denseHandLayout.ts';

export interface CardItem {
  id: string;
  label: React.ReactNode;
  sublabel?: string;
  colorTheme?: string;
  disabled?: boolean;
  badge?: string;
  imageUrl?: string;
  overlay?: React.ReactNode;
  customContent?: React.ReactNode;
  raw?: unknown;
}

export interface CardFanEngineProps {
  cards: CardItem[];
  selectedCardIds?: string[];
  onSelectCards?: (selectedIds: string[]) => void;
  onPlayCard?: (card: CardItem) => void;
  onHoverCard?: (card: CardItem | null) => void;
  allowMultiSelect?: boolean;
  maxFanAngle?: number; // 整体扇形最大角度度数，默认 40；实际生效值再受样式表 --fan-max-angle-cap 上限约束
  cardWidth?: number;   // 显式覆盖牌宽 (px)；缺省读样式表 --fan-card-w 令牌（随断点变化）
  cardHeight?: number;  // 显式覆盖牌高 (px)；缺省读样式表 --fan-card-h 令牌（随断点变化）
  disabled?: boolean;
  playButtonText?: string;
  hidePlayButton?: boolean;
  /**
   * 稠密手牌策略（UNO 专用，默认关闭）。
   * 开启后手牌超过阈值时改用 denseHandLayout：可出牌前置抬升、不可出牌压成色条，
   * 再多则拆双排。斗地主 17~20 张是常态且没有「可出/不可出」的强区分，
   * 保持等距扇形更合适，所以做成 opt-in 而非默认行为。
   */
  denseWhenCrowded?: boolean;
  /** 稠密策略触发阈值（张数），缺省 12；主要供测试与调参 */
  denseThreshold?: number;
}

interface FanMetrics {
  width: number;
  height: number;
  lift: number;
  slope: number;
  maxAngleCap: number;
  containerWidth: number;
}

const FALLBACK_METRICS: FanMetrics = { width: 76, height: 112, lift: 24, slope: 0.8, maxAngleCap: 40, containerWidth: 360 };

/** 出牌飞出动画时长（CSS transition 与延迟回调共用） */
const PLAY_ANIM_MS = 180;

export interface FanLayout {
  stepAngle: number;
  startAngle: number;
  stepX: number;
  startX: number;
}

/**
 * 扇形手牌几何纯函数：
 * - 随卡牌数量增多自动自适应收缩 stepX 叠牌间距，确保在手机竖屏窄视口下完整容纳；
 * - 角度展开平滑限幅，防止边缘卡牌过度倾斜。
 */
export function computeFanLayout(
  total: number,
  cardWidth: number,
  maxFanAngle: number,
  angleCap: number,
  containerWidth: number = 360
): FanLayout {
  if (total <= 1) {
    return { stepAngle: 0, startAngle: 0, stepX: 0, startX: 0 };
  }
  const effMaxAngle = Math.min(maxFanAngle, angleCap);
  // 角度步进：卡牌越多单步张角越收敛
  const stepAngle = Math.min(effMaxAngle / (total - 1), 32 / (total - 1), 5);
  const startAngle = -((total - 1) * stepAngle) / 2;

  // 可用横向跨度（预留安全边距）
  const usableWidth = Math.max(140, Math.min(containerWidth - 16, 760));
  const maxSpan = Math.max(80, usableWidth - cardWidth);

  // 基础理想步长（约 42% 牌宽），随卡牌增多自动收缩
  const idealStepX = Math.min(cardWidth * 0.44, 36);
  const stepX = Math.min(idealStepX, Math.max(12, maxSpan / (total - 1)));
  const startX = -((total - 1) * stepX) / 2;

  return { stepAngle, startAngle, stepX, startX };
}

/**
 * 扇形手牌几何令牌驱动：
 * 从 computed style 与容器尺寸读取真实数据，自适应横屏/竖屏及各种分辨率。
 */
function useFanMetrics(ref: React.RefObject<HTMLElement | null>): FanMetrics {
  const [metrics, setMetrics] = useState<FanMetrics>(FALLBACK_METRICS);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const num = (cs: CSSStyleDeclaration, name: string, fallback: number): number => {
      const raw = parseFloat(cs.getPropertyValue(name));
      return Number.isFinite(raw) ? raw : fallback;
    };
    const read = () => {
      const cs = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      setMetrics({
        width: num(cs, '--fan-card-w', FALLBACK_METRICS.width),
        height: num(cs, '--fan-card-h', FALLBACK_METRICS.height),
        lift: num(cs, '--fan-lift', FALLBACK_METRICS.lift),
        slope: num(cs, '--fan-slope', FALLBACK_METRICS.slope),
        maxAngleCap: num(cs, '--fan-max-angle-cap', FALLBACK_METRICS.maxAngleCap),
        containerWidth: rect.width > 0 ? rect.width : (typeof window !== 'undefined' ? window.innerWidth : 360),
      });
    };
    read();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(read) : null;
    if (observer) observer.observe(el);
    window.addEventListener('resize', read);
    return () => {
      if (observer) observer.disconnect();
      window.removeEventListener('resize', read);
    };
  }, [ref]);

  return metrics;
}

export function CardFanEngine({
  cards,
  selectedCardIds = [],
  onSelectCards,
  onPlayCard,
  onHoverCard,
  allowMultiSelect = false,
  maxFanAngle = 40,
  cardWidth,
  cardHeight,
  disabled = false,
  playButtonText = '出牌',
  hidePlayButton = false,
  denseWhenCrowded = false,
  denseThreshold,
}: CardFanEngineProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const deckRef = useRef<HTMLDivElement | null>(null);
  const metrics = useFanMetrics(containerRef);
  const effCardWidth = cardWidth ?? metrics.width;
  const effCardHeight = cardHeight ?? metrics.height;
  const [internalSelected, setInternalSelected] = useState<string[]>([]);
  const activeSelected = onSelectCards ? selectedCardIds : internalSelected;

  // 手指滑动/长按/hover 聚焦牌索引，触发风琴式向两侧展开
  const [peekIdx, setPeekIdx] = useState<number | null>(null);
  const isPointerDownRef = useRef(false);

  // 出牌飞出动画：目标牌渐隐离场后再提交业务回调
  const [playingId, setPlayingId] = useState<string | null>(null);
  const playTimerRef = useRef<number | null>(null);
  useEffect(() => {
    return () => {
      if (playTimerRef.current !== null) window.clearTimeout(playTimerRef.current);
    };
  }, []);

  const handleCardClick = (card: CardItem) => {
    if (disabled || card.disabled) return;
    webAudio.playCardFlip();

    let nextSelected: string[];
    if (allowMultiSelect) {
      if (activeSelected.includes(card.id)) {
        nextSelected = activeSelected.filter((id) => id !== card.id);
      } else {
        nextSelected = [...activeSelected, card.id];
      }
    } else {
      nextSelected = activeSelected.includes(card.id) ? [] : [card.id];
    }

    if (onSelectCards) {
      onSelectCards(nextSelected);
    } else {
      setInternalSelected(nextSelected);
    }
  };

  const handlePlaySelected = () => {
    if (disabled || activeSelected.length === 0 || playingId !== null) return;
    const targetCard = cards.find((c) => activeSelected.includes(c.id));
    if (targetCard && onPlayCard) {
      webAudio.playCardPlay();
      setPlayingId(targetCard.id);
      playTimerRef.current = window.setTimeout(() => {
        playTimerRef.current = null;
        setPlayingId(null);
        onPlayCard(targetCard);
        if (!onSelectCards) setInternalSelected([]);
      }, PLAY_ANIM_MS + 10);
    }
  };

  // 弧度与横向展开计算（包含卡牌过多时的自适应缩紧）
  const total = cards.length;
  const { stepAngle, startAngle, stepX, startX } = computeFanLayout(
    total,
    effCardWidth,
    maxFanAngle,
    metrics.maxAngleCap,
    metrics.containerWidth
  );

  // 稠密策略（opt-in）：手牌拥挤时按可出性重排，普通局面仍走上面的等距扇形
  const dense = denseWhenCrowded
    ? computeDenseHandLayout(
        cards.map((c) => ({ id: c.id, playable: !c.disabled })),
        { cardWidth: effCardWidth, containerWidth: metrics.containerWidth, denseThreshold },
      )
    : null;
  const densePlacements = dense && dense.mode !== 'fan'
    ? new Map(dense.placements.map((p) => [p.id, p]))
    : null;
  // 双排时牌堆要加高，否则后排会被裁掉
  const deckHeight = effCardHeight + 28 + (dense?.mode === 'double' ? Math.abs(dense.rowOffsetY) : 0);

  // 手指滑动/触摸探索卡牌辅助函数
  const updatePeekFromClientX = (clientX: number) => {
    if (total <= 0 || !deckRef.current) return;
    const rect = deckRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const relX = clientX - centerX;
    const approxIdx = Math.round((relX - startX) / (stepX || 1));
    const clamped = Math.max(0, Math.min(total - 1, approxIdx));
    setPeekIdx(clamped);
  };

  const handleDeckPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === 'touch') {
      isPointerDownRef.current = true;
    }
    updatePeekFromClientX(e.clientX);
  };

  const handleDeckPointerMove = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse' || isPointerDownRef.current) {
      updatePeekFromClientX(e.clientX);
    }
  };

  const handleDeckPointerUp = () => {
    isPointerDownRef.current = false;
    setPeekIdx(null);
  };

  const handleDeckPointerLeave = () => {
    isPointerDownRef.current = false;
    setPeekIdx(null);
  };

  return (
    <div className="card-fan-container" ref={containerRef}>
      {/* 选牌后的出牌操作浮条 */}
      {activeSelected.length > 0 && onPlayCard && !hidePlayButton && (
        <div className="card-fan-action-bar">
          <button
            type="button"
            className="card-fan-play-btn"
            onClick={handlePlaySelected}
            disabled={disabled || playingId !== null}
          >
            <GameIcon name="rocket" size={16} style={{ marginRight: '6px' }} />
            {playButtonText} ({activeSelected.length}张)
          </button>
        </div>
      )}

      {/* 扇形卡牌渲染区 */}
      <div
        className={`card-fan-deck ${dense && dense.mode !== 'fan' ? `card-fan-deck--${dense.mode}` : ''}`}
        ref={deckRef}
        style={{ height: deckHeight }}
        onPointerDown={handleDeckPointerDown}
        onPointerMove={handleDeckPointerMove}
        onPointerUp={handleDeckPointerUp}
        onPointerCancel={handleDeckPointerUp}
        onPointerLeave={handleDeckPointerLeave}
      >
        {cards.map((card, idx) => {
          const isSelected = activeSelected.includes(card.id);
          const isPlaying = playingId === card.id;
          const isPeeking = peekIdx === idx;
          const dp = densePlacements?.get(card.id) ?? null;
          const baseAngle = dp ? dp.angle : startAngle + idx * stepAngle;
          let angle = baseAngle;
          let translateX = dp ? dp.x : startX + idx * stepX;
          // 稠密模式下可出牌抬升成为视觉焦点；双排时后排再整体上移
          // （rowOffsetY 为负表示向上，translateY 同样是负值向上，故直接相加）
          const denseOffsetY = dp
            ? -dp.lift + (dp.row === 1 ? (dense?.rowOffsetY ?? 0) : 0)
            : 0;
          let translateY = isSelected
            ? -metrics.lift + denseOffsetY
            : (dp ? denseOffsetY : Math.abs(angle) * metrics.slope);
          let scale = isSelected ? 1.06 : 1;
          // 可出牌压在不可出牌之上，保证抬起来那几张完整可见
          let zIndex = isSelected || isPlaying
            ? 100 + idx
            : dp
              ? (dp.playable ? 60 + idx : (dp.row === 1 ? idx : 20 + idx))
              : idx;

          // 邻卡风琴式向两侧避让展开（手指长按/滑动/hover 时的清晰观察动效）
          // 稠密模式已按可出性精确排布，风琴避让会打乱它，故只在普通扇形下启用
          if (peekIdx !== null && !isPlaying && !dp) {
            const dist = Math.abs(idx - peekIdx);
            if (isPeeking) {
              // 当前聚焦选中的卡牌：大幅抬升、放大、最高层级、稍微摆正角度
              translateY -= (metrics.lift + 14);
              scale = 1.16;
              angle = baseAngle * 0.45;
              zIndex = 300;
            } else if (dist === 1) {
              // 相邻第 1 格：向两侧推开 18px，轻微抬升与微调角度
              const sign = idx < peekIdx ? -1 : 1;
              translateX += sign * 18;
              translateY -= 12;
              scale = 1.06;
              zIndex = 200;
            } else if (dist === 2) {
              // 相邻第 2 格：向两侧推开 9px
              const sign = idx < peekIdx ? -1 : 1;
              translateX += sign * 9;
              translateY -= 5;
              scale = 1.02;
              zIndex = 150;
            } else if (dist === 3) {
              const sign = idx < peekIdx ? -1 : 1;
              translateX += sign * 4;
            }
          }

          const transform = `translateX(${translateX}px) rotate(${angle}deg) translateY(${translateY}px) scale(${scale})`;

          return (
            <button
              key={card.id}
              type="button"
              className={`card-fan-item ${isSelected ? 'card-fan-item--selected' : ''} ${
                isPlaying ? 'card-fan-item--playing' : ''
              } ${isPeeking ? 'card-fan-item--peeking' : ''} ${
                card.disabled || disabled ? 'card-fan-item--disabled' : ''
              } ${card.colorTheme ? `card-fan-item--${card.colorTheme}` : ''} ${card.imageUrl ? 'card-fan-item--has-image' : ''}`}
              style={{
                transform,
                zIndex,
                width: effCardWidth,
                height: effCardHeight,
                ['--i' as string]: idx,
              }}
              onClick={() => handleCardClick(card)}
              onMouseEnter={() => {
                setPeekIdx(idx);
                onHoverCard?.(card);
              }}
              onMouseLeave={() => {
                setPeekIdx((cur) => (cur === idx ? null : cur));
                onHoverCard?.(null);
              }}
              onFocus={() => {
                setPeekIdx(idx);
                onHoverCard?.(card);
              }}
              onBlur={() => {
                setPeekIdx((cur) => (cur === idx ? null : cur));
                onHoverCard?.(null);
              }}
              aria-disabled={card.disabled || disabled || undefined}
              data-fan-row={dp ? dp.row : undefined}
              aria-label={typeof card.label === 'string' ? card.label : undefined}
            >
              {card.customContent ? (
                card.customContent
              ) : card.imageUrl ? (
                <>
                  <img src={card.imageUrl} alt={typeof card.label === 'string' ? card.label : ''} className="card-fan-image" />
                  {card.badge && <span className="card-fan-badge">{card.badge}</span>}
                  {card.overlay}
                </>
              ) : (
                <>
                  {card.badge && <span className="card-fan-badge">{card.badge}</span>}
                  <div className="card-fan-label">{card.label}</div>
                  {card.sublabel && <div className="card-fan-sublabel">{card.sublabel}</div>}
                </>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
