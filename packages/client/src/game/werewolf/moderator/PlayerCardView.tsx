import './moderator-voice.css';
import { useTimelineJudgeVoice } from '../ui/useJudgeVoice.ts';
import { useConnection } from '../../../connection/useConnection.ts';
/**
 * 玩家端：抽卡 → 私密查看身份 → 跟随法官的出局/终局同步。
 *
 * 与其它游戏页同构：TabletopOvalShell 提供顶栏、快捷菜单、暂离/退出房间与结算坞；
 * 席位用共享 SeatRing / SeatChip，身份牌用共享 IdentityFlipCard（gothic 主题，
 * 自带失焦自动扣牌），终局复盘用共享 GameOverReveal。
 *
 * 座位号一律来自房间席位（见 presentation.ts），与大厅显示一致。
 */
import { useCallback, useMemo, useState } from 'react';
import type { RoomMemberView, WerewolfModeratorView } from '@ldj/shared';
import { TabletopOvalShell } from '../../../shared-ui/TabletopOvalShell.tsx';
import { SecretRoleCard } from '../ui/SecretRoleCard.tsx';
import { IdentityFlipCard } from '../../../shared-ui/IdentityFlipCard.tsx';
import { useCompactLayout } from '../../../shared-ui/useCompactLayout.ts';
import { SeatChip, SeatRing } from '../ui/SeatRing.tsx';
import { GameOverReveal } from '../ui/GameOverReveal.tsx';
import { WEREWOLF_ROLE_DETAILS } from '../presentation.ts';
import { buildModeratorPlayerModel } from './presentation.ts';
import { defaultRevealStore, hasConfirmedReveal, markRevealConfirmed } from './revealState.ts';
import { DealCeremony } from './DealCeremony.tsx';
import { ModeratorRulesSheet } from './ModeratorRulesSheet.tsx';
import { RoleTurnOverlay } from '../ui/RoleTurnOverlay.tsx';

interface PlayerCardViewProps {
  readonly view: WerewolfModeratorView;
  readonly members: readonly RoomMemberView[];
  readonly sessionId: string;
  readonly myUserId?: string;
  readonly myAvatar?: string | null;
  readonly spectator?: boolean;
}

type CeremonyPhase = 'shuffle' | 'flip' | 'done';

