import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { TabletopOvalShell, type TabletopTheme } from '../../../shared-ui/TabletopOvalShell.tsx';
import { useCompactLayout } from '../../../shared-ui/useCompactLayout.ts';
import { buildWerewolfPhaseKey } from '../motion.ts';
import type { WerewolfRole } from '../types.ts';
import {
  WEREWOLF_ROLE_ARTWORK,
  WEREWOLF_ROLE_NAMES,
  type WerewolfPresentationModel,
  type WerewolfSeatModel,
} from '../presentation.ts';
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
  const mobileLayout = useCompactLayout();

  const [unreadChat, setUnreadChat] = useState(0);

  useEffect(() => {
    const handleUnread = (e: Event) => {
      const customEvent = e as CustomEvent<{ unreadCount: number }>;
      setUnreadChat(customEvent.detail?.unreadCount ?? 0);
    };
    window.addEventListener('ldj:chat-unread', handleUnread);
    return () => window.removeEventListener('ldj:chat-unread', handleUnread);
  }, []);

  const handleOpenChat = useCallback(() => {
    const trigger = document.querySelector<HTMLButtonElement>('.game-chat-trigger');
    if (trigger) {
      trigger.click();
    } else {
      window.dispatchEvent(new CustomEvent('ldj:open-chat'));
    }
  }, []);

  const { currentNightRole, isNightVoiceRunning, isDayAnnouncementRunning, roleRemainingSeconds } = useJudgeVoice(model);

  const effectiveMood = isNightVoiceRunning
    ? 'night'
    : isDayAnnouncementRunning
      ? 'dawn'
      : model.mood;
  const effectivePhase = isNightVoiceRunning
    ? 'night'
    : isDayAnnouncementRunning
      ? 'day_announcement'
      : model.phase;
  const effectivePhaseLabel = isNightVoiceRunning
    ? (currentNightRole ? `${WEREWOLF_ROLE_NAMES[currentNightRole]}行动` : '夜晚行动')
    : isDayAnnouncementRunning
      ? '天亮公布'
      : model.phaseLabel;
  const effectiveNarrative = isNightVoiceRunning
    ? (currentNightRole ? `法官正在引导 ${WEREWOLF_ROLE_NAMES[currentNightRole]} 行动` : '夜幕降临，万籁俱寂')
    : isDayAnnouncementRunning
      ? (model.nightDeathSeats.length === 0 ? '昨夜是平安夜' : `昨夜有 ${model.nightDeathSeats.length} 人遇难`)
      : model.narrative;

  // 轮到谁的行动环节，顶部表盘动态切换为该角色的专属立绘
  const activeNightRoleKey = (currentNightRole as WerewolfRole | null) ?? (model.nightStage && model.nightStage !== 'done' ? (model.nightStage as WerewolfRole) : null);
  const activeRole: WerewolfRole | null =
    effectivePhase === 'hunter_shot'
      ? 'hunter'
      : effectivePhase === 'night' && activeNightRoleKey
        ? activeNightRoleKey
        : null;
  const activeRoleArtwork = activeRole ? (WEREWOLF_ROLE_ARTWORK[activeRole] ?? null) : null;

  const isNightRoleActive = (model.phase === 'night' || isNightVoiceRunning) && currentNightRole !== null;
  const isMyTurnAtNight = model.phase === 'night' && isNightRoleActive && model.self?.role === currentNightRole;
  const isActionAllowed = isNightRoleActive ? isMyTurnAtNight : true;

  const displayActionGroups = isNightRoleActive
    ? (isMyTurnAtNight ? model.actionGroups : [])
    : isDayAnnouncementRunning
      ? []
      : model.actionGroups;

  const displayWaitingHint = isNightRoleActive && !isMyTurnAtNight
    ? `夜深了，法官正在引导 ${WEREWOLF_ROLE_NAMES[currentNightRole]} 行动...`
    : isDayAnnouncementRunning
      ? '天亮了，法官正在公布昨夜战况...'
      : model.waitingHint;

  // 头像点选目标菜单（放逐投票/夜间技能等目标型动作的就地选择）
  const [targetMenu, setTargetMenu] = useState<TargetMenuState | null>(null);
  const handleSelectTarget = useCallback((seat: WerewolfSeatModel, rect: DOMRect) => {
    setTargetMenu((prev) => {
      if (prev?.seat.playerId === seat.playerId) return null;
      const menuWidth = 220;
      const menuEstimatedHeight = 150;
      const x = Math.min(Math.max(rect.left + rect.width / 2, menuWidth / 2 + 16), window.innerWidth - menuWidth / 2 - 16);
      const spaceAbove = rect.top - 60; // 避开顶部 60px header
      const placement: 'above' | 'below' = spaceAbove >= menuEstimatedHeight ? 'above' : 'below';
      const y = placement === 'above' ? Math.max(rect.top - 8, 70) : Math.min(rect.bottom + 8, window.innerHeight - 80);
      return { seat, x, y, placement };
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

  // 阶段/天数变化后收起菜单
  useEffect(() => {
    setTargetMenu(null);
  }, [model.phase, model.day]);

  // 在夜间全流程播放结束前，全场包括死者本人均保持存活显示，杜绝夜晚提前置灰泄露战况；在夜间及公布战况播报期间，强制屏蔽席位“发言中”标识
  const effectiveSeats = model.seats.map((seat) => {
    const seatNum = Number(seat.seatLabel.replace(/\D/g, '')) - 1;
    const hideDeath = isNightVoiceRunning && model.nightDeathSeats.includes(seatNum);
    return {
      ...seat,
      alive: hideDeath ? true : seat.alive,
      statusLabel: hideDeath ? '存活' : seat.statusLabel,
      isSpeaking: isNightVoiceRunning || isDayAnnouncementRunning ? false : seat.isSpeaking,
      targetActions: isActionAllowed ? seat.targetActions : [],
    };
  });

  const selectedLiveSeat = targetMenu ? effectiveSeats.find((seat) => seat.playerId === targetMenu.seat.playerId) ?? null : null;
  useEffect(() => {
    if (targetMenu && (!selectedLiveSeat || selectedLiveSeat.targetActions.length === 0)) {
      setTargetMenu(null);
    }
  }, [targetMenu, selectedLiveSeat]);

  const selfSeatNum = model.seats.find((s) => s.isSelf)
    ? Number(model.seats.find((s) => s.isSelf)!.seatLabel.replace(/\D/g, '')) - 1
    : -1;
  const isSelfTonightDeath = isNightVoiceRunning && model.nightDeathSeats.includes(selfSeatNum);

  const effectiveSelf = model.self
    ? {
        ...model.self,
        alive: isSelfTonightDeath ? true : model.self.alive,
      }
    : null;

  const effectiveModel: WerewolfPresentationModel = isNightVoiceRunning || isDayAnnouncementRunning
    ? {
        ...model,
        mood: effectiveMood,
        phase: effectivePhase,
        phaseLabel: effectivePhaseLabel,
        narrative: effectiveNarrative,
        seats: effectiveSeats,
        self: effectiveSelf,
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

  // 竖屏分列席位：使用已处理黑夜遮罩的 effectiveModel.seats
  const half = Math.ceil(effectiveModel.seats.length / 2);
  const leftSeats = effectiveModel.seats.slice(0, half);
  const rightSeats = effectiveModel.seats.slice(half);

  const playerCount = effectiveModel.seats.length;
  const wolfCount = playerCount >= 11 ? 4 : playerCount >= 9 ? 3 : 2;
  const specialsCount = 2 + (effectiveModel.rolesConfig.guard ? 1 : 0) + (effectiveModel.rolesConfig.hunter ? 1 : 0) + (effectiveModel.rolesConfig.idiot ? 1 : 0);
  const villagerCount = Math.max(0, playerCount - wolfCount - specialsCount);
  const boardSummary = `${playerCount} 人局 · ${wolfCount} 狼 · ${specialsCount} 神 · ${villagerCount} 民`;

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

      {/* 顶部天象看板：作为全场阶段/倒计时置顶状态栏（移动端全宽横贯，桌面端通栏居中） */}
      <MoonPhaseHeader
        dayLabel={effectiveModel.dayLabel}
        phaseLabel={effectiveModel.phaseLabel}
        narrative={effectiveModel.narrative}
        mood={effectiveMood}
        deadlineAt={isNightVoiceRunning ? null : effectiveModel.deadlineAt}
        overrideSeconds={isNightVoiceRunning ? roleRemainingSeconds : null}
        spectator={effectiveModel.spectator}
        roleArtworkUrl={activeRoleArtwork}
      />

      {/* 舞台核心对局桌：桌面呈现马蹄环绕，移动端呈现左右分列与中央聚焦 */}
      <div className="werewolf-arena__board">
        {!mobileLayout && (
          <SeatRing
            seats={effectiveModel.seats}
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

        {/* 中央发言/翻牌/复盘舞台 */}
        <div className="werewolf-arena__center-stack">
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
      </div>

      <p className="werewolf-arena__caption" aria-hidden="true">
        {isNight ? '暗夜审判桌' : '白昼公投厅'} · {boardSummary}
      </p>

      {/* 头像点击目标选项弹出浮层（通过 createPortal 挂载到 document.body，彻底解决舞台 transform 与 overflow 裁切导致浮层错位或无法显示的问题） */}
      {targetMenu && selectedLiveSeat && selectedLiveSeat.targetActions.length > 0 && typeof document !== 'undefined' &&
        createPortal(
          <div
            className={`jv-target-menu jv-target-menu--${targetMenu.placement}`}
            style={{
              left: `${targetMenu.x}px`,
              top: `${targetMenu.y}px`,
            }}
            role="dialog"
            aria-label={`${selectedLiveSeat.seatLabel} 操作选项`}
          >
            <div className="jv-target-menu__header">
              <span className="jv-target-menu__seat">{selectedLiveSeat.seatLabel}</span>
              <strong className="jv-target-menu__name">{selectedLiveSeat.name}</strong>
              <button
                type="button"
                className="jv-target-menu__close"
                onClick={() => setTargetMenu(null)}
                aria-label="关闭操作选项"
              >
                ✕
              </button>
            </div>
            <div className="jv-target-menu__actions">
              {selectedLiveSeat.targetActions.map((action) => (
                <button
                  key={action.id}
                  type="button"
                  className={`jv-target-menu__btn ${
                    action.label.includes('袭击') || action.label.includes('毒杀') || action.label.includes('开枪')
                      ? 'jv-target-menu__btn--danger'
                      : action.label.includes('救') || action.label.includes('守护')
                      ? 'jv-target-menu__btn--safe'
                      : 'jv-target-menu__btn--primary'
                  }`}
                  onClick={() => {
                    setTargetMenu(null);
                    onAct(action.payload);
                  }}
                >
                  {action.label}
                </button>
              ))}
            </div>
          </div>,
          document.body
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
      <div className="werewolf-bottom-dock__row">
        <PrivateRolePanel self={effectiveModel.self} synced={synced} />
        <button
          type="button"
          className="werewolf-bottom-chat-btn"
          onClick={handleOpenChat}
          aria-label={unreadChat > 0 ? `打开对局聊天，${unreadChat} 条未读消息` : '打开对局聊天'}
          title="打开对局聊天"
        >
          <span className="chat-trigger-icon" aria-hidden="true"><i /><i /><i /></span>
          <span>聊天</span>
          {unreadChat > 0 && (
            <strong className="chat-unread-badge">
              {unreadChat > 99 ? '99+' : unreadChat}
            </strong>
          )}
        </button>
      </div>
    </div>
  );

  return (
    <TabletopOvalShell
      title="狼人杀"
      subtitle={boardSummary}
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
