import React from 'react';
import { TabletopOvalShell, type TabletopTheme } from '../../../shared-ui/TabletopOvalShell.tsx';
import { GameLeaveButton } from '../../GameLeaveButton.tsx';
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
    <div className={`werewolf-arena werewolf-arena--${model.mood}`}>
      {/* 眨眼昼夜交替转场特效 (Eye-Blink Cinematic Transition) */}
      <EyeBlinkTransition mood={model.mood} />

      {/* 动态氛围粒子与暗夜迷雾层 */}
      <div className="werewolf-ambient-fx" aria-hidden="true">
        {isNight && <div className="werewolf-fog-drift" />}
        {isNight && <div className="werewolf-night-stars" />}
        {isDay && <div className="werewolf-day-sunbeams" />}
        {isDawn && <div className="werewolf-dawn-glow" />}
      </div>

      {/* 桌面宽屏模式：马蹄形全景环绕席位 */}
      <SeatRing seats={model.seats} mood={model.mood} className="werewolf-desktop-seat-ring" />

      {/* 移动端竖屏模式：左侧席位列 */}
      <ol className="werewolf-wing werewolf-wing--left" aria-label="左侧席位">
        {leftSeats.map((seat) => (
          <SeatChip key={seat.playerId} seat={seat} />
        ))}
      </ol>

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

      {/* 移动端竖屏模式：右侧席位列 */}
      <ol className="werewolf-wing werewolf-wing--right" aria-label="右侧席位">
        {rightSeats.map((seat) => (
          <SeatChip key={seat.playerId} seat={seat} />
        ))}
      </ol>

      <p className="werewolf-arena__caption" aria-hidden="true">
        {isNight ? '☾ 暗夜审判桌' : '☼ 白昼公投厅'} · {model.seats.length} 人局
      </p>

      {error && <p className="game-error werewolf-stage__error" role="alert">{error}</p>}
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
          onAct={onAct}
        />
        <VoteLedger progress={model.voteProgress} ledger={model.voteLedger} />
      </div>
    </div>
  );

  return (
    <TabletopOvalShell
      title="狼人杀"
      theme={dynamicTheme}
      players={[]}
      currentUserId={model.self?.playerId}
      topRightControls={<GameLeaveButton />}
      centerArena={centerArena}
      bottomBar={bottomBar}
    />
  );
}
