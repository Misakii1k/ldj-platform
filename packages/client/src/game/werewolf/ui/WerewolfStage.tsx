import { GameLeaveButton } from '../../GameLeaveButton.tsx';
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
  return (
    <main className={`werewolf-stage phase-${model.phase}`} data-mood={model.mood}>
      <div className="werewolf-stage__veil" aria-hidden="true" />
      <div className="werewolf-stage__inner">
        <div className="werewolf-stage__top">
          <MoonPhaseHeader
            dayLabel={model.dayLabel}
            phaseLabel={model.phaseLabel}
            narrative={model.narrative}
            mood={model.mood}
            deadlineAt={model.deadlineAt}
            spectator={model.spectator}
          />
          <GameLeaveButton />
        </div>

        <SeatRing seats={model.seats} mood={model.mood} />

        <div className="werewolf-stage__panels">
          <PrivateRolePanel self={model.self} synced={synced} />
          <div className="werewolf-stage__column">
            <WerewolfActionPanel groups={model.actionGroups} waitingHint={model.waitingHint} busy={busy} onAct={onAct} />
            <VoteLedger progress={model.voteProgress} ledger={model.voteLedger} />
            <GameOverReveal reveal={model.reveal} />
          </div>
        </div>

        {error && <p className="game-error werewolf-stage__error" role="alert">{error}</p>}
      </div>
    </main>
  );
}
