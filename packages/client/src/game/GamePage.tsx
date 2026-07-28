/**
 * 游戏页：先按 moduleId 分流到各游戏，再按 phase 渲染对应子视图。
 * game_state payload 经 asPlayerView 解析后分发。
 */
import { useConnection } from '../connection/useConnection.ts';
import { asPlayerView } from './types.ts';
import { GamePhaseRail } from './GameChrome.tsx';
import { GameChatDrawer } from './GameChatDrawer.tsx';
import { WordRevealView } from './WordRevealView.tsx';
import { SpeakingView } from './SpeakingView.tsx';
import { VotingView } from './VotingView.tsx';
import { VoteResultView } from './VoteResultView.tsx';
import { GameOverView } from './GameOverView.tsx';
import { LandlordGamePage, UnoGamePage, WerewolfGamePage } from './NewGamePages.tsx';

type ActiveGame = NonNullable<ReturnType<typeof useConnection>['state']['game']>;

function GameLoadingCard({ children }: { children: React.ReactNode }) {
  return (
    <main className="game-page">
      <div className="game-shell">
        <div className="game-loading-card">{children}</div>
      </div>
    </main>
  );
}

function UndercoverGamePage({ game }: { game: ActiveGame }) {
  const view = asPlayerView(game.view);
  if (view === null) return <GameLoadingCard>对局数据格式异常</GameLoadingCard>;

  let phaseView;
  switch (view.phase) {
    case 'word_reveal':
      phaseView = <WordRevealView view={view} />;
      break;
    case 'speaking':
      phaseView = <SpeakingView view={view} />;
      break;
    case 'voting':
    case 'runoff_voting':
      phaseView = <VotingView view={view} />;
      break;
    case 'vote_result':
      phaseView = <VoteResultView view={view} />;
      break;
    case 'game_over':
      phaseView = <GameOverView view={view} />;
      break;
    default:
      phaseView = <div className="game-loading-card">未知阶段</div>;
  }

  return (
    <main className={`game-page phase-${view.phase}`}>
      <div className="game-page-decor game-page-decor-left" aria-hidden="true" />
      <div className="game-page-decor game-page-decor-right" aria-hidden="true" />
      <div className="game-shell">
        <header className="game-header">
          <div className="game-brand-mark" aria-hidden="true"><span /><span /><span /></div>
          <div className="game-header-copy">
            <span className="game-title">谁是卧底</span>
            <span className="game-round">第 {view.round} 轮 · 找出那个人</span>
          </div>
          {game.role === 'spectator' && <span className="spectator-badge">观战</span>}
        </header>
        {view.phase !== 'game_over' && <GamePhaseRail phase={view.phase} />}
        {phaseView}
      </div>
      <GameChatDrawer />
    </main>
  );
}

export function GamePage() {
  const { state } = useConnection();
  const game = state.game;
  if (game === null) return <GameLoadingCard>等待对局数据…</GameLoadingCard>;

  switch (game.moduleId) {
    case 'uno':
      return <><UnoGamePage view={game.view as Record<string, unknown>} /><GameChatDrawer /></>;
    case 'landlord':
      return <><LandlordGamePage view={game.view as Record<string, unknown>} /><GameChatDrawer /></>;
    case 'werewolf':
      return <><WerewolfGamePage view={game.view as Record<string, unknown>} /><GameChatDrawer /></>;
    case 'undercover':
      return <UndercoverGamePage game={game} />;
    default:
      return <GameLoadingCard>暂不支持的游戏：{game.moduleId}</GameLoadingCard>;
  }
}
