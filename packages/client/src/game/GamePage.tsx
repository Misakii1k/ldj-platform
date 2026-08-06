/**
 * 游戏页：先按 moduleId 分流到各游戏，再按 phase 渲染对应子视图。
 * game_state payload 经 asPlayerView 解析后分发。
 */
import { lazy, Suspense, useEffect } from 'react';
import { useConnection } from '../connection/useConnection.ts';
import { useBackground } from '../shared-ui/BackgroundContext.tsx';
import { asPlayerView } from './types.ts';
import { parseGameView } from './viewRegistry.ts';
import { GamePhaseRail } from './GameChrome.tsx';
import { GameChatDrawer } from './GameChatDrawer.tsx';
import { WordRevealView } from './WordRevealView.tsx';
import { SpeakingView } from './SpeakingView.tsx';
import { VotingView } from './VotingView.tsx';
import { VoteResultView } from './VoteResultView.tsx';
import { GameOverView } from './GameOverView.tsx';
import { GameLeaveButton } from './GameLeaveButton.tsx';

const UnoGamePage = lazy(() => import('./NewGamePages.tsx').then((module) => ({ default: module.UnoGamePage })));
const LandlordGamePage = lazy(() => import('./NewGamePages.tsx').then((module) => ({ default: module.LandlordGamePage })));
const WerewolfGamePage = lazy(() => import('./werewolf/WerewolfGamePage.tsx').then((module) => ({ default: module.WerewolfGamePage })));
const UnoHouseStage = lazy(() => import('./uno/stage/UnoHouseStage.tsx').then((module) => ({ default: module.UnoHouseStage })));
const UndercoverBlankStage = lazy(() => import('./undercover/stage/UndercoverBlankStage.tsx').then((module) => ({ default: module.UndercoverBlankStage })));

type ActiveGame = NonNullable<ReturnType<typeof useConnection>['state']['game']>;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

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
  const { setAtmosphere } = useBackground();

  useEffect(() => {
    if (!view) return;
    if (view.phase === 'word_reveal') setAtmosphere('word_reveal');
    else if (view.phase === 'speaking') setAtmosphere('speaking');
    else if (view.phase === 'voting' || view.phase === 'runoff_voting') setAtmosphere('voting');
    else if (view.phase === 'game_over') setAtmosphere('game_over');
    else setAtmosphere('idle');
    return () => setAtmosphere('idle');
  }, [view?.phase, setAtmosphere]);

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
          <div className="game-header-actions">
            {game.role === 'spectator' && <span className="spectator-badge">观战</span>}
            <GameLeaveButton className="game-leave--undercover" />
          </div>
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

  let content;
  switch (game.moduleId) {
    case 'uno': {
      const parsed = parseGameView(game);
      if (!parsed.ok) {
        content = <GameLoadingCard>对局数据格式异常</GameLoadingCard>;
        break;
      }
      const v = parsed.view;
      content = isRecord(v) && v.rulesetId === 'uno_platform_house_v1'
        ? <UnoHouseStage view={v as unknown as import('./uno/types.ts').UnoHousePlayerView} />
        : <UnoGamePage view={v as Record<string, unknown>} />;
      break;
    }
    case 'landlord':
      content = <LandlordGamePage view={game.view as Record<string, unknown>} />;
      break;
    case 'werewolf':
      content = <WerewolfGamePage view={game.view as Record<string, unknown>} />;
      break;
    case 'undercover': {
      const parsed = parseGameView(game);
      if (!parsed.ok) {
        content = <GameLoadingCard>对局数据格式异常</GameLoadingCard>;
        break;
      }
      const v = parsed.view;
      content = isRecord(v) && v.rulesetId === 'undercover_blank_v1'
        ? <UndercoverBlankStage view={v as unknown as import('./undercover/types.ts').BlankPlayerView} />
        : <UndercoverGamePage game={game} />;
      break;
    }
    default:
      return <GameLoadingCard>暂不支持的游戏：{game.moduleId}</GameLoadingCard>;
  }
  return <Suspense fallback={<GameLoadingCard>正在布置游戏桌…</GameLoadingCard>}><>{content}<GameChatDrawer /></></Suspense>;
}
