import React, { useEffect, useRef, useState, useMemo } from 'react';
import { webAudio } from './WebAudioManager.ts';
import { GameIcon } from './GameIcon.tsx';

export interface CardItem {
  id: string;
  label: React.ReactNode;
  sublabel?: string;
  colorTheme?: string;
  disabled?: boolean;
  badge?: string;
  raw?: unknown;
}

export interface CardFanEngineProps {
  cards: CardItem[];
  selectedCardIds?: string[];
  onSelectCards?: (selectedIds: string[]) => void;
  onPlayCard?: (card: CardItem) => void;
  allowMultiSelect?: boolean;
  maxFanAngle?: number; // 整体扇形最大角度度数，默认 40；实际生效值再受样式表 --fan-max-angle-cap 上限约束
  cardWidth?: number;   // 显式覆盖牌宽 (px)；缺省读样式表 --fan-card-w 令牌（随断点变化）
  cardHeight?: number;  // 显式覆盖牌高 (px)；缺省读样式表 --fan-card-h 令牌（随断点变化）
  disabled?: boolean;
  playButtonText?: string;
}

interface FanMetrics {
  width: number;
  height: number;
  lift: number;
  slope: number;
  maxAngleCap: number;
}

const FALLBACK_METRICS: FanMetrics = { width: 76, height: 112, lift: 24, slope: 0.8, maxAngleCap: 40 };

/**
 * 扇形手牌几何令牌驱动（styles.css `.card-fan-container` 定义 --fan-*，多尺寸适配层按断点覆盖）。
 * 纸牌宽高/选中上浮/坡度系数/最大张角全部从 computed style 读取，JS 不再硬编码断点数值；
 * 窗口尺寸变化时经 ResizeObserver + resize 重读令牌。
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
      setMetrics({
        width: num(cs, '--fan-card-w', FALLBACK_METRICS.width),
        height: num(cs, '--fan-card-h', FALLBACK_METRICS.height),
        lift: num(cs, '--fan-lift', FALLBACK_METRICS.lift),
        slope: num(cs, '--fan-slope', FALLBACK_METRICS.slope),
        maxAngleCap: num(cs, '--fan-max-angle-cap', FALLBACK_METRICS.maxAngleCap),
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
  allowMultiSelect = false,
  maxFanAngle = 40,
  cardWidth,
  cardHeight,
  disabled = false,
  playButtonText = '出牌',
}: CardFanEngineProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const metrics = useFanMetrics(containerRef);
  const effCardWidth = cardWidth ?? metrics.width;
  const effCardHeight = cardHeight ?? metrics.height;
  const effMaxFanAngle = Math.min(maxFanAngle, metrics.maxAngleCap);
  const [internalSelected, setInternalSelected] = useState<string[]>([]);
  const activeSelected = onSelectCards ? selectedCardIds : internalSelected;

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
    if (disabled || activeSelected.length === 0) return;
    const targetCard = cards.find((c) => activeSelected.includes(c.id));
    if (targetCard && onPlayCard) {
      webAudio.playCardPlay();
      onPlayCard(targetCard);
      if (!onSelectCards) setInternalSelected([]);
    }
  };

  // 弧度与横向展开计算
  const total = cards.length;
  const stepAngle = total > 1 ? Math.min(effMaxFanAngle / (total - 1), 6) : 0;
  const startAngle = total > 1 ? -((total - 1) * stepAngle) / 2 : 0;
  const stepX = total > 1 ? Math.min(effCardWidth * 0.48, Math.max(20, 580 / total)) : 0;
  const startX = total > 1 ? -((total - 1) * stepX) / 2 : 0;

  return (
    <div className="card-fan-container" ref={containerRef}>
      {/* 选牌后的出牌操作浮条 */}
      {activeSelected.length > 0 && onPlayCard && (
        <div className="card-fan-action-bar">
          <button
            type="button"
            className="card-fan-play-btn"
            onClick={handlePlaySelected}
            disabled={disabled}
          >
            <GameIcon name="rocket" size={16} style={{ marginRight: '6px' }} />
            {playButtonText} ({activeSelected.length}张)
          </button>
        </div>
      )}

      {/* 扇形卡牌渲染区 */}
      <div className="card-fan-deck" style={{ height: effCardHeight + 28 }}>
        {cards.map((card, idx) => {
          const isSelected = activeSelected.includes(card.id);
          const angle = startAngle + idx * stepAngle;
          const translateX = startX + idx * stepX;
          const translateY = isSelected ? -metrics.lift : Math.abs(angle) * metrics.slope;
          const transform = `translateX(${translateX}px) rotate(${angle}deg) translateY(${translateY}px)`;

          return (
            <button
              key={card.id}
              type="button"
              className={`card-fan-item ${isSelected ? 'card-fan-item--selected' : ''} ${
                card.disabled || disabled ? 'card-fan-item--disabled' : ''
              } ${card.colorTheme ? `card-fan-item--${card.colorTheme}` : ''}`}
              style={{
                transform,
                zIndex: isSelected ? 100 + idx : idx,
                width: effCardWidth,
                height: effCardHeight,
              }}
              onClick={() => handleCardClick(card)}
              disabled={card.disabled || disabled}
            >
              {card.badge && <span className="card-fan-badge">{card.badge}</span>}
              <div className="card-fan-label">{card.label}</div>
              {card.sublabel && <div className="card-fan-sublabel">{card.sublabel}</div>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
