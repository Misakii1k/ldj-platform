import { TabletopOvalShell, type PlayerSeat } from '../../../shared-ui/TabletopOvalShell.tsx';
import type { WerewolfPresentationModel } from '../presentation.ts';
import { GameOverReveal } from './GameOverReveal.tsx';
import { MoonPhaseHeader } from './MoonPhaseHeader.tsx';
import { PrivateRolePanel } from './PrivateRolePanel.tsx';
import { SeatRing } from './SeatRing.tsx';
import { VoteLedger } from './VoteLedger.tsx';
import { WerewolfActionPanel } from './WerewolfActionPanel.tsx';

interface WerewolfStageProps {
  readonly model: WerewolfPresentationModel;
  readonly synced: boolean;
  readonly busy: boolean;
  readonly error: string | null;
  readonly onAct: (payload: unknown) => void;
}

export function WerewolfStage({ model, synced, busy, error, onAct }: WerewolfStageProps) {
  const seats: PlayerSeat[] = model.seats.map((s) => ({
    id: s.playerId,
    name: s.name,
    isCurrentTurn: s.isSpeaking,
    isSpeaking: s.isSpeaking,
    isEliminated: !s.alive,
    roleTag: s.revealedRoleLabel ?? undefined,
    badge: s.statusLabel,
  }));

  const centerArena = (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
      <MoonPhaseHeader
        dayLabel={model.dayLabel}
        phaseLabel={model.phaseLabel}
        narrative={model.narrative}
        mood={model.mood}
        deadlineAt={model.deadlineAt}
        spectator={model.spectator}
      />
      <SeatRing seats={model.seats} mood={model.mood} />
      {error && <p className="game-error werewolf-stage__error" role="alert">{error}</p>}
    </div>
  );

  const bottomBar = (
    <div className="werewolf-stage__panels" style={{ width: '100%', maxWidth: '800px' }}>
      <PrivateRolePanel self={model.self} synced={synced} />
      <div className="werewolf-stage__column" style={{ flex: 1 }}>
        <WerewolfActionPanel groups={model.actionGroups} waitingHint={model.waitingHint} busy={busy} onAct={onAct} />
        <VoteLedger progress={model.voteProgress} ledger={model.voteLedger} />
        <GameOverReveal reveal={model.reveal} />
      </div>
    </div>
  );

  return (
    <TabletopOvalShell
      title="狼人杀"
      subtitle={`${model.dayLabel} · ${model.phaseLabel}`}
      theme="mystery"
      players={seats}
      currentUserId={model.self?.playerId}
      centerArena={centerArena}
      bottomBar={bottomBar}
      phaseBannerText={model.narrative}
    />
  );
}

