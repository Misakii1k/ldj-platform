/**
 * 以鹅传鹅（Goose Relay）客户端主页面 —— 线下桌游辅助形态（遮罩选卡重构版）。
 *
 * 视觉与交互重构：
 * 1. 舞台空间精简自适应：主舞台仅展示身份、接力/指认轨、头鹅私密案情与简明状态，绝不撑爆屏幕；
 * 2. 遮罩层选卡与阅卡（Modal Mask）：
 *    - 9 张特征鸭卡在遮罩模态框中以 3x3 九宫格清晰呈现；
 *    - 头鹅定案与倒序指认阶段可直接在遮罩中点选「凶手鸭」与「受害鸭」并一键提交；
 *    - 其他阶段可随时通过「查看 9 张特征鸭卡」遮罩随时复习全部卡牌；
 * 3. 演出层（stage/）：草地毡面 3D 传递轨道、鹅卡沿圆弧飞到下一棒、
 *    接收席位光晕、指认对错印章、终局鹅群列队。
 *    契约见 docs/plans/2026-09-22-game-ui-uplift/contracts/ 同名文档思路。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Eye, EyeOff, LayoutGrid, RotateCcw, X } from 'lucide-react';
import { useConnection } from '../../connection/useConnection.ts';
import { nameFor, useGameAction } from '../useGameAction.ts';
import { ActionDock } from '../tabletop/ActionDock.tsx';
import { GameDrawer } from '../tabletop/GameDrawer.tsx';
import { TabletopShell } from '../tabletop/TabletopShell.tsx';
import { getGooseCard } from './cardCatalog.ts';
import { ArenaBoard } from '../../shared-ui/ArenaBoard.tsx';
import { SeatTargetPicker } from '../../shared-ui/SeatTargetPicker.tsx';
import { StageCountdownRing } from '../../shared-ui/stage/StageCountdownRing.tsx';
import { FlightLayer } from '../../shared-ui/stage/FlightLayer.tsx';
import { useGooseRelayStage } from './stage/useGooseRelayStage.tsx';
import { GooseTrack, PastureArt, assignGooseAvatars, gooseAvatarFor } from './stage/PastureProps.tsx';
import type { CharacterId, GooseRelayPlayerView } from './types.ts';
import { TabletopVictoryBurst } from '../../shared-ui/TabletopVictoryBurst.tsx';
import { usePhaseEventOverlay } from '../../shared-ui/usePhaseEventOverlay.tsx';

function phaseLabel(phase: GooseRelayPlayerView['phase']): string {
  switch (phase) {
    case 'claim_head':
      return '抢当头鹅';
    case 'pick_cards':
      return '头鹅定案';
    case 'relay':
      return '动作接力';
    case 'discussion':
      return '线下讨论';
    case 'accusation':
      return '倒序指认';
    case 'vote':
      return '投票揪恶';
    case 'game_over':
      return '终局结算';
    default:
      return phase;
  }
}

function roleLabel(
  role: GooseRelayPlayerView['me'] extends infer _
    ? NonNullable<GooseRelayPlayerView['me']>['role']
    : never,
): string {
  switch (role) {
    case 'head':
      return '头鹅（目击者）';
    case 'evil':
      return '恶鹅（潜伏卧底）';
    case 'white':
      return '白鹅（好人村民）';
    default:
      return '';
  }
}

interface Props {
  view: GooseRelayPlayerView;
}

export function GooseRelayGamePage({ view }: Props) {
  const { state } = useConnection();
  const members = state.room?.members ?? [];
  const { act, busy, error } = useGameAction();
  const me = view.me;
  const myId = me?.playerId ?? null;
  const isSpectator = me === null;
  const rulesRef = useRef<HTMLButtonElement | null>(null);
  const [rulesOpen, setRulesOpen] = useState(false);

  // 遮罩选卡模态框控制
  const [cardModalOpen, setCardModalOpen] = useState(false);

  // 选卡与指认状态：凶手与受害鸭选择
  const [murdererPick, setMurdererPick] = useState<CharacterId | null>(null);
  const [victimPick, setVictimPick] = useState<CharacterId | null>(null);

  // 投票状态
  const [voteTarget, setVoteTarget] = useState<string | null>(null);
  const [hasVoted, setHasVoted] = useState(false);

  // 头鹅私密查看案情卡开关
  const [showSecretCase, setShowSecretCase] = useState(false);

  const myIndex = myId === null ? -1 : (view.lineOrder ?? []).indexOf(myId);
  const isHeadGoose = myId !== null && view.headPlayerId === myId;
  // 每位玩家一只鹅：跑道席位与传递飞行共用这一份分配
  const playersKey = view.players.join('|');
  const gooseAvatars = useMemo(
    () => assignGooseAvatars(playersKey ? playersKey.split('|') : []),
    [playersKey],
  );
  const avatarOf = (playerId: string) => gooseAvatars.get(playerId) ?? gooseAvatarFor(playerId);
  const stage = useGooseRelayStage(view, avatarOf);

  const myTurnRelay = view.phase === 'relay' && myIndex === view.currentIndex;
  const myTurnAccuse = view.phase === 'accusation' && myIndex === view.currentAccuserIndex;

  // 阶段切换全屏盖印
  const { overlay: phaseOverlay } = usePhaseEventOverlay(view.phase, (phase) => {
    if (phase === 'relay') return { label: '传递开始', sublabel: '头鹅起手，逐棒肢体接力', variant: 'stamp' };
    if (phase === 'discussion') return { label: '传递完毕', sublabel: '自由讨论案情', variant: 'stamp' };
    if (phase === 'accusation') return { label: '倒序指认', sublabel: '从末棒开始还原案情', variant: 'warning' };
    if (phase === 'vote') return { label: '票选恶鹅', variant: 'warning' };
    return null;
  });

  const headPlayerName = view.headPlayerId ? nameFor(members, view.headPlayerId) : null;
  const currentRelayPlayerName = view.lineOrder[view.currentIndex]
    ? nameFor(members, view.lineOrder[view.currentIndex]!)
    : '';
  const currentAccuserPlayerName = view.lineOrder[view.currentAccuserIndex]
    ? nameFor(members, view.lineOrder[view.currentAccuserIndex]!)
    : '';

  // 当轮到头鹅选卡或轮到本人指认时，自动弹出遮罩选卡层
  useEffect(() => {
    if (view.phase === 'pick_cards' && isHeadGoose) {
      setCardModalOpen(true);
    } else if (view.phase === 'accusation' && myTurnAccuse) {
      setCardModalOpen(true);
    }
  }, [view.phase, isHeadGoose, myTurnAccuse]);

  // 玩家状态列表（用于顶栏展示）
  const players = view.players.map((playerId) => {
    const index = (view.lineOrder ?? []).indexOf(playerId);
    let status = '';
    if (view.phase === 'game_over') {
      status = (view.winners ?? []).includes(playerId) ? '获胜' : '失败';
    } else if (playerId === view.headPlayerId) {
      status = '头鹅';
    } else if (myId === playerId && me?.role === 'evil') {
      status = '恶鹅';
    } else if (view.phase === 'relay' && index === view.currentIndex) {
      status = '表演中';
    } else if (view.phase === 'accusation' && index === view.currentAccuserIndex) {
      status = '指认中';
    }
    return {
      id: playerId,
      name: nameFor(members, playerId),
      status,
      active:
        (view.phase === 'relay' && index === view.currentIndex) ||
        (view.phase === 'accusation' && index === view.currentAccuserIndex) ||
        // 刚接到棒：演出层给一次短暂光晕，让「传到谁了」一眼可见
        stage.receivingId === playerId,
      isSpeaking: view.phase === 'relay' && index === view.currentIndex,
    };
  });

  // 处理卡牌点击选择
  const handleCardClick = (cardKey: CharacterId) => {
    const isInteractive =
      (view.phase === 'pick_cards' && isHeadGoose) ||
      (view.phase === 'accusation' && myTurnAccuse);
    if (!isInteractive) return;

    if (murdererPick === cardKey) {
      setMurdererPick(null);
    } else if (victimPick === cardKey) {
      setVictimPick(null);
    } else if (!murdererPick) {
      setMurdererPick(cardKey);
    } else if (!victimPick) {
      setVictimPick(cardKey);
    } else {
      setVictimPick(cardKey);
    }
  };

  // 提交选卡 / 指认
  const handleConfirmPicks = () => {
    if (!murdererPick || !victimPick || murdererPick === victimPick || !myId) return;

    if (view.phase === 'pick_cards' && isHeadGoose) {
      void act({
        type: 'pick_cards',
        playerId: myId,
        murderer: murdererPick,
        victim: victimPick,
      });
      setCardModalOpen(false);
    } else if (view.phase === 'accusation' && myTurnAccuse) {
      void act({
        type: 'accuse',
        playerId: myId,
        murderer: murdererPick,
        victim: victimPick,
      });
      setMurdererPick(null);
      setVictimPick(null);
      setCardModalOpen(false);
    }
  };

  // 底部动作区 ActionDock 配置
  let primary: Parameters<typeof ActionDock>[0]['primary'] | null = null;
  let secondary: Parameters<typeof ActionDock>[0]['secondary'] = [];

  if (view.phase === 'claim_head' && myId) {
    primary = {
      id: 'claim-head',
      label: '抢当头鹅',
      disabled: false,
      onAction: () => {
        void act({ type: 'claim_head', playerId: myId });
      },
    };
    secondary = [];
  } else if (view.phase === 'pick_cards' && isHeadGoose && myId) {
    const ready = murdererPick !== null && victimPick !== null && murdererPick !== victimPick;
    primary = {
      id: 'open-card-modal',
      label: ready
        ? `确认定案：【${getGooseCard(murdererPick).name}】➔【${getGooseCard(victimPick).name}】`
        : '打开卡牌遮罩选定案情 ➔',
      disabled: false,
      onAction: () => {
        if (ready) {
          handleConfirmPicks();
        } else {
          setCardModalOpen(true);
        }
      },
    };
    if (murdererPick || victimPick) {
      secondary = [
        {
          id: 'reset-picks',
          label: '重选卡牌',
          disabled: false,
          onAction: () => {
            setMurdererPick(null);
            setVictimPick(null);
          },
        },
      ];
    }
  } else if (view.phase === 'relay' && myTurnRelay && myId) {
    primary = {
      id: 'relay-done',
      label: '表演完成（传给下一棒）✓',
      disabled: false,
      onAction: () => {
        void act({ type: 'relay_done', playerId: myId });
      },
    };
    secondary = [];
  } else if (view.phase === 'discussion' && myId) {
    if (isHeadGoose) {
      primary = {
        id: 'end-discussion',
        label: '结束讨论（开启指认）➔',
        disabled: false,
        onAction: () => {
          void act({ type: 'end_discussion', playerId: myId });
        },
      };
    } else {
      primary = {
        id: 'wait-head-end-discussion',
        label: `等待头鹅（${headPlayerName ?? '首位玩家'}）结束讨论…`,
        disabled: true,
        onAction: () => {},
      };
    }
    secondary = [
      {
        id: 'view-cards-disc',
        label: '查看 9 张特征卡',
        disabled: false,
        onAction: () => setCardModalOpen(true),
      },
    ];
  } else if (view.phase === 'accusation' && myTurnAccuse && myId) {
    const ready = murdererPick !== null && victimPick !== null && murdererPick !== victimPick;
    primary = {
      id: 'confirm-accuse',
      label: ready
        ? `确认指认：【${getGooseCard(murdererPick).name}】➔【${getGooseCard(victimPick).name}】`
        : '打开卡牌遮罩进行指认 ➔',
      disabled: false,
      onAction: () => {
        if (ready) {
          handleConfirmPicks();
        } else {
          setCardModalOpen(true);
        }
      },
    };
    if (murdererPick || victimPick) {
      secondary = [
        {
          id: 'reset-accuse',
          label: '重选指认',
          disabled: false,
          onAction: () => {
            setMurdererPick(null);
            setVictimPick(null);
          },
        },
      ];
    }
  } else if (view.phase === 'vote' && myId) {
    if (hasVoted) {
      primary = {
        id: 'has-voted',
        label: voteTarget ? `已投票给【${nameFor(members, voteTarget)}】` : '已投票，等待全员完成…',
        disabled: true,
        onAction: () => {},
      };
      secondary = [
        {
          id: 'view-cards-vote',
          label: '查看 9 张特征卡',
          disabled: false,
          onAction: () => setCardModalOpen(true),
        },
      ];
    } else {
      primary = voteTarget
        ? {
            id: 'confirm-vote',
            label: `确认投票给【${nameFor(members, voteTarget)}】➔`,
            disabled: false,
            onAction: () => {
              void act({ type: 'cast_vote', playerId: myId, targetPlayerId: voteTarget });
              setHasVoted(true);
            },
          }
        : {
            id: 'wait-vote',
            label: '请点击选择你怀疑的恶鹅 ➔',
            disabled: true,
            onAction: () => {},
          };
      secondary = [
        ...view.players
          .filter((pid) => pid !== myId)
          .map((pid) => ({
            id: `vote-${pid}`,
            label: `${voteTarget === pid ? '✓ 怀疑 ' : '投 '}${nameFor(members, pid)}`,
            disabled: false,
            onAction: () => setVoteTarget(pid),
          })),
        {
          id: 'view-cards-vote',
          label: '查看 9 张特征卡',
          disabled: false,
          onAction: () => setCardModalOpen(true),
        },
      ];
    }
  }

  // 等待提示文案
  const waitingReason =
    view.phase === 'game_over'
      ? null
      : view.phase === 'claim_head'
        ? '点击按钮抢当头鹅，先到先得！'
        : view.phase === 'pick_cards'
          ? isHeadGoose
            ? '请在卡牌遮罩中选定 1 凶手 + 1 受害者确立案情'
            : `头鹅（${headPlayerName}）正在密谋挑选案情特征卡…`
          : view.phase === 'relay'
            ? myTurnRelay
              ? isHeadGoose
                ? '第 1 棒（你）：请按案情进行肢体表演，完成后点击下方确认'
                : '轮到你表演！请模仿前一人的动作传递给下一人，完成后点击确认'
              : `第 ${view.currentIndex + 1} 棒（${currentRelayPlayerName}）正在进行动作表演…`
            : view.phase === 'discussion'
              ? isHeadGoose
                ? '你是头鹅：线下讨论充分后，点击下方「结束讨论」开启全员倒序指认'
                : `全员线下讨论中：请等待头鹅（${headPlayerName ?? '首位玩家'}）结束讨论并开启指认…`
              : view.phase === 'accusation'
                ? myTurnAccuse
                  ? '轮到你指认！请在卡牌遮罩中选出你推理的凶手与受害鸭'
                  : `等待第 ${view.currentAccuserIndex + 1} 棒（${currentAccuserPlayerName}）指认案情…`
                : hasVoted
                  ? '你已完成投票，等待其他玩家投票…'
                  : '投票阶段——请点击选择潜伏在队伍中的恶鹅';

  const isSelectionPhase =
    (view.phase === 'pick_cards' && isHeadGoose) ||
    (view.phase === 'accusation' && myTurnAccuse);
  const isPicksReady = murdererPick !== null && victimPick !== null && murdererPick !== victimPick;

  return (
    <TabletopShell
      title="以鹅传鹅"
      phase={phaseLabel(view.phase)}
      gameId="goose-relay"
      phaseKey={`${view.phase}:${view.phase === 'relay' ? view.lineOrder[view.currentIndex] ?? 'relay-idle' : view.phase === 'accusation' ? view.lineOrder[view.currentAccuserIndex] ?? 'accuse-idle' : view.headPlayerId ?? 'idle'}:${view.currentIndex}:${view.currentAccuserIndex}:${view.phase === 'game_over' ? view.winners.join(',') || 'no-winner' : view.caseMatched ?? 'pending'}`}
      spectator={isSpectator}
      players={players}
      theme="meadow"
      rulesButton={
        <button
          ref={rulesRef}
          type="button"
          className="tabletop-rules-btn"
          onClick={() => setRulesOpen(true)}
        >
          本局规则
        </button>
      }
      actions={
        <ActionDock
          primary={
            primary ?? {
              id: 'wait',
              label: '等待阶段推进',
              disabled: true,
              onAction: () => {},
            }
          }
          secondary={secondary}
          busy={busy}
          waitingReason={waitingReason ?? undefined}
        />
      }
      drawer={
        rulesOpen && (
          <GameDrawer
            kind="rules"
            title="以鹅传鹅 游戏规则"
            triggerRef={rulesRef}
            onClose={() => setRulesOpen(false)}
          >
            <div className="goose-rules-content">
              <h4>阵营与角色</h4>
              <p>
                <strong>头鹅（1人）</strong>：抢当头鹅，从 9 张展示卡中选 1 张凶手 + 1
                张受害者开启第 1 棒动作表演。
              </p>
              <p>
                <strong>白鹅（好人）</strong>
                ：通过观察前一位的表演，如实向后传递，最终还原真相或抓出恶鹅。
              </p>
              <p>
                <strong>恶鹅（1人）</strong>
                ：潜伏卧底，故意在动作传递中添油加醋或歪曲案情，误导村民。
              </p>
              <h4>胜负判定（OR 逻辑）</h4>
              <p>
                <strong>白鹅获胜</strong>：全员在倒序指认中【指对了案情】，或在投票中【投出了恶鹅】。
              </p>
              <p>
                <strong>恶鹅获胜</strong>：白鹅【既未指对案情，也未投出恶鹅】。
              </p>
            </div>
          </GameDrawer>
        )
      }
    >
      {error && (
        <p className="game-error" role="alert" aria-live="assertive" aria-atomic="true">
          {error}
        </p>
      )}

      {/* 舞台区：草地牧场毡面（3D 透视），传递轨道沿席位环走 */}
      <div className="gr-stage stage-felt-3d" ref={stage.stageRef}>
        {/* 装饰层：篱笆 + 云朵剪影，12% 透明度，填毡面四周的空白 */}
        <div className="stage-art gr-art">
          <PastureArt />
        </div>
        {/* 只在需要玩家行动的阶段催时间 */}
        <StageCountdownRing
          deadlineAt={view.deadlineAt}
          phaseKey={`${view.phase}:${view.currentIndex}:${view.currentAccuserIndex}`}
          active={view.phase !== 'game_over' && view.phase !== 'discussion'}
          className="gr-countdown"
        />
        <div className="sg-stage goose-game-stage gr-stage__plane stage-felt-3d__plane" data-stamp={stage.stamp ? (stage.stamp.correct ? 'correct' : 'wrong') : undefined}>
        {/* 抢头鹅初始阶段展台 */}
        {view.phase === 'claim_head' && (
          <ArenaBoard
            className="goose-focal goose-claim-hero-panel"
            tone="accent"
            headline="谁来担当发题头鹅？"
            hint="头鹅将从 9 张特征卡中秘密选定【1 凶手 + 1 受害鸭】，并开启第一棒肢体表演"
            footer={<span className="goose-claim-hero-cta">点击下方操作栏「抢当头鹅」，先到先得</span>}
          />
        )}

        {/* 顶部身份提示栏 */}
        {me && me.role && (
          <div
            className={`goose-role-tag ${me.role === 'evil' ? 'goose-role-tag--evil' : me.role === 'head' ? 'goose-role-tag--head' : ''}`}
            role="status"
          >
            <span className="goose-role-tag__dot" aria-hidden="true" />
            <span>
              你的身份：<strong>{roleLabel(me.role)}</strong>
              {me.role === 'evil' && '（你是唯一的恶鹅，请在线下表演中误导大家！）'}
              {me.role === 'head' && '（你是发题头鹅，请根据案情开始第 1 棒动作表演！）'}
            </span>
          </div>
        )}

        {/* 头鹅私密查看案情卡 */}
        {isHeadGoose && me?.observed && view.phase !== 'claim_head' && (
          <section className="sg-panel goose-head-secret-panel">
            <div className="sg-panel__head">
              <h3>头鹅案情卡（仅你可见）</h3>
              <button
                type="button"
                className="goose-peek-btn"
                onClick={() => setShowSecretCase(!showSecretCase)}
              >
                {showSecretCase ? (
                  <>
                    <EyeOff size={14} aria-hidden="true" />
                    <span>隐藏案情</span>
                  </>
                ) : (
                  <>
                    <Eye size={14} aria-hidden="true" />
                    <span>私密查看</span>
                  </>
                )}
              </button>
            </div>
            {showSecretCase ? (
              <div className="goose-secret-cards-row">
                <div className="goose-secret-card-item goose-secret-card--murderer">
                  <span className="goose-secret-badge">凶手鸭</span>
                  <img
                    src={getGooseCard(me.observed.murderer).image}
                    alt={getGooseCard(me.observed.murderer).name}
                    className="goose-secret-card-img"
                  />
                </div>
                <span className="goose-case-arrow">➔ 杀死了 ➔</span>
                <div className="goose-secret-card-item goose-secret-card--victim">
                  <span className="goose-secret-badge">受害鸭</span>
                  <img
                    src={getGooseCard(me.observed.victim).image}
                    alt={getGooseCard(me.observed.victim).name}
                    className="goose-secret-card-img"
                  />
                </div>
              </div>
            ) : (
              <p className="goose-secret-hint">案情已锁定。点击「私密查看」可随时复习案情卡。</p>
            )}
          </section>
        )}

        {/* 表演传递轨 / 指认进度轨 → 牧场跑道：每个席位是一只鹅 */}
        {(view.phase === 'relay' || view.phase === 'accusation' || view.phase === 'discussion') && (
          <ArenaBoard
            className="goose-focal goose-track-board"
            tone="paper"
            headline={view.phase === 'accusation' ? '末棒倒序指认轨' : '动作传递接力轨'}
            hint={view.phase === 'accusation' ? '从末位倒序向前指认' : '从头鹅逐棒向后传递'}
          >
            <GooseTrack
              label="接力进度轨"
              reverse={view.phase === 'accusation'}
              seats={(view.lineOrder ?? []).map((playerId, index) => {
                const isHead = playerId === view.headPlayerId;
                const isCurrentRelay = view.phase === 'relay' && index === view.currentIndex;
                const isCurrentAccuse =
                  view.phase === 'accusation' && index === view.currentAccuserIndex;
                const doneRelay =
                  (view.phase === 'relay' && view.currentIndex >= 0 && index < view.currentIndex) ||
                  // 讨论阶段：整条跑道都已传完
                  view.phase === 'discussion';
                const doneAccuse =
                  view.phase === 'accusation' &&
                  view.currentAccuserIndex >= 0 &&
                  index > view.currentAccuserIndex;

                return {
                  playerId,
                  label: `${isHead ? '头 · ' : ''}${playerId === myId ? `${nameFor(members, playerId)} (我)` : nameFor(members, playerId)}`,
                  badge: isHead ? '头鹅' : doneRelay || doneAccuse ? '✓' : index + 1,
                  state: isCurrentRelay || isCurrentAccuse
                    ? 'active'
                    : doneRelay || doneAccuse
                      ? 'done'
                      : 'idle',
                  isHead,
                  isMe: playerId === myId,
                  avatar: avatarOf(playerId),
                };
              })}
            />
          </ArenaBoard>
        )}

        {/* 主舞台卡牌坞 → 焦点板（主操作放页脚） */}
        {(view.candidateCards ?? []).length > 0 && view.phase !== 'game_over' && (
          <ArenaBoard
            className="goose-focal goose-card-dock-banner"
            tone="paper"
            headline={(
              <span className="goose-card-dock-title">
                <LayoutGrid size={18} strokeWidth={2.4} aria-hidden="true" />
                本局特征鸭卡池（共 9 张）
              </span>
            )}
            hint={
              !murdererPick && !victimPick
                ? (isSelectionPhase ? '点击下方按钮打开遮罩选卡' : '点击下方按钮随时查看 9 张特征卡')
                : undefined
            }
            footer={(
              <button
                type="button"
                className={`goose-card-dock-btn ${isSelectionPhase ? 'is-highlight' : ''}`}
                onClick={() => setCardModalOpen(true)}
              >
                {isSelectionPhase ? '打开卡牌遮罩选卡 ➔' : '查看 9 张特征鸭卡'}
              </button>
            )}
          >
            {(murdererPick || victimPick) && (
              <div className="goose-card-dock-summary">
                {murdererPick && (
                  <span className="goose-dock-tag goose-dock-tag--m">
                    凶手：{getGooseCard(murdererPick).name}
                  </span>
                )}
                {victimPick && (
                  <span className="goose-dock-tag goose-dock-tag--v">
                    受害：{getGooseCard(victimPick).name}
                  </span>
                )}
              </div>
            )}
          </ArenaBoard>
        )}

        {/* 接力阶段非头鹅提示：全凭肢体表演向后传递，暂不看牌 */}
        {(view.candidateCards ?? []).length === 0 && view.phase === 'relay' && !isHeadGoose && (
          <ArenaBoard
            className="goose-focal"
            tone="dark"
            headline="动作接力中"
            hint="请专注观察前一位玩家的动作表演并向后传递。所有人表演完成后，将公布 9 张特征牌供讨论与指认"
          />
        )}

        {/* 案情指认记录（次级信息：全阶段共用一份，不再按阶段重复渲染） */}
        {(view.accusations ?? []).length > 0 && view.phase !== 'game_over' && (
          <section className="goose-accusations-history" aria-label="指认记录">
            <div className="goose-accusations-history__head">
              <h3>案情指认记录</h3>
              <span>{view.caseMatched ? '已有人指对！' : '倒序指认推进中'}</span>
            </div>
            <ul className="goose-history-list">
              {(view.accusations ?? []).map((item, idx) => (
                <li
                  key={idx}
                  className={`goose-history-item ${item.correct ? 'is-correct' : 'is-wrong'}`}
                >
                  <span className="goose-history-name">{nameFor(members, item.playerId)}</span>
                  <span className="goose-history-result">
                    {item.correct ? '还原真相（指对）' : '指认错误'}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* 投票区 → 焦点板 + 席位直选 */}
        {view.phase === 'vote' && (
          <ArenaBoard
            className="goose-focal"
            tone="accent"
            headline="揪恶投票"
            hint="谁是故意传递错误动作的恶鹅？点选你要投票的目标（不能投自己）"
            footer={<span className="sg-badge">已投 {view.votesCast} / {view.players.length} 人</span>}
          >
            <SeatTargetPicker
              label="投票揪出恶鹅"
              selectedIds={voteTarget ? [voteTarget] : []}
              onSelect={(ids) => setVoteTarget(ids[0] ?? null)}
              disabled={hasVoted}
              options={view.players
                .filter((pid) => pid !== myId)
                .map((pid) => ({ id: pid, name: nameFor(members, pid) }))}
            />
          </ArenaBoard>
        )}

        {/* 终局揭晓面板（game_over） */}
        {view.phase === 'game_over' && view.reveal && (
          <section className="sg-panel goose-reveal-panel" aria-label="终局大揭秘">
            <div className="goose-game-over-banner">
              {(view.winners ?? []).some((id) => (view.reveal?.evilGeese ?? []).includes(id)) ? (
                <div className="goose-result-card goose-result-card--evil">
                  <h2>恶鹅阵营获胜！</h2>
                  <p>白鹅未能还原案情真相，恶鹅也成功逃过了投票裁决！</p>
                </div>
              ) : (
                <div className="goose-result-card goose-result-card--white">
                  <h2>白鹅村民阵营获胜！</h2>
                  <p>
                    {view.reveal?.caseMatched && view.reveal?.evilIdentified
                      ? '白鹅既还原了案情真相，又成功揪出了潜伏的恶鹅！'
                      : view.reveal?.caseMatched
                        ? '白鹅成功指对了案情真相！'
                        : '白鹅成功票选揪出了潜伏的恶鹅！'}
                  </p>
                </div>
              )}
            </div>

            {/* 真相卡牌揭秘 */}
            {view.reveal?.case && (
              <div className="goose-reveal-case-box">
                <h3>🪿 案件真相揭晓</h3>
                <div className="goose-reveal-cards-row">
                  <div className="goose-reveal-card-item goose-reveal-card--m">
                    <span className="goose-reveal-tag goose-reveal-tag--m">真正的凶手鸭</span>
                    <img
                      src={getGooseCard(view.reveal.case.murderer).image}
                      alt={getGooseCard(view.reveal.case.murderer).name}
                      className="goose-reveal-card-img"
                    />
                  </div>
                  <span className="goose-reveal-arrow">➔ 杀死了 ➔</span>
                  <div className="goose-reveal-card-item goose-reveal-card--v">
                    <span className="goose-reveal-tag goose-reveal-tag--v">真正的受害鸭</span>
                    <img
                      src={getGooseCard(view.reveal.case.victim).image}
                      alt={getGooseCard(view.reveal.case.victim).name}
                      className="goose-reveal-card-img"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* 恶鹅身份揭晓 */}
            <div className="goose-reveal-identity-box">
              <h3>潜伏恶鹅揭晓</h3>
              <div className="goose-evil-names-list">
                {(view.reveal?.evilGeese ?? []).map((pid) => (
                  <span key={pid} className="goose-evil-player-badge">
                    {nameFor(members, pid)}
                  </span>
                ))}
              </div>
            </div>

            {/* 投票结果明细 */}
            <div className="goose-reveal-votes-box">
              <h3>投票统计</h3>
              <ul className="goose-votes-list">
                {Object.entries(view.reveal?.voteCounts ?? {}).map(([pid, count], voteIndex) => (
                  <li key={pid} className="goose-vote-stat-item" style={{ ['--i' as string]: voteIndex }}>
                    <span>{nameFor(members, pid)}</span>
                    <strong>{count} 票</strong>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}
      </div>
      </div>

      {/* 全屏卡牌遮罩层（Modal Mask Overlay） */}
      {cardModalOpen &&
        createPortal(
          <div
            className="goose-card-modal-backdrop"
            role="dialog"
            aria-modal="true"
            aria-label="特征鸭卡遮罩选择层"
            onClick={(e) => {
              if (e.target === e.currentTarget && !isSelectionPhase) {
                setCardModalOpen(false);
              }
            }}
          >
            <div className="goose-card-modal-dialog">
              {/* 遮罩层顶栏 */}
              <div className="goose-card-modal-header">
                <div>
                  <h3 className="goose-card-modal-title">
                    {view.phase === 'pick_cards' && isHeadGoose
                      ? '头鹅选卡定案'
                      : view.phase === 'accusation' && myTurnAccuse
                        ? '案情指认'
                        : '🪿 本局特征鸭卡池'}
                  </h3>
                  <p className="goose-card-modal-desc">
                    {isSelectionPhase
                      ? '点击卡牌点选 1 张【凶手鸭】与 1 张【受害鸭】确立案情'
                      : '全场玩家可见的 9 张候选特征池'}
                  </p>
                </div>
                <button
                  type="button"
                  className="goose-card-modal-close"
                  onClick={() => setCardModalOpen(false)}
                  title="关闭/收起遮罩"
                >
                  <X size={20} strokeWidth={2.4} aria-hidden="true" />
                </button>
              </div>

              {/* 当前选定状态提示 */}
              {isSelectionPhase && (
                <div className="goose-modal-selection-bar">
                  <div className={`goose-select-slot ${murdererPick ? 'is-picked' : ''}`}>
                    <span className="slot-label">凶手鸭：</span>
                    <strong>{murdererPick ? getGooseCard(murdererPick).name : '未点选'}</strong>
                  </div>
                  <span className="slot-divider">➔</span>
                  <div className={`goose-select-slot ${victimPick ? 'is-picked' : ''}`}>
                    <span className="slot-label">受害鸭：</span>
                    <strong>{victimPick ? getGooseCard(victimPick).name : '未点选'}</strong>
                  </div>
                </div>
              )}

              {/* 9 张卡牌九宫格展示区 */}
              <div className="goose-modal-cards-grid">
                {view.candidateCards.map((cardKey, cardIndex) => {
                  const card = getGooseCard(cardKey);
                  const isMurderer = murdererPick === cardKey;
                  const isVictim = victimPick === cardKey;

                  return (
                    <div
                      key={cardKey}
                      role={isSelectionPhase ? 'button' : undefined}
                      tabIndex={isSelectionPhase ? 0 : undefined}
                      className={`goose-modal-card-item ${isMurderer ? 'is-murderer' : ''} ${isVictim ? 'is-victim' : ''} ${isSelectionPhase ? 'is-clickable' : ''}`}
                      style={{ ['--i' as string]: cardIndex }}
                      onClick={() => handleCardClick(cardKey)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') handleCardClick(cardKey);
                      }}
                    >
                      {isMurderer && (
                        <div className="goose-modal-card-tag goose-modal-card-tag--m">凶手鸭</div>
                      )}
                      {isVictim && (
                        <div className="goose-modal-card-tag goose-modal-card-tag--v">受害鸭</div>
                      )}
                      <img
                        src={card.image}
                        alt={card.name}
                        className="goose-modal-card-img"
                        loading="lazy"
                      />
                    </div>
                  );
                })}
              </div>

              {/* 遮罩层底栏操作 */}
              <div className="goose-card-modal-footer">
                {isSelectionPhase ? (
                  <>
                    <button
                      type="button"
                      className="goose-modal-btn goose-modal-btn--secondary"
                      onClick={() => {
                        setMurdererPick(null);
                        setVictimPick(null);
                      }}
                      disabled={!murdererPick && !victimPick}
                    >
                      <RotateCcw size={15} strokeWidth={2.4} aria-hidden="true" />
                      <span>重选</span>
                    </button>
                    <button
                      type="button"
                      className="goose-modal-btn goose-modal-btn--primary"
                      disabled={!isPicksReady || busy}
                      onClick={handleConfirmPicks}
                    >
                      <Check size={16} strokeWidth={2.5} aria-hidden="true" />
                      <span>
                        {isPicksReady
                          ? view.phase === 'pick_cards'
                            ? '确认定案'
                            : '确认指认'
                          : '请选择凶手与受害鸭'}
                      </span>
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="goose-modal-btn goose-modal-btn--primary"
                    onClick={() => setCardModalOpen(false)}
                  >
                    <span>完成阅览（返回桌台）</span>
                  </button>
                )}
              </div>
            </div>
          </div>,
          document.body,
        )}
      {/* 飞行层必须挂在毡面之外：毡面是 perspective 容器，
          一旦有 transform 祖先，position:fixed 会退化为相对定位。 */}
      <FlightLayer flights={stage.flights} simplified={stage.simplifiedFlights} />
      {phaseOverlay}
      <TabletopVictoryBurst
        gameOver={view.phase === 'game_over'}
        isWinner={myId ? (view.winners ?? []).includes(myId) : null}
        label={(view.winners ?? []).some((id) => (view.reveal?.evilGeese ?? []).includes(id)) ? '恶鹅阵营获胜' : '白鹅村民获胜'}
        sublabel={`获胜玩家：${(view.winners ?? []).map((id) => nameFor(members, id)).join('、')}`}
      />
    </TabletopShell>
  );
}
