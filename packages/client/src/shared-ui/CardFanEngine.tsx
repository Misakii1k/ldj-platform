import React, { useState } from 'react';
import { webAudio } from './WebAudioManager.ts';

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
  maxFanAngle?: number; // 整体扇形最大角度度数，默认 40
  cardWidth?: number;   // 基础宽度 (px)，默认 80
  cardHeight?: number;  // 基础高度 (px)，默认 120
  disabled?: boolean;
  playButtonText?: string;
}

export function CardFanEngine({
  cards,
  selectedCardIds = [],
  onSelectCards,
  onPlayCard,
  allowMultiSelect = false,
  maxFanAngle = 40,
  disabled = false,
  playButtonText = '出牌',
}: CardFanEngineProps) {
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

  // 弧度计算
  const total = cards.length;
  const stepAngle = total > 1 ? Math.min(maxFanAngle / (total - 1), 8) : 0;
  const startAngle = total > 1 ? -((total - 1) * stepAngle) / 2 : 0;

  return (
    <div className="card-fan-container">
      {/* 选牌后的出牌操作浮条 */}
      {activeSelected.length > 0 && onPlayCard && (
        <div className="card-fan-action-bar">
          <button
            type="button"
            className="card-fan-play-btn"
            onClick={handlePlaySelected}
            disabled={disabled}
          >
            🚀 {playButtonText} ({activeSelected.length}张)
          </button>
        </div>
      )}

      {/* 扇形卡牌渲染区 */}
      <div className="card-fan-deck">
        {cards.map((card, idx) => {
          const isSelected = activeSelected.includes(card.id);
          const angle = startAngle + idx * stepAngle;
          const translateY = isSelected ? -24 : Math.abs(angle) * 0.8;
          const transform = `rotate(${angle}deg) translateY(${translateY}px)`;

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
