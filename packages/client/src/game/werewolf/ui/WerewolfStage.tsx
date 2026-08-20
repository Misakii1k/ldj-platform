import React, { useEffect, useState } from 'react';
import { GameActionFeedback } from '../../../shared-ui/GameMotion.tsx';
import { TabletopOvalShell, type TabletopTheme } from '../../../shared-ui/TabletopOvalShell.tsx';
import { GameLeaveButton } from '../../GameLeaveButton.tsx';
import { buildWerewolfPhaseKey } from '../motion.ts';
import type { WerewolfPresentationModel } from '../presentation.ts';
import { EyeBlinkTransition } from './EyeBlinkTransition.tsx';
import { GameOverReveal } from './GameOverReveal.tsx';
import { MoonPhaseHeader } from './MoonPhaseHeader.tsx';
import { PrivateRolePanel } from './PrivateRolePanel.tsx';
import { SeatRing, SeatChip } from './SeatRing.tsx';
import { VoteLedger } from './VoteLedger.tsx';
import { WerewolfActionPanel } from './WerewolfActionPanel.tsx';
import { WerewolfRoleSpotlight } from './WerewolfRoleSpotlight.tsx';

interface WerewolfStageProps {
  readonly model: WerewolfPresentationModel;
  readonly synced: boolean;
  readonly busy: boolean;
  readonly error: string | null;
  readonly onAct: (payload: unknown) => void;
}

export function WerewolfStage({ model, synced, busy, error, onAct }: WerewolfStageProps) {
  const [mobileLayout, setMobileLayout] = useState(false);
  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 899px), (orientation: landscape) and (max-height: 520px)');
    const update = () => setMobileLayout(mediaQuery.matches);
    update();
    mediaQuery.addEventListener('change', update);
    return () => mediaQuery.removeEventListener('change', update);
  }, []);
  const phaseKey = buildWerewolfPhaseKey(model);
  const speakingSeat = model.seats.find((seat) => seat.isSpeaking);
  const liveStatus = error
    ? `操作失败：${error}`
    : busy
      ? `${model.phaseLabel}，正在提交操作。`
      : speakingSeat
        ? `${model.phaseLabel}，当前由 ${speakingSeat.name} 发言。`
        : model.actionGroups.length > 0
          ? `${model.phaseLabel}，轮到你行动。`
          : `${model.phaseLabel}。${model.waitingHint ?? model.narrative}`;
  // 根据昼夜/阶段动态切换舞台主题与背景
  let dynamicTheme: TabletopTheme = 'tribunal';
  if (model.mood === 'day') {
    dynamicTheme = 'tribunal-day';
  } else if (model.mood === 'night') {
    dynamicTheme = 'tribunal-night';
  } else if (model.mood === 'dawn') {
    dynamicTheme = 'tribunal-dawn';
  }

  const isNight = model.mood === 'night';
  const isDay = model.mood === 'day';
  const isDawn = model.mood === 'dawn';

  // 竖屏分列席位：左翼为偶数下标（1, 3, 5号...），右翼为奇数下标（2, 4, 6号...）
  const leftSeats = model.seats.filter((_, i) => i % 2 === 0);
  const rightSeats = model.seats.filter((_, i) => i % 2 === 1);

  const centerArena = (
    <div
      className={`werewolf-arena werewolf-arena--${model.mood}`}
      aria-busy={busy}
      data-current-actor={speakingSeat?.playerId}
    >
      <p className="focused-game-sr-live" role="status" aria-live="polite" aria-atomic="true">
        {liveStatus}
      </p>
      {/* 眨眼昼夜交替转场特效 (Eye-Blink Cinematic Transition) */}
      <EyeBlinkTransition mood={model.mood} />

      {/* 动态氛围粒子与暗夜迷雾层 */}
      <div className="werewolf-ambient-fx" aria-hidden="true">
        {isNight && <div className="werewolf-fog-drift" />}
        {isNight && <div className="werewolf-night-stars" />}
        {isDay && <div className="werewolf-day-sunbeams" />}
        {isDawn && <div className="werewolf-dawn-glow" />}
      </div>

      {!mobileLayout && (
        <SeatRing seats={model.seats} mood={model.mood} className="werewolf-desktop-seat-ring" />
      )}

      {mobileLayout && (
        <ol className="werewolf-wing werewolf-wing--left" aria-label="左侧席位">
          {leftSeats.map((seat) => (
            <SeatChip key={seat.playerId} seat={seat} />
          ))}
        </ol>
      )}

      {/* 中央发言/天象舞台（桌面居中，移动端在左右翼之间） */}
      <div className="werewolf-arena__center-stack">
        <MoonPhaseHeader
          dayLabel={model.dayLabel}
          phaseLabel={model.phaseLabel}
          narrative={model.narrative}
          mood={model.mood}
          deadlineAt={model.deadlineAt}
          spectator={model.spectator}
        />

        {/* 终局身份大复盘或角色阶段情报大卡片 */}
        {model.reveal !== null ? (
          <GameOverReveal reveal={model.reveal} seats={model.seats} />
        ) : (
          <WerewolfRoleSpotlight model={model} />
        )}
      </div>

      {mobileLayout && (
        <ol className="werewolf-wing werewolf-wing--right" aria-label="右侧席位">
          {rightSeats.map((seat) => (
            <SeatChip key={seat.playerId} seat={seat} />
          ))}
        </ol>
      )}

      <p className="werewolf-arena__caption" aria-hidden="true">
        {isNight ? '☾ 暗夜审判桌' : '☼ 白昼公投厅'} · {model.seats.length} 人局
      </p>

      {error && (
        <GameActionFeedback
          active
          feedbackKey={`${phaseKey}:${error}`}
          variant="error"
          className="game-error werewolf-stage__error focused-game-feedback focused-game-feedback--error"
          role="alert"
          aria-live="assertive"
          aria-atomic="true"
        >
          {error}
        </GameActionFeedback>
      )}
    </div>
  );

  const bottomBar = (
    <div className="werewolf-bottom-dock">
      <div className="werewolf-bottom-dock__left">
        <PrivateRolePanel self={model.self} synced={synced} />
      </div>

      <div className="werewolf-bottom-dock__main">
        <WerewolfActionPanel
          groups={model.actionGroups}
          waitingHint={model.waitingHint}
          busy={busy}
          phaseKey={phaseKey}
          onAct={onAct}
        />
        <VoteLedger progress={model.voteProgress} ledger={model.voteLedger} />
      </div>
    </div>
  );

  return (
    <TabletopOvalShell
      title="狼人杀"
      gameId="werewolf"
      theme={dynamicTheme}
      players={[]}
      currentUserId={model.self?.playerId}
      topRightControls={<GameLeaveButton />}
      phaseKey={phaseKey}
      centerArena={centerArena}
      bottomBar={bottomBar}
    />
  );
}
