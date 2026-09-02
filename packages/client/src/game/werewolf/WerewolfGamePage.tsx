/**
 * 狼人杀页：月相审判桌。
 */
import { useConnection } from '../../connection/useConnection.ts';
import { useGameAction } from '../useGameAction.ts';
import { buildWerewolfPresentation } from './presentation.ts';
import { parseWerewolfView } from './types.ts';
import { WerewolfStage } from './ui/WerewolfStage.tsx';
import '../focused-game-motion.css';

export function WerewolfGamePage({ view: rawView }: { view: unknown }) {
  const view = parseWerewolfView(rawView);
  const { state } = useConnection();
  const { act, busy, error } = useGameAction();

  if (view === null) {
    return (
      <main className="werewolf-stage werewolf-stage--error">
        <section className="werewolf-stage__fallback">
          <h1>狼人杀</h1>
          <p className="game-error" role="alert" aria-live="assertive" aria-atomic="true">
            狼人杀视图同步失败，请尝试刷新或重新进入房间。
          </p>
        </section>
      </main>
    );
  }

  const model = buildWerewolfPresentation(view, state.room?.members ?? [], state.chat);

  return (
    <WerewolfStage
      model={model}
      synced={state.connState === 'synced'}
      busy={busy}
      error={error}
      onAct={(payload) => void act(payload)}
    />
  );
}
