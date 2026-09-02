import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { GameActionFeedback } from '../../../shared-ui/GameMotion.tsx';
import { TabletopOvalShell, type TabletopTheme } from '../../../shared-ui/TabletopOvalShell.tsx';
import { buildWerewolfPhaseKey } from '../motion.ts';
import { WEREWOLF_ROLE_NAMES, type WerewolfPresentationModel, type WerewolfSeatModel } from '../presentation.ts';
import { EyeBlinkTransition } from './EyeBlinkTransition.tsx';
import { GameOverReveal } from './GameOverReveal.tsx';
import { MoonPhaseHeader } from './MoonPhaseHeader.tsx';
import { PrivateRolePanel } from './PrivateRolePanel.tsx';
import { SeatRing, SeatChip } from './SeatRing.tsx';
import { VoteLedger } from './VoteLedger.tsx';
import { WerewolfActionPanel } from './WerewolfActionPanel.tsx';
import { WerewolfRoleSpotlight } from './WerewolfRoleSpotlight.tsx';
import { useJudgeVoice } from './useJudgeVoice.ts';

interface WerewolfStageProps {
  readonly model: WerewolfPresentationModel;
  readonly synced: boolean;
  readonly busy: boolean;
  readonly error: string | null;
  readonly onAct: (payload: unknown) => void;
}

interface TargetMenuState {
  readonly seat: WerewolfSeatModel;
  readonly x: number;
  readonly y: number;
  readonly placement: 'above' | 'below';
}

