/**
 * 游戏页：先按 moduleId 分流到各游戏，再按 phase 渲染对应子视图。
 * game_state payload 经 asPlayerView 解析后分发。
 */
import { lazy, Suspense } from 'react';
import { useConnection } from '../connection/useConnection.ts';
import { GameLeaveButton } from './GameLeaveButton.tsx';
import { asPlayerView } from './types.ts';
import { parseGameView } from './viewRegistry.ts';
import { GamePhaseRail } from './GameChrome.tsx';
import { GameChatDrawer } from './GameChatDrawer.tsx';
import { WordRevealView } from './WordRevealView.tsx';
import { SpeakingView } from './SpeakingView.tsx';
import { VotingView } from './VotingView.tsx';
import { VoteResultView } from './VoteResultView.tsx';
import { GameOverView } from './GameOverView.tsx';
import { TabletopOvalShell } from '../shared-ui/TabletopOvalShell.tsx';
import { TabletopSettlementDock } from './TabletopSettlementDock.tsx';
import { nameFor } from './useGameAction.ts';



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

import { GameIcon } from '../shared-ui/GameIcon.tsx';

type ActiveGame = NonNullable<ReturnType<typeof useConnection>['state']['game']>;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function GameLoadingCard({ children }: { children: React.ReactNode }) {
  const { send, clearMe, resync, state } = useConnection();

  const handleLeave = async () => {
    try {
      await send('leave_room', {});
    } finally {
      clearMe();
    }
  };

  const handleReturnToLobby = async () => {
    try {
      await send('room_command', { command: 'return_to_lobby' });
    } catch {
      resync();
    }
  };

  return (
    <main className="game-page error-page-tabletop">
      <div className="game-shell">
        <div className="game-loading-card">
          <div style={{ marginBottom: '14px', fontWeight: 800 }}>{children}</div>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="confirm-btn confirm-btn--primary"
              onClick={resync}
              style={{ fontSize: '0.85rem', padding: '6px 14px' }}
            >
              重新同步
            </button>
            {state.room && (
              <button
                type="button"
                className="confirm-btn confirm-btn--cancel"
                onClick={handleReturnToLobby}
                style={{ fontSize: '0.85rem', padding: '6px 14px' }}
              >
                返回房间
              </button>
            )}
            <button
              type="button"
              className="confirm-btn confirm-btn--danger"
              onClick={handleLeave}
              style={{ fontSize: '0.85rem', padding: '6px 14px' }}
            >
              退出主页
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}

function GameErrorCard({
  title = '对局数据格式异常',
  description = '当前对局数据同步出现异常或已发生变动，你可以点击下方按钮重新同步，或返回房间大厅/退出到主页。',
}: {
  title?: string;
  description?: string;
}) {
  const { send, resync, clearMe, state } = useConnection();

  const handleReturnToLobby = async () => {
    try {
      await send('room_command', { command: 'return_to_lobby' });
    } catch {
      resync();
    }
  };

  const handleLeave = async () => {
    try {
      await send('leave_room', {});
    } finally {
      clearMe();
    }
  };

  return (
    <main className="game-page error-page-tabletop">
      <div className="game-error-panel">
        <div className="game-error-icon">
          <GameIcon name="hourglass" size={32} />
        </div>
        <h2 className="game-error-title">{title}</h2>
        <p className="game-error-desc">{description}</p>
        <div className="game-error-actions">
          <button type="button" className="confirm-btn confirm-btn--primary" onClick={resync}>
            重新同步数据
          </button>
          {state.room && (
            <button type="button" className="confirm-btn confirm-btn--cancel" onClick={handleReturnToLobby}>
              返回房间大厅
            </button>
          )}
          <button type="button" className="confirm-btn confirm-btn--danger" onClick={handleLeave}>
            <GameIcon name="door_exit" size={15} style={{ marginRight: '6px' }} />
            退出返回主页
          </button>
        </div>
      </div>
    </main>
  );
}

function UndercoverGamePage({ game }: { game: ActiveGame }) {
  const { state } = useConnection();
  const view = asPlayerView(game.view);

  if (view === null) return <GameErrorCard title="谁是卧底数据格式异常" />;

  const members = state.room?.members ?? [];
  const seats = view.players.map((player) => ({
    id: player.playerId,
    name: nameFor(members, player.playerId) || `玩家 ${player.seat}`,
    isCurrentTurn: player.playerId === view.currentSpeakerId,
    isSpeaking: view.phase === 'speaking' && player.playerId === view.currentSpeakerId,
    isEliminated: !player.alive,
    badge: player.revealedRole !== null
      ? (player.revealedRole === 'undercover' ? '卧底' : '平民')
      : undefined,
  }));

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
    <TabletopOvalShell
      title="谁是卧底"
      subtitle={`第 ${view.round} 轮 · 找出隐藏卧底`}
      gameId="undercover"
      theme="mystery"
      stageFit="arena"
      players={seats}
      currentUserId={view.me?.playerId}
      phaseKey={`${view.phase}:${view.round}:${view.currentSpeakerId ?? 'idle'}`}
      phaseBannerText={view.phase === 'speaking' && view.currentSpeakerId === view.me?.playerId ? '轮到你发言' : undefined}
      topRightControls={<GameLeaveButton />}
      centerArena={
        <div className="uc-stage" data-uc-phase={view.phase}>
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
        content = <GameErrorCard title="UNO 牌局数据异常" />;
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
        if (isRecord(game.view) && (game.view as any).phase) {
          content = <LandlordGamePage view={game.view as Record<string, unknown>} />;
        } else {
          content = <GameErrorCard title="斗地主数据格式异常" />;
        }
        break;
      }
      content = <LandlordGamePage view={parsed.view as Record<string, unknown>} />;
      break;
    }
    case 'werewolf': {
      // 按 viewVersion 判别：v2（open-kill）走严格解析（失败关闭），legacy 透传后仍由 WerewolfGamePage 校验。
      const parsed = parseGameView(game);
      if (!parsed.ok) {
        content = <GameErrorCard title="狼人杀数据格式异常" />;
        break;
      }
      content = <WerewolfGamePage view={parsed.view} />;
      break;
    }
    case 'undercover': {
      const parsed = parseGameView(game);
      if (!parsed.ok) {
        content = <GameErrorCard title="谁是卧底数据格式异常" />;
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
        content = <GameErrorCard title="During 数据格式异常" />;
        break;
      }
      content = <DurianGamePage view={parsed.view as import('./durian/types.ts').DurianPlayerView} />;
      break;
    }
    case 'loveletter': {
      const parsed = parseGameView(game);
      if (!parsed.ok) {
        content = <GameErrorCard title="情书数据格式异常" />;
        break;
      }
      content = <LoveLetterGamePage view={parsed.view as import('./loveletter/types.ts').LoveLetterPlayerView} />;
      break;
    }
    case 'cheese-thief': {
      const parsed = parseGameView(game);
      if (!parsed.ok) {
        content = <GameErrorCard title="奶酪大盗数据格式异常" />;
        break;
      }
      content = <CheeseThiefGamePage view={parsed.view as import('./cheese-thief/types.ts').CheeseThiefPlayerView} />;
      break;
    }
    case 'goose-relay': {
      const parsed = parseGameView(game);
      if (!parsed.ok) {
        content = <GameErrorCard title="以鹅传鹅数据格式异常" />;
        break;
      }
      content = <GooseRelayGamePage view={parsed.view as import('./goose-relay/types.ts').GooseRelayPlayerView} />;
      break;
    }
    case 'night-testimony': {
      const parsed = parseGameView(game);
      if (!parsed.ok) {
        content = <GameErrorCard title="囚徒之夜数据格式异常" />;
        break;
      }
      content = <NightTestimonyGamePage view={parsed.view as import('./night-testimony/types.ts').NightTestimonyPlayerView} />;
      break;
    }
    case 'bell-clash': {
      const parsed = parseGameView(game);
      if (!parsed.ok) {
        content = <GameErrorCard title="Ding 数据格式异常" />;
        break;
      }
      content = <BellClashGamePage view={parsed.view as import('./bell-clash/types.ts').BellClashPlayerView} />;
      break;
    }
    case 'echo-judge': {
      const parsed = parseGameView(game);
      if (!parsed.ok) {
        content = <GameErrorCard title="回声法官数据格式异常" />;
        break;
      }
      content = <EchoJudgeGamePage view={parsed.view as import('./echo-judge/types.ts').EchoJudgePlayerView} />;
      break;
    }
    default:
      return <GameErrorCard title="暂不支持的游戏" description={`游戏模块 ${game.moduleId} 暂未就绪。`} />;
  }
  return (
    <Suspense fallback={<GameLoadingCard>正在布置游戏桌…</GameLoadingCard>}>
      <div className="game-session-root">
        {content}
        <TabletopSettlementDock />
        <GameChatDrawer />
      </div>
    </Suspense>
  );
}
