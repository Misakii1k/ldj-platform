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
import { nameFor } from './useGameAction.ts';
import { TabletopOvalShell, type PlayerSeat } from '../shared-ui/TabletopOvalShell.tsx';



const UnoGamePage = lazy(() => import('./NewGamePages.tsx').then((module) => ({ default: module.UnoGamePage })));
const LandlordGamePage = lazy(() => import('./NewGamePages.tsx').then((module) => ({ default: module.LandlordGamePage })));
const WerewolfGamePage = lazy(() => import('./werewolf/WerewolfGamePage.tsx').then((module) => ({ default: module.WerewolfGamePage })));
const UnoHouseStage = lazy(() => import('./uno/stage/UnoHouseStage.tsx').then((module) => ({ default: module.UnoHouseStage })));
const UndercoverBlankStage = lazy(() => import('./undercover/stage/UndercoverBlankStage.tsx').then((module) => ({ default: module.UndercoverBlankStage })));
const DurianGamePage = lazy(() => import('./durian/DurianGamePage.tsx').then((module) => ({ default: module.DurianGamePage })));
const LoveLetterGamePage = lazy(() => import('./loveletter/LoveLetterGamePage.tsx').then((module) => ({ default: module.LoveLetterGamePage })));
const CheeseThiefGamePage = lazy(() => import('./cheese-thief/CheeseThiefGamePage.tsx').then((module) => ({ default: module.CheeseThiefGamePage })));
const GooseRelayGamePage = lazy(() => import('./goose-relay/GooseRelayGamePage.tsx').then((module) => ({ default: module.GooseRelayGamePage })));
const NightTestimonyGamePage = lazy(() => import('./night-testimony/NightTestimonyGamePage.tsx').then((module) => ({ default: module.NightTestimonyGamePage })));
const BellClashGamePage = lazy(() => import('./bell-clash/BellClashGamePage.tsx').then((module) => ({ default: module.BellClashGamePage })));
const EchoJudgeGamePage = lazy(() => import('./echo-judge/EchoJudgeGamePage.tsx').then((module) => ({ default: module.EchoJudgeGamePage })));

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
  const { state } = useConnection();
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

  const members = state.room?.members ?? [];
  const seats: PlayerSeat[] = (view.players || []).map((p) => ({
    id: p.playerId,
    name: nameFor(members, p.playerId),
    isCurrentTurn: p.playerId === view.currentSpeakerId,
    isEliminated: !p.alive,
  }));

  return (
    <TabletopOvalShell
      title="谁是卧底"
      subtitle={`第 ${view.round} 轮 · 找出隐藏卧底`}
      theme="mystery"
      players={seats}
      currentUserId={view.me?.playerId}
      centerArena={
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
          {view.phase !== 'game_over' && <GamePhaseRail phase={view.phase} />}
          {phaseView}
        </div>
      }
    />
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
    case 'landlord': {
      const parsed = parseGameView(game);
      if (!parsed.ok) {
        content = <GameLoadingCard>对局数据格式异常</GameLoadingCard>;
        break;
      }
      content = <LandlordGamePage view={parsed.view as Record<string, unknown>} />;
      break;
    }
    case 'werewolf': {
      // 按 viewVersion 判别：v2（open-kill）走严格解析（失败关闭），legacy 透传后仍由 WerewolfGamePage 校验。
      const parsed = parseGameView(game);
      if (!parsed.ok) {
        content = <GameLoadingCard>对局数据格式异常</GameLoadingCard>;
        break;
      }
      content = <WerewolfGamePage view={parsed.view} />;
      break;
    }
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
    case 'durian': {
      const parsed = parseGameView(game);
      if (!parsed.ok) {
        content = <GameLoadingCard>对局数据格式异常</GameLoadingCard>;
        break;
      }
      content = <DurianGamePage view={parsed.view as import('./durian/types.ts').DurianPlayerView} />;
      break;
    }
    case 'loveletter': {
      const parsed = parseGameView(game);
      if (!parsed.ok) {
        content = <GameLoadingCard>对局数据格式异常</GameLoadingCard>;
        break;
      }
      content = <LoveLetterGamePage view={parsed.view as import('./loveletter/types.ts').LoveLetterPlayerView} />;
      break;
    }
    case 'cheese-thief': {
      const parsed = parseGameView(game);
      if (!parsed.ok) {
        content = <GameLoadingCard>对局数据格式异常</GameLoadingCard>;
        break;
      }
      content = <CheeseThiefGamePage view={parsed.view as import('./cheese-thief/types.ts').CheeseThiefPlayerView} />;
      break;
    }
    case 'goose-relay': {
      const parsed = parseGameView(game);
      if (!parsed.ok) {
        content = <GameLoadingCard>对局数据格式异常</GameLoadingCard>;
        break;
      }
      content = <GooseRelayGamePage view={parsed.view as import('./goose-relay/types.ts').GooseRelayPlayerView} />;
      break;
    }
    case 'night-testimony': {
      const parsed = parseGameView(game);
      if (!parsed.ok) {
        content = <GameLoadingCard>对局数据格式异常</GameLoadingCard>;
        break;
      }
      content = <NightTestimonyGamePage view={parsed.view as import('./night-testimony/types.ts').NightTestimonyPlayerView} />;
      break;
    }
    case 'bell-clash': {
      const parsed = parseGameView(game);
      if (!parsed.ok) {
        content = <GameLoadingCard>对局数据格式异常</GameLoadingCard>;
        break;
      }
      content = <BellClashGamePage view={parsed.view as import('./bell-clash/types.ts').BellClashPlayerView} />;
      break;
    }
    case 'echo-judge': {
      const parsed = parseGameView(game);
      if (!parsed.ok) {
        content = <GameLoadingCard>对局数据格式异常</GameLoadingCard>;
        break;
      }
      content = <EchoJudgeGamePage view={parsed.view as import('./echo-judge/types.ts').EchoJudgePlayerView} />;
      break;
    }
    default:
      return <GameLoadingCard>暂不支持的游戏：{game.moduleId}</GameLoadingCard>;
  }
  return <Suspense fallback={<GameLoadingCard>正在布置游戏桌…</GameLoadingCard>}><>{content}<GameChatDrawer /></></Suspense>;
}