export function WerewolfStage({ model, synced, busy, error, onAct }: WerewolfStageProps) {
  const [mobileLayout, setMobileLayout] = useState(false);
  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 767px), (orientation: landscape) and (max-height: 520px)');
    const update = () => setMobileLayout(mediaQuery.matches);
    update();
    mediaQuery.addEventListener('change', update);
    return () => mediaQuery.removeEventListener('change', update);
  }, []);

  // 头像点选目标菜单（放逐投票/夜间技能等目标型动作的就地选择）
  const [targetMenu, setTargetMenu] = useState<TargetMenuState | null>(null);
  const handleSelectTarget = useCallback((seat: WerewolfSeatModel, rect: DOMRect) => {
    setTargetMenu((prev) => {
      if (prev?.seat.playerId === seat.playerId) return null;
      const x = Math.min(Math.max(rect.left + rect.width / 2, 96), window.innerWidth - 96);
      return { seat, x, y: rect.top, placement: rect.top > 190 ? 'above' : 'below' };
    });
  }, []);
  useEffect(() => {
    if (!targetMenu) return;
    const onDocMouseDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest('.jv-target-menu') || target.closest('.seat-chip')) return;
      setTargetMenu(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setTargetMenu(null);
    };
    document.addEventListener('mousedown', onDocMouseDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [targetMenu]);

  // 阶段/天数变化后收起菜单；所选席位动作失效（如目标不可选）时同样收起
  useEffect(() => {
    setTargetMenu(null);
  }, [model.phase, model.day]);
  const selectedLiveSeat = targetMenu ? model.seats.find((seat) => seat.playerId === targetMenu.seat.playerId) ?? null : null;
  useEffect(() => {
    if (targetMenu && (!selectedLiveSeat || selectedLiveSeat.targetActions.length === 0)) setTargetMenu(null);
  }, [targetMenu, selectedLiveSeat]);

  const { currentNightRole, isNightVoiceRunning } = useJudgeVoice(model);

  const effectiveMood = isNightVoiceRunning ? 'night' : model.mood;
  const effectivePhase = isNightVoiceRunning ? 'night' : model.phase;
  const effectivePhaseLabel = isNightVoiceRunning ? '夜晚行动' : model.phaseLabel;
  const effectiveNarrative = isNightVoiceRunning
    ? (currentNightRole ? `法官正在引导 ${WEREWOLF_ROLE_NAMES[currentNightRole]} 行动` : '夜幕降临，万籁俱寂')
    : model.narrative;

  const isNightRoleActive = (model.phase === 'night' || isNightVoiceRunning) && currentNightRole !== null;
  const isMyTurnAtNight = model.phase === 'night' && isNightRoleActive && model.self?.role === currentNightRole;

  const displayActionGroups = isNightRoleActive
    ? (isMyTurnAtNight ? model.actionGroups : [])
    : model.actionGroups;

  const displayWaitingHint = isNightRoleActive && !isMyTurnAtNight
    ? `夜深了，法官正在引导 ${WEREWOLF_ROLE_NAMES[currentNightRole]} 行动...`
    : model.waitingHint;

  const effectiveModel: WerewolfPresentationModel = isNightVoiceRunning
    ? {
        ...model,
        mood: 'night',
        phase: 'night',
        phaseLabel: effectivePhaseLabel,
        narrative: effectiveNarrative,
      }
    : model;

  const phaseKey = buildWerewolfPhaseKey(effectiveModel);
  const speakingSeat = effectiveModel.seats.find((seat) => seat.isSpeaking);
  const liveStatus = error
    ? `操作失败：${error}`
    : busy
      ? `${effectiveModel.phaseLabel}，正在提交操作。`
      : isNightRoleActive && !isMyTurnAtNight
        ? `夜深了，法官正在引导 ${WEREWOLF_ROLE_NAMES[currentNightRole]} 行动。`
        : speakingSeat
          ? `${effectiveModel.phaseLabel}，当前由 ${speakingSeat.name} 发言。`
          : displayActionGroups.length > 0
            ? `${effectiveModel.phaseLabel}，轮到你行动。`
            : `${effectiveModel.phaseLabel}。${displayWaitingHint ?? effectiveModel.narrative}`;

  // 根据昼夜/阶段动态切换舞台主题与背景
  let dynamicTheme: TabletopTheme = 'tribunal';
  if (effectiveMood === 'day') {
    dynamicTheme = 'tribunal-day';
  } else if (effectiveMood === 'night') {
    dynamicTheme = 'tribunal-night';
  } else if (effectiveMood === 'dawn') {
    dynamicTheme = 'tribunal-dawn';
  }

  const isNight = effectiveMood === 'night';
  const isDay = effectiveMood === 'day';
  const isDawn = effectiveMood === 'dawn';

  // 竖屏分列席位：左翼自上而下 1~4 号，右翼自上而下 5~8 号（号码不变，仅排列方式）
  const half = Math.ceil(model.seats.length / 2);
  const leftSeats = model.seats.slice(0, half);
  const rightSeats = model.seats.slice(half);

  const centerArena = (
    <div
      className={`werewolf-arena werewolf-arena--${effectiveMood}`}
      aria-busy={busy}
      data-current-actor={speakingSeat?.playerId}
    >
      <p className="focused-game-sr-live" role="status" aria-live="polite" aria-atomic="true">
        {liveStatus}
      </p>
      {/* 眨眼昼夜交替转场特效 (Eye-Blink Cinematic Transition) */}
      <EyeBlinkTransition mood={effectiveMood} />

      {/* 动态氛围粒子与暗夜迷雾层 */}
      <div className="werewolf-ambient-fx" aria-hidden="true">
        {isNight && <div className="werewolf-fog-drift" />}
        {isNight && <div className="werewolf-night-stars" />}
        {isDay && <div className="werewolf-day-sunbeams" />}
        {isDawn && <div className="werewolf-dawn-glow" />}
      </div>

      {!mobileLayout && (
        <SeatRing
          seats={model.seats}
          mood={effectiveMood}
          className="werewolf-desktop-seat-ring"
          onSelectTarget={handleSelectTarget}
          selectedPlayerId={targetMenu?.seat.playerId ?? null}
        />
      )}

      {mobileLayout && (
        <ol className="werewolf-wing werewolf-wing--left" aria-label="左侧席位">
          {leftSeats.map((seat) => (
            <SeatChip
              key={seat.playerId}
              seat={seat}
              onSelectTarget={handleSelectTarget}
              isTargetSelected={targetMenu?.seat.playerId === seat.playerId}
            />
          ))}
        </ol>
      )}

      {/* 中央发言/天象舞台（桌面居中，移动端在左右翼之间） */}
      <div className="werewolf-arena__center-stack">
        <MoonPhaseHeader
          dayLabel={effectiveModel.dayLabel}
          phaseLabel={effectiveModel.phaseLabel}
          narrative={effectiveModel.narrative}
          mood={effectiveMood}
          deadlineAt={effectiveModel.deadlineAt}
          spectator={effectiveModel.spectator}
        />

        {/* 终局身份大复盘或角色阶段情报大卡片 */}
        {effectiveModel.reveal !== null ? (
          <GameOverReveal reveal={effectiveModel.reveal} seats={effectiveModel.seats} />
        ) : (
          <WerewolfRoleSpotlight model={effectiveModel} />
        )}
      </div>

      {mobileLayout && (
        <ol className="werewolf-wing werewolf-wing--right" aria-label="右侧席位">
          {rightSeats.map((seat) => (
            <SeatChip
              key={seat.playerId}
              seat={seat}
              onSelectTarget={handleSelectTarget}
              isTargetSelected={targetMenu?.seat.playerId === seat.playerId}
            />
          ))}
        </ol>
      )}

      <p className="werewolf-arena__caption" aria-hidden="true">
        {isNight ? '☾ 暗夜审判桌' : '☼ 白昼公投厅'} · {model.seats.length} 人局
      </p>

      {/* 头像点击目标选项弹出浮层 */}
      {targetMenu && selectedLiveSeat && selectedLiveSeat.targetActions.length > 0 && (
        <div
          className={`jv-target-menu jv-target-menu--${targetMenu.placement}`}
          style={{ left: `${targetMenu.x}px`, top: `${targetMenu.y}px` }}
          role="menu"
          aria-label={`${selectedLiveSeat.seatLabel} 操作选项`}
        >
          <div className="jv-target-menu__header">
            <span className="jv-target-menu__seat">{selectedLiveSeat.seatLabel}</span>
            <span className="jv-target-menu__name">{selectedLiveSeat.name}</span>
          </div>
          <div className="jv-target-menu__actions">
            {selectedLiveSeat.targetActions.map((action) => (
              <button
                key={action.id}
                type="button"
                className="jv-target-menu__btn"
                onClick={() => {
                  setTargetMenu(null);
                  onAct(action.payload);
                }}
              >
                {action.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  const bottomControls = (
    <div className="werewolf-bottom-dock">
      <VoteLedger progress={model.voteProgress} ledger={model.voteLedger} />
      <WerewolfActionPanel
        groups={displayActionGroups}
        waitingHint={displayWaitingHint}
        busy={busy}
        phaseKey={phaseKey}
        onAct={onAct}
      />
      <PrivateRolePanel self={effectiveModel.self} synced={synced} />
    </div>
  );

  return (
    <TabletopOvalShell
      title="狼人杀"
      subtitle={`${model.seats.length} 人局`}
      gameId="werewolf"
      theme={dynamicTheme}
      hideSeats={true}
      players={[]}
      centerArena={centerArena}
      bottomBar={bottomControls}
      phaseKey={phaseKey}
      stageFit="arena"
    />
  );
}
