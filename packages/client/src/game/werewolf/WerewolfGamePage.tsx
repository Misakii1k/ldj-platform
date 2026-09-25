import { useGameVisibility } from '../tabletop/useGameVisibility.ts';
/**
 * 狼人杀页：月相审判桌。
 */
import { useConnection } from '../../connection/useConnection.ts';
import { useUserProfile } from '../../user/UserProfileContext.tsx';
import { useGameAction } from '../useGameAction.ts';
import { buildWerewolfPresentation } from './presentation.ts';
import { parseWerewolfView } from './types.ts';
import { WerewolfStage } from './ui/WerewolfStage.tsx';
import { WerewolfThemeProvider } from './WerewolfThemeProvider.tsx';
import '../focused-game-motion.css';

export function WerewolfGamePage({ view: rawView }: { view: unknown }) {
  useGameVisibility();
  const view = parseWerewolfView(rawView);
  const { state } = useConnection();
  const { profile } = useUserProfile();
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

  // 过滤私聊，只传公开公屏消息给公共 presentation（Contract E / T08）
  const publicChat = (state.chat ?? []).filter((msg) => !msg.toPlayerId);
  const model = buildWerewolfPresentation(
    view,
    state.room?.members ?? [],
    publicChat,
    profile.avatar,
    state.clockSample,
  );

  return (
    <WerewolfThemeProvider
      timelinePeriod={view.timeline?.period}
      phase={view.phase}
      nightStage={view.nightStage}
    >
      <WerewolfStage
        key={`${state.game?.sessionId ?? ''}:${view.me?.playerId ?? 'observer'}`}
        model={model}
        synced={state.connState === 'synced'}
        busy={busy}
        error={error}
        onAct={(payload) => void act(payload)}
      />
    </WerewolfThemeProvider>
  );
}