export function PlayerCardView({
  view,
  members,
  sessionId,
  myUserId,
  myAvatar,
  spectator = false,
}: PlayerCardViewProps) {
  const { state: connection } = useConnection();
  const voice = useTimelineJudgeVoice(view.timeline, { announcement: view.announcement, clockSample: connection.clockSample });
  const model = useMemo(
    () => buildModeratorPlayerModel(view, members, { selfId: myUserId, myAvatar, spectator }),
    [view, members, myUserId, myAvatar, spectator],
  );
  const store = useMemo(() => defaultRevealStore(), []);
  const [phase, setPhase] = useState<CeremonyPhase>(() => (
    spectator || hasConfirmedReveal(store, sessionId, myUserId ?? '') ? 'done' : 'shuffle'
  ));
  const [rulesOpen, setRulesOpen] = useState(false);

  const handleCeremonyFinished = useCallback(() => {
    setPhase((current) => (current === 'shuffle' ? 'flip' : current));
  }, []);

  const handleConfirmReveal = useCallback(() => {
    markRevealConfirmed(store, sessionId, myUserId ?? '');
    setPhase('done');
  }, [store, sessionId, myUserId]);

  const handleReplayCeremony = useCallback(() => setPhase('shuffle'), []);

  const compact = useCompactLayout();


  const self = model.self;
  const showCeremony = phase === 'shuffle' && self !== null;

  const renderCenterContent = () => (
    <>
      {showCeremony && <DealCeremony onFinished={handleCeremonyFinished} />}

      {spectator ? (
        <p className="mod-player-spectator" role="status">
          观战视角 · 仅显示全场存活状态，身份由法官在终局公开
        </p>
      ) : self !== null ? (phase === 'done' ? <SecretRoleCard name={self.name} camp={self.campName} artwork={self.artUrl}>
          <p>{WEREWOLF_ROLE_DETAILS[self.role].skill}</p>
          <p>{WEREWOLF_ROLE_DETAILS[self.role].win}</p>
        </SecretRoleCard> : <IdentityFlipCard
          theme="gothic"
          roleName={self.name}
          roleSubtitle={self.campName}
          roleCamp={self.camp === 'wolves' ? 'evil' : 'good'}
          artworkUrl={self.artUrl}
          secretHints={[
            `技能：${WEREWOLF_ROLE_DETAILS[self.role].skill}`,
            `获胜：${WEREWOLF_ROLE_DETAILS[self.role].win}`,
          ]}
          revealMode="flip"
          confirmed={false}
          onConfirm={handleConfirmReveal}
          confirmButtonText="我已记下，进入对局"
        />
      ) : (
        <p className="mod-player-spectator" role="status">
          正在等待法官分发身份牌…
        </p>
      )}

      {!model.selfAlive && (
        <p className="mod-player-eliminated" role="status">
          你已被法官标记出局，请保持安静并停止发言
        </p>
      )}

      {view.timeline && view.timeline.mode === 'manual' && !view.timeline.paused && (
        <p className="mod-player-timeline-hint" role="status" style={{ margin: '8px 0', color: 'var(--secondary)' }}>
          等待主持人推进 · 当前环节：{view.timeline.label}
        </p>
      )}
      {view.timeline?.paused && (
        <p className="mod-player-timeline-hint" role="status" style={{ margin: '8px 0', color: '#f87171' }}>
          主持人已暂停对局
        </p>
      )}

      <GameOverReveal reveal={model.reveal} seats={model.seats} />
    </>
  );

  const centerArena = (
    <div className="mod-player-arena">
      <RoleTurnOverlay
        role={view.timeline?.role ?? null}
        segment={view.timeline?.segment ?? null}
        timelineId={view.timeline?.id ?? null}
        period={view.timeline?.period ?? null}
      />
      {compact ? (
        <div className="ww-seat-rails" role="region" aria-label="对局席位与身份">
          <ol className="ww-seat-rail ww-seat-rail--left" aria-label="左半场席位">
            {model.seats.slice(0, Math.ceil(model.seats.length / 2)).map((seat) => <SeatChip key={seat.playerId} seat={seat} />)}
          </ol>
          <div className="mod-player-center ww-seat-rails__center">
            {renderCenterContent()}
          </div>
          <ol className="ww-seat-rail ww-seat-rail--right" aria-label="右半场席位">
            {model.seats.slice(Math.ceil(model.seats.length / 2)).map((seat) => <SeatChip key={seat.playerId} seat={seat} />)}
          </ol>
        </div>
      ) : (
        <>
          <SeatRing seats={model.seats} mood="night" />
          <div className="mod-player-center">
            {renderCenterContent()}
          </div>
        </>
      )}
    </div>
  );

  const bottomBar = self !== null && !spectator
    ? (
      <div className="mod-player-dock">
        <span className="mod-player-dock__status">
          {model.selfAlive ? '存活' : '已出局'}
        </span>
        <button
          type="button"
          className="confirm-btn confirm-btn--cancel"
          onClick={handleReplayCeremony}
        >
          重看抽卡
        </button>
      </div>
    )
    : undefined;

  return (
    <>
      <TabletopOvalShell
        title="狼人杀 · 真人主持"
        subtitle={
          view.timeline
            ? `${model.total} 人局 · 存活 ${model.aliveCount} 人 · ${view.timeline.label}`
            : `${model.total} 人局 · 存活 ${model.aliveCount} 人`
        }
        gameId="werewolf"
        theme="tribunal-night"
        hideSeats
        players={[]}
        stageFit="arena"
        centerArena={centerArena}
        bottomBar={bottomBar}
        onShowRules={() => setRulesOpen(true)}
      />
      {voice.autoplayBlocked && <button className="mod-voice-unlock" type="button" onClick={voice.enableAudio}>点击开启声音</button>}
      {rulesOpen && <ModeratorRulesSheet onClose={() => setRulesOpen(false)} />}
    </>
  );
}
