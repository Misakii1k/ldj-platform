/**
 * 游戏页：先按 moduleId 分流到各游戏，再按 phase 渲染对应子视图。
 * game_state payload 经 asPlayerView 解析后分发。
 */
import { Suspense, useEffect } from 'react';
import { lazyWithRetry } from '../shared-ui/lazyWithRetry.ts';
import { useConnection } from '../connection/useConnection.ts';
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
import { setAppImmersiveMode } from '../native/immersive.ts';

const UnoGamePage = lazyWithRetry(() => import('./NewGamePages.tsx').then((module) => ({ default: module.UnoGamePage })), 'uno');
const LandlordGamePage = lazyWithRetry(() => import('./NewGamePages.tsx').then((module) => ({ default: module.LandlordGamePage })), 'landlord');
const WerewolfGamePage = lazyWithRetry(() => import('./werewolf/WerewolfGamePage.tsx').then((module) => ({ default: module.WerewolfGamePage })), 'werewolf');
const UnoHouseStage = lazyWithRetry(() => import('./uno/stage/UnoHouseStage.tsx').then((module) => ({ default: module.UnoHouseStage })), 'uno-house');
const UndercoverBlankStage = lazyWithRetry(() => import('./undercover/stage/UndercoverBlankStage.tsx').then((module) => ({ default: module.UndercoverBlankStage })), 'undercover');
const DurianGamePage = lazyWithRetry(() => import('./durian/DurianGamePage.tsx').then((module) => ({ default: module.DurianGamePage })), 'durian');
const LoveLetterGamePage = lazyWithRetry(() => import('./loveletter/LoveLetterGamePage.tsx').then((module) => ({ default: module.LoveLetterGamePage })), 'loveletter');
const CheeseThiefGamePage = lazyWithRetry(() => import('./cheese-thief/CheeseThiefGamePage.tsx').then((module) => ({ default: module.CheeseThiefGamePage })), 'cheese-thief');
const GooseRelayGamePage = lazyWithRetry(() => import('./goose-relay/GooseRelayGamePage.tsx').then((module) => ({ default: module.GooseRelayGamePage })), 'goose-relay');
const NightTestimonyGamePage = lazyWithRetry(() => import('./night-testimony/NightTestimonyGamePage.tsx').then((module) => ({ default: module.NightTestimonyGamePage })), 'night-testimony');
const BellClashGamePage = lazyWithRetry(() => import('./bell-clash/BellClashGamePage.tsx').then((module) => ({ default: module.BellClashGamePage })), 'bell-clash');
const EchoJudgeGamePage = lazyWithRetry(() => import('./echo-judge/EchoJudgeGamePage.tsx').then((module) => ({ default: module.EchoJudgeGamePage })), 'echo-judge');
const PartySandboxGamePage = lazyWithRetry(() => import('./party-sandbox/PartySandboxGamePage.tsx').then((module) => ({ default: module.PartySandboxGamePage })), 'party-sandbox');
const BellClashSimStage = lazyWithRetry(() => import('./bell-clash/BellClashSimStage.tsx').then((module) => ({ default: module.BellClashSimStage })), 'bell-clash-sim');
const EchoJudgeSimStage = lazyWithRetry(() => import('./echo-judge/EchoJudgeSimStage.tsx').then((module) => ({ default: module.EchoJudgeSimStage })), 'echo-judge-sim');
const NightTestimonySimStage = lazyWithRetry(() => import('./night-testimony/NightTestimonySimStage.tsx').then((module) => ({ default: module.NightTestimonySimStage })), 'night-testimony-sim');
const GooseRelaySimStage = lazyWithRetry(() => import('./goose-relay/GooseRelaySimStage.tsx').then((module) => ({ default: module.GooseRelaySimStage })), 'goose-relay-sim');
const CheeseThiefSimStage = lazyWithRetry(() => import('./cheese-thief/CheeseThiefSimStage.tsx').then((module) => ({ default: module.CheeseThiefSimStage })), 'cheese-thief-sim');

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
    name: nameFor(members, player.playerId) || `玩家 ${player.seat + 1}`,
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

  // 进入对局全局自动沉浸隐藏状态栏，退出对局时恢复
  useEffect(() => {
    void setAppImmersiveMode(true);
    return () => {
      void setAppImmersiveMode(false);
    };
  }, []);

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
        if (isRecord(game.view) && typeof game.view.phase === 'string') {
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
        content = <GameErrorCard title="DURING 数据格式异常" />;
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
      const v = parsed.view;
      content = isRecord(v) && v.rulesetId === 'cheese_thief_sim_v1'
        ? <CheeseThiefSimStage view={v as unknown as import('./cheese-thief/simTypes.ts').CheeseThiefSimPlayerView} />
        : <CheeseThiefGamePage view={parsed.view as import('./cheese-thief/types.ts').CheeseThiefPlayerView} />;
      break;
    }
    case 'goose-relay': {
      const parsed = parseGameView(game);
      if (!parsed.ok) {
        content = <GameErrorCard title="以鹅传鹅数据格式异常" />;
        break;
      }
      const v = parsed.view;
      content = isRecord(v) && v.rulesetId === 'goose_relay_sim_v1'
        ? <GooseRelaySimStage view={v as unknown as import('./goose-relay/simTypes.ts').GooseRelaySimPlayerView} />
        : <GooseRelayGamePage view={parsed.view as import('./goose-relay/types.ts').GooseRelayPlayerView} />;
      break;
    }
    case 'night-testimony': {
      const parsed = parseGameView(game);
      if (!parsed.ok) {
        content = <GameErrorCard title="暗夜证词数据格式异常" />;
        break;
      }
      const v = parsed.view;
      content = isRecord(v) && v.rulesetId === 'night_testimony_sim_v1'
        ? <NightTestimonySimStage view={v as unknown as import('./night-testimony/simTypes.ts').NightTestimonySimPlayerView} />
        : <NightTestimonyGamePage view={parsed.view as import('./night-testimony/types.ts').NightTestimonyPlayerView} />;
      break;
    }
    case 'bell-clash': {
      const parsed = parseGameView(game);
      if (!parsed.ok) {
        content = <GameErrorCard title="铃铛对决数据格式异常" />;
        break;
      }
      const v = parsed.view;
      content = isRecord(v) && v.rulesetId === 'bell_clash_sim_v1'
        ? <BellClashSimStage view={v as unknown as import('./bell-clash/simTypes.ts').BellClashSimPlayerView} />
        : <BellClashGamePage view={parsed.view as import('./bell-clash/types.ts').BellClashPlayerView} />;
      break;
    }
    case 'echo-judge': {
      const parsed = parseGameView(game);
      if (!parsed.ok) {
        content = <GameErrorCard title="伪人测试数据格式异常" />;
        break;
      }
      const v = parsed.view;
      content = isRecord(v) && v.rulesetId === 'echo_judge_sim_v1'
        ? <EchoJudgeSimStage view={v as unknown as import('./echo-judge/simTypes.ts').EchoJudgeSimPlayerView} />
        : <EchoJudgeGamePage view={parsed.view as import('./echo-judge/types.ts').EchoJudgePlayerView} />;
      break;
    }
    case 'party-sandbox': {
      const parsed = parseGameView(game);
      if (!parsed.ok) {
        content = <GameErrorCard title="创意工坊数据格式异常" />;
        break;
      }
      content = <PartySandboxGamePage view={parsed.view as import('./party-sandbox/types.ts').PartySandboxPlayerView} />;
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
