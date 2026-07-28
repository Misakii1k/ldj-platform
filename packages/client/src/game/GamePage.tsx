/**
 * 游戏页（Task 3/4）：根据 phase 渲染对应子视图。
 * game_state payload 经 asPlayerView 解析后分发。
 */
import { useConnection } from '../connection/useConnection.ts';
import { asPlayerView } from './types.ts';
import { WordRevealView } from './WordRevealView.tsx';
import { SpeakingView } from './SpeakingView.tsx';
import { VotingView } from './VotingView.tsx';
import { VoteResultView } from './VoteResultView.tsx';
import { GameOverView } from './GameOverView.tsx';

export function GamePage() {
  const { state } = useConnection();
  const game = state.game;

  if (game === null) {
    return (
      <main className="game-page">
        <div className="loading">等待对局数据…</div>
      </main>
    );
  }

  const view = asPlayerView(game.view);
  if (view === null) {
    return (
      <main className="game-page">
        <div className="loading">对局数据格式异常</div>
      </main>
    );
  }

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
      phaseView = <div className="loading">未知阶段</div>;
  }

  return (
    <main className="game-page">
      <header className="game-header">
        <span className="game-title">谁是卧底 · 第 {view.round} 轮</span>
        {game.role === 'spectator' && <span className="spectator-badge">观战</span>}
      </header>
      {phaseView}
    </main>
  );
}
