import React from 'react';
import {
  calculateWerewolfDistribution,
  type WerewolfDistributionResult,
} from '@ldj/shared';

type ConfigValue = string | number | boolean | null | undefined;

interface WerewolfCampPreviewProps {
  readonly playerCount: number;
  readonly gameConfig: Record<string, unknown>;
  readonly isHost?: boolean;
  readonly disabled?: boolean;
  readonly onChangeConfig?: (patch: Record<string, ConfigValue>) => void;
}

const SPECIAL_ROLE_NAMES: Record<string, string> = {
  seer: '预言家',
  witch: '女巫',
  guard: '守卫',
  hunter: '猎人',
  idiot: '白痴',
};

export function WerewolfCampPreview({
  playerCount,
  gameConfig,
  isHost = false,
  disabled = false,
  onChangeConfig,
}: WerewolfCampPreviewProps) {
  const wolfDelta = typeof gameConfig.wolfDelta === 'number' ? gameConfig.wolfDelta : 0;
  const guard = Boolean(gameConfig.guard);
  const hunter = Boolean(gameConfig.hunter);
  const idiot = Boolean(gameConfig.idiot);

  const dist: WerewolfDistributionResult = calculateWerewolfDistribution({
    playerCount,
    wolfDelta,
    guard,
    hunter,
    idiot,
  });

  const canEdit = isHost && Boolean(onChangeConfig) && !disabled;

  const handleStepWolf = (step: number) => {
    if (!canEdit || !onChangeConfig) return;
    const nextDelta = dist.wolfDelta + step;
    onChangeConfig({ wolfDelta: nextDelta });
  };

  const handleReset = () => {
    if (!canEdit || !onChangeConfig) return;
    onChangeConfig({ wolfDelta: 0 });
  };

  const specialsFormatted = dist.specials.map((s) => SPECIAL_ROLE_NAMES[s] ?? s).join(' · ');

  return (
    <div className="werewolf-camp-preview">
      <div className="werewolf-camp-preview__header">
        <div className="werewolf-camp-preview__title-row">
          <span className="werewolf-camp-preview__icon">⚖️</span>
          <span className="werewolf-camp-preview__title">
            {playerCount >= 6 && playerCount <= 12
              ? `当前 ${playerCount} 人局阵营分布`
              : `阵营分布（当前 ${playerCount} 人，需 6–12 人）`}
          </span>
          {dist.boardBadge && <span className="werewolf-camp-preview__badge">{dist.boardBadge}</span>}
          {canEdit && dist.wolfDelta !== 0 && (
            <button
              type="button"
              className="werewolf-camp-preview__reset-btn"
              onClick={handleReset}
              title="重置为推荐的阵营配比"
            >
              重置推荐
            </button>
          )}
        </div>
        <span className="werewolf-camp-preview__tiers">
          梯度：6–8人配2狼 · 9–10人配3狼 · 11–12人配4狼，支持 ±1 狼调整。
        </span>
      </div>

      {!dist.isValid && dist.error && (
        <div className="werewolf-camp-preview__alert" role="alert">
          ⚠️ {dist.error}
        </div>
      )}

      <div className="werewolf-camp-preview__cards">
        {/* 狼人卡片 */}
        <div className="werewolf-camp-card werewolf-camp-card--wolf">
          <div className="werewolf-camp-card__head">
            <img
              src="/assets/roles/werewolf.png"
              alt=""
              className="werewolf-camp-card__role-art"
            />
            <span className="werewolf-camp-card__name">狼人阵营</span>
            {canEdit ? (
              <div className="werewolf-camp-card__stepper">
                <button
                  type="button"
                  className="werewolf-camp-card__stepper-btn"
                  disabled={!dist.canDecreaseWolves}
                  title={dist.decreaseDisabledReason ?? '减少 1 名狼人'}
                  onClick={() => handleStepWolf(-1)}
                  aria-label="减少 1 名狼人"
                >
                  −
                </button>
                <span className="werewolf-camp-card__count">{dist.wolfCount} 人</span>
                <button
                  type="button"
                  className="werewolf-camp-card__stepper-btn"
                  disabled={!dist.canIncreaseWolves}
                  title={dist.increaseDisabledReason ?? '增加 1 名狼人'}
                  onClick={() => handleStepWolf(1)}
                  aria-label="增加 1 名狼人"
                >
                  +
                </button>
              </div>
            ) : (
              <span className="werewolf-camp-card__count">{dist.wolfCount} 人</span>
            )}
          </div>
          <div className="werewolf-camp-card__details">
            <span>狼人 × {dist.wolfCount}</span>
            <small className="werewolf-camp-card__hint">
              推荐 {dist.baseWolves} 人（可微调 {dist.minWolves}–{dist.maxWolves} 人）
            </small>
          </div>
        </div>

        {/* 神职卡片 */}
        <div className="werewolf-camp-card werewolf-camp-card--god">
          <div className="werewolf-camp-card__head">
            <img
              src="/assets/roles/seer.png"
              alt=""
              className="werewolf-camp-card__role-art"
            />
            <span className="werewolf-camp-card__name">神职阵营</span>
            <span className="werewolf-camp-card__count">{dist.specialsCount} 人</span>
          </div>
          <div className="werewolf-camp-card__details">
            <span>{specialsFormatted}</span>
            <small className="werewolf-camp-card__hint">基础神职包含预言家与女巫</small>
          </div>
        </div>

        {/* 平民卡片 */}
        <div className="werewolf-camp-card werewolf-camp-card--villager">
          <div className="werewolf-camp-card__head">
            <img
              src="/assets/roles/villager.png"
              alt=""
              className="werewolf-camp-card__role-art"
            />
            <span className="werewolf-camp-card__name">平民阵营</span>
            <span className="werewolf-camp-card__count">{Math.max(0, dist.villagerCount)} 人</span>
          </div>
          <div className="werewolf-camp-card__details">
            <span>普通村民 × {Math.max(0, dist.villagerCount)}</span>
            <small className="werewolf-camp-card__hint">
              {dist.villagerCount <= 2 ? '平民保底 2 人' : '依据总人数自动分配'}
            </small>
          </div>
        </div>
      </div>
    </div>
  );
}
