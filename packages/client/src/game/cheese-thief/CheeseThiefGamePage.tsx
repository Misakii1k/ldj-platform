/**
 * cheese_thief_classic_v1 客户端主页面（线下辅助与模拟模式双模体系）。
 * 支持「玩家手牌端（3D 骰盅防偷窥）」与「桌面中央端（案发大屏与 TTS 法官）」
 */
import { useEffect, useRef, useState } from 'react';
import { useConnection } from '../../connection/useConnection.ts';
import { resolveInitialDeviceRole } from '../../app/appMode.ts';
import { nameFor, useGameAction } from '../useGameAction.ts';
import { ActionDock } from '../tabletop/ActionDock.tsx';
import { GameDrawer } from '../tabletop/GameDrawer.tsx';
import { TabletopShell } from '../tabletop/TabletopShell.tsx';
import { CheeseDiceCup3D } from './CheeseDiceCup3D.tsx';
import { CheeseTabletopArena } from './CheeseTabletopArena.tsx';
import { CheeseGameOverReveal } from './CheeseGameOverReveal.tsx';
import { IdentityFlipCard } from '../../shared-ui/IdentityFlipCard.tsx';
import { ArenaBoard } from '../../shared-ui/ArenaBoard.tsx';
import { ArenaRail } from '../../shared-ui/ArenaRail.tsx';
import { SeatTargetPicker } from '../../shared-ui/SeatTargetPicker.tsx';
import { useCheeseTTS } from './useCheeseTTS.ts';
import { useCountdown } from '../../shared-ui/useCountdown.ts';
import type { CheeseThiefPlayerView, RoleCard } from './types.ts';

const ROLE_LABELS: Record<RoleCard, string> = {
  cat: '猫（夏洛克）',
  dog: '狗（沃特恩）',
  whiteMouse: '白老鼠（背锅鼠）',
  none: '',
};

function phaseLabel(phase: CheeseThiefPlayerView['phase']): string {
  switch (phase) {
    case 'hour_choice': return '选择醒来时刻';
    case 'night': return '夜间推进';
    case 'accomplice_select': return '共犯选择';
    case 'dawn': return '天亮讨论';
    case 'vote': return '投票指认';
    case 'game_over': return '对局结束';
    default: return phase;
  }
}

interface Props {
  view: CheeseThiefPlayerView;
}

export function CheeseThiefGamePage({ view }: Props) {
  const { state } = useConnection();
  const members = state.room?.members ?? [];
  const { act, busy, error, clearError } = useGameAction();
  const me = view.me;
  const myId = me?.playerId ?? null;
  const isSpectator = me === null;
  const rulesRef = useRef<HTMLButtonElement | null>(null);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [peekTarget, setPeekTarget] = useState<string | null>(null);
  const [voteTarget, setVoteTarget] = useState<string | null>(null);
  const [accomplicePicks, setAccomplicePicks] = useState<string[]>([]);
  const [voteModalDismissed, setVoteModalDismissed] = useState(false);
  const [voteConfirmCandidate, setVoteConfirmCandidate] = useState<string | 'abstain' | null>(null);

  // 阶段倒计时计算
  const countdown = useCountdown(view.deadlineAt);
  const mm = Math.floor(countdown.secondsLeft / 60);
  const ss = countdown.secondsLeft % 60;
  const timeFormatted = `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
  const totalVoted = view.votes ? Object.keys(view.votes).length : 0;

  // 进入投票阶段时自动弹出手机端投票窗口
  useEffect(() => {
    if (view.phase === 'vote') {
      setVoteModalDismissed(false);
      setVoteConfirmCandidate(null);
    }
  }, [view.phase]);

  // 阶段或时刻变更时，自动清理陈旧错误提示
  useEffect(() => {
    clearError();
  }, [view.phase, view.currentHour, clearError]);

  // 模拟模式设备角色：'table' 桌面中央大屏，'player' 玩家手牌端
  const isSimulator = view.mode === 'simulator';
  const [deviceRole, setDeviceRole] = useState<'player' | 'table'>(
    () => resolveInitialDeviceRole('ldj_cheese_device_role'),
  );

  const selectDeviceRole = (role: 'player' | 'table') => {
    setDeviceRole(role);
    try {
      localStorage.setItem('ldj_cheese_device_role', role);
    } catch {
      // Ignore localStorage errors
    }
  };

  const isSimulatorTable = deviceRole === 'table';

  // 开局准备阶段判定（两骰自选或夜间第 0 时刻）
  const isOpening = view.phase === 'hour_choice' || (view.phase === 'night' && view.currentHour === 0);
  const [identityCardVisible, setIdentityCardVisible] = useState(isOpening);
  const [identityCardExiting, setIdentityCardExiting] = useState(false);
  const prevOpeningRef = useRef(isOpening);

  // 身份卡开局看身份倒计时结束（进入第 1 时刻）后，平滑淡出+缩放彻底消失
  useEffect(() => {
    if (prevOpeningRef.current && !isOpening) {
      setIdentityCardExiting(true);
      const timer = setTimeout(() => {
        setIdentityCardVisible(false);
        setIdentityCardExiting(false);
      }, 450);
      return () => clearTimeout(timer);
    } else if (!prevOpeningRef.current && isOpening) {
      setIdentityCardVisible(true);
      setIdentityCardExiting(false);
    }
    prevOpeningRef.current = isOpening;
  }, [isOpening]);

  // 倒计时由底部通栏平滑位移至顶部动效控制
  const [countdownMoving, setCountdownMoving] = useState(false);
  const prevOpeningForCountdownRef = useRef(isOpening);

  useEffect(() => {
    if (prevOpeningForCountdownRef.current && !isOpening) {
      setCountdownMoving(true);
      const timer = setTimeout(() => {
        setCountdownMoving(false);
      }, 600);
      return () => clearTimeout(timer);
    }
    prevOpeningForCountdownRef.current = isOpening;
  }, [isOpening]);

  // 天亮讨论面板收起/展开状态（离开 dawn 阶段时自动重置）
  const [discussionCollapsed, setDiscussionCollapsed] = useState(false);
  useEffect(() => {
    if (view.phase !== 'dawn') {
      setDiscussionCollapsed(false);
    }
  }, [view.phase]);

  // 专属 TTS/录音法官主持 Hook（依据权威 view.deadlineAt 动态排程）
  const { ttsEnabled, toggleTts } = useCheeseTTS({
    phase: view.phase,
    currentHour: view.currentHour,
    mode: view.mode,
    isTable: isSimulatorTable || !isSimulator,
    deadlineAt: view.deadlineAt,
    thiefCaught: view.thiefCaught,
    cheeseStolen: view.cheeseStolen,
    revealedCat: view.revealedCat,
    revealedDog: view.revealedDog,
  });

  const myTurnAccomplice =
    view.phase === 'accomplice_select' && me?.isThief === true && myId !== null;
  const accompliceCount = view.players.length >= 7 ? 2 : 1;

  const players = view.players.map((playerId) => {
    let status = '';
    if (view.phase === 'game_over') {
      status = (view.winners ?? []).includes(playerId) ? '获胜' : '失败';
    } else if (playerId === myId) {
      status = me?.isThief ? '我是大盗' : me?.isAccomplice ? '我是共犯' : '贪睡鼠';
    }
    return { id: playerId, name: nameFor(members, playerId), status, active: false };
  });

  // 主操作
  let primary: Parameters<typeof ActionDock>[0]['primary'] | null = null;
  let secondary: Parameters<typeof ActionDock>[0]['secondary'] = [];

  if (view.phase === 'hour_choice' && me?.hourChoices && myId) {
    const hasChosen = typeof me.wakeHour === 'number' && me.wakeHour > 0;
    if (hasChosen) {
      primary = {
        id: 'hour-chosen',
        label: `已选定第 ${me.wakeHour} 时刻醒来（等待其他玩家）`,
        disabled: true,
        onAction: () => {},
      };
      secondary = [];
    } else {
      const [h1, h2] = me.hourChoices;
      primary = {
        id: `choose-${h1}`,
        label: `选定 ${h1} 点醒来`,
        disabled: busy,
        onAction: () => {
          void act({ type: 'choose_hour', playerId: myId, hour: h1 });
        },
      };
      secondary = [
        {
          id: `choose-${h2}`,
          label: `选定 ${h2} 点醒来`,
          disabled: busy,
          onAction: () => {
            void act({ type: 'choose_hour', playerId: myId, hour: h2 });
          },
        },
      ];
    }
  } else if (myTurnAccomplice && myId) {
    const selected = accomplicePicks;
    const ready = selected.length === accompliceCount;
    primary = {
      id: 'confirm-accomplice',
      label: ready ? `确认共犯（${selected.map((id) => nameFor(members, id)).join('、')}）` : `已选 ${selected.length}/${accompliceCount}`,
      disabled: !ready,
      onAction: () => {
        if (!ready) return;
        void act({ type: 'select_accomplice', playerId: myId, accompliceIds: selected });
      },
    };
  } else if (view.phase === 'night' && me && me.wakeHour === view.currentHour && !view.cheeseStolen && (me.coWakers ?? []).length === 0 && myId) {
    primary = {
      id: 'steal-cheese',
      label: '🧀 伸手偷走奶酪（成为大盗）',
      disabled: busy,
      onAction: () => {
        void act({ type: 'steal_cheese', playerId: myId });
      },
    };
  } else if (view.phase === 'night' && me?.canPeek && myId) {
    primary = peekTarget
      ? { id: 'confirm-peek', label: `查看 ${nameFor(members, peekTarget)} 的骰子`, disabled: false, onAction: () => { void act({ type: 'peek_die', playerId: myId, targetPlayerId: peekTarget }); } }
      : { id: 'skip-peek', label: '不查看（跳过）', disabled: false, onAction: () => void act({ type: 'skip_peek', playerId: myId }) };
  } else if (view.phase === 'dawn' && me?.roleCard === 'cat' && myId && view.revealedCat === null) {
    primary = { id: 'reveal-cat', label: '展示猫身份并查看骰子', disabled: false, onAction: () => {} };
    secondary = view.players
      .filter((id) => id !== myId)
      .map((id) => ({
        id: `cat-${id}`,
        label: `查看 ${nameFor(members, id)}`,
        disabled: false,
        onAction: () => void act({ type: 'reveal_cat', playerId: myId, targetPlayerId: id }),
      }));
  } else if (view.phase === 'dawn' && me?.roleCard === 'dog' && myId && view.revealedDog === null) {
    primary = { id: 'reveal-dog', label: '展示狗身份并指定先投票', disabled: false, onAction: () => {} };
    secondary = view.players
      .filter((id) => id !== myId)
      .map((id) => ({
        id: `dog-${id}`,
        label: `指定 ${nameFor(members, id)} 先投票`,
        disabled: false,
        onAction: () => void act({ type: 'reveal_dog', playerId: myId, firstVoterId: id }),
      }));
  } else if (view.phase === 'vote' && myId) {
    if (me?.hasVoted) {
      primary = {
        id: 'has-voted',
        label: voteTarget ? `已指认 ${nameFor(members, voteTarget)}（已投票）` : '已完成投票，等待开票…',
        disabled: true,
        onAction: () => {},
      };
      secondary = [];
    } else {
      primary = voteTarget
        ? { id: 'confirm-vote', label: `指认 ${nameFor(members, voteTarget)}`, disabled: false, onAction: () => { void act({ type: 'cast_vote', playerId: myId, targetPlayerId: voteTarget }); } }
        : { id: 'abstain', label: '弃票', disabled: false, onAction: () => void act({ type: 'cast_abstention', playerId: myId }) };
    }
  }

  const waitingReason = view.phase === 'game_over'
    ? null
    : view.phase === 'hour_choice'
      ? me?.wakeHour
        ? `你已选定第 ${me.wakeHour} 时刻，等待其他玩家完成选择…`
        : '你掷出了两枚骰子，请在下方选择你的醒来时刻'
      : view.phase === 'night'
        ? me?.wakeHour === view.currentHour
          ? !view.cheeseStolen && (me.coWakers ?? []).length === 0
            ? '轮到你的时刻且独醒！奶酪就在桌上，点击偷走奶酪成为怪盗'
            : me.canPeek
              ? '轮到你的时刻且独醒：按住目标玩家骰盅偷看其点数，或直接跳过'
              : (me.coWakers ?? []).length > 0
                ? '轮到你的时刻：有其他人同时醒来，互相目击'
                : '轮到你的时刻推进中'
          : '夜间进行中——闭眼装睡，轮到你的时刻才睁眼'
        : view.phase === 'accomplice_select'
          ? '大盗正在秘密挑选共犯（限时 17 秒）…'
          : view.phase === 'dawn'
            ? '天亮讨论中——线下自由发言，讨论结束自动进入投票'
            : me?.hasVoted
              ? '你已完成投票，等待其他玩家完成投票…'
              : '请选择你怀疑的大盗，或在下方操作栏弃票';

  const presentationState = error
    ? 'error'
    : busy
      ? 'busy'
      : view.phase === 'game_over'
        ? 'result'
        : primary && !primary.disabled
          ? 'action'
          : 'waiting';
  const phaseAnnouncement = view.phase === 'night'
    ? `${phaseLabel(view.phase)}，当前 ${Math.max(1, view.currentHour)} 点`
    : phaseLabel(view.phase);

  const headerControls = (
    <div className="cheese-top-controls">
      <div className="cheese-role-switch" role="group" aria-label="设备用途选择">
        <button
          type="button"
          className={`cheese-role-pill ${deviceRole === 'player' ? 'is-active' : ''}`}
          onClick={() => selectDeviceRole('player')}
          aria-pressed={deviceRole === 'player'}
          title="作为玩家个人手牌设备使用（持在手中）"
        >
          
          <span className="cheese-btn-text">玩家端</span>
        </button>
        <button
          type="button"
          className={`cheese-role-pill ${deviceRole === 'table' ? 'is-active' : ''}`}
          onClick={() => selectDeviceRole('table')}
          aria-pressed={deviceRole === 'table'}
          title="作为桌面中央公共案发大屏使用（平放于桌面正中）"
        >
          
          <span className="cheese-btn-text">桌面端</span>
        </button>
      </div>
      <button
        type="button"
        className={`cheese-tts-icon-btn ${ttsEnabled ? 'is-active' : ''}`}
        onClick={toggleTts}
        aria-pressed={ttsEnabled}
        aria-label={ttsEnabled ? '关闭语音法官主持' : '开启语音法官主持'}
        title={ttsEnabled ? '点击关闭语音法官主持' : '点击开启语音法官主持'}
      >
        <span>{ttsEnabled ? '语音' : '静音'}</span>
      </button>
    </div>
  );

  return (
    <TabletopShell
      title="奶酪大盗"
      phase={phaseLabel(view.phase)}
      phaseKey={`${view.phase}:${view.currentHour}`}
      gameId="cheese-thief"
      spectator={isSpectator}
      players={players}
      theme="night"
      hideSeats={isSimulatorTable}
      rulesButton={headerControls}
      stageFit="arena"
      actions={
        primary ? (
          <ActionDock
            primary={primary}
            secondary={secondary}
            busy={busy}
            waitingReason={waitingReason ?? undefined}
          />
        ) : undefined
      }
      drawer={rulesOpen && (
        <GameDrawer kind="rules" title="本局规则" triggerRef={rulesRef} onClose={() => setRulesOpen(false)}>
          <h4>奶酪大盗规则速览</h4>
          <p>1. <strong>掷骰定醒来时刻</strong>：每位玩家掷 6 面骰扣在骰盅内，决定夜间第几时刻醒来。</p>
          <p>2. <strong>夜间时刻推进</strong>：夜间 1→6 时刻依次推进，轮到自己点数时睁眼。独醒且奶酪在场者取走奶酪成为怪盗！</p>
          <p>3. <strong>独醒偷看</strong>：轮到自己时刻若独醒，可按住任意一位玩家的 3D 骰盅查验其骰子；若多人同醒则互相目击、无法偷看。</p>
          <p>4. <strong>共犯与胜利</strong>：大盗秘密挑选共犯。白天讨论投票，投中大盗则好人胜，否则大盗与共犯胜。</p>
        </GameDrawer>
      )}
    >
      <p
        className={`sr-only cheese-phase-feedback cheese-phase-feedback--${presentationState}`}
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {phaseAnnouncement}{waitingReason ? `。${waitingReason}` : ''}
      </p>
      {error && (
        <p
          className="game-error cheese-feedback cheese-feedback--error"
          role="alert"
          onClick={clearError}
          title="点击关闭提示"
        >
          <span>{error}</span>
          <button
            type="button"
            className="game-error-close-btn"
            onClick={(e) => {
              e.stopPropagation();
              clearError();
            }}
            aria-label="关闭错误提示"
          >
            ✕
          </button>
        </p>
      )}

      {/* 🖥️ 桌面端呈现 */}
      {isSimulatorTable ? (
        <CheeseTabletopArena
          view={view}
          myId={myId}
          members={members}
          ttsEnabled={ttsEnabled}
          onToggleTts={toggleTts}
          onSkipDiscussion={() => {
            void act({ type: 'skip_discussion', playerId: myId ?? undefined });
          }}
          onStealCheese={() => {
            // 真实偷取动作：服务端校验"当前时刻恰有独醒大盗"才受理（桌面匿名点击按时刻归属）；
            // 受理后 cheeseStolen 保持到天亮，不会在下一时刻回退。
            if (myId) void act({ type: 'steal_cheese', playerId: myId });
          }}
        />
      ) : (
        /* 📱 玩家端呈现 */
        <div
          className={`sg-stage cheese-player-stage cheese-phase--${view.phase} is-${presentationState}`}
          data-cheese-phase={view.phase}
          data-cheese-state={presentationState}
          aria-busy={busy}
        >
          {/* 4 人局两骰自选时刻面板 */}
          {view.phase === 'hour_choice' && me?.hourChoices && (
            <ArenaBoard
              className="cheese-focal cheese-hour-choice-panel"
              tone="dark"
              headline="🎲 掷出两枚骰子，自选醒来时刻"
              hint={
                me.wakeHour
                  ? `你已选定第 ${me.wakeHour} 时刻醒来，等待其他玩家…`
                  : '请从你掷出的两枚骰子中选择一个作为你夜间醒来的时刻'
              }
              footer={
                view.deadlineAt ? (
                  <span className="cheese-countdown-pill cheese-countdown-pill--opening" aria-label="时刻选择倒计时">
                    <span className="cheese-countdown-pill__label">选择倒计时</span>
                    <strong className="cheese-countdown-pill__time">{timeFormatted}</strong>
                  </span>
                ) : undefined
              }
            >
              <div className="cheese-hour-choice-dice-row">
                {me.hourChoices.map((h, idx) => {
                  const isSelected = me.wakeHour === h;
                  return (
                    <button
                      key={`${h}-${idx}`}
                      type="button"
                      className={`cheese-hour-choice-die ${isSelected ? 'is-selected' : ''}`}
                      onClick={() => {
                        if (!me.wakeHour && myId) {
                          void act({ type: 'choose_hour', playerId: myId, hour: h });
                        }
                      }}
                      disabled={busy || !!me.wakeHour}
                      title={`选定第 ${h} 时刻醒来`}
                    >
                      <span className="choice-die-num">{h}</span>
                      <span className="choice-die-label">{h} 点醒来</span>
                      {isSelected && <span className="choice-die-badge">已选</span>}
                    </button>
                  );
                })}
              </div>
            </ArenaBoard>
          )}

          {/* 夜间推进时刻轴置顶展示 */}
          {view.phase === 'night' && (
            <ArenaBoard
              className="cheese-focal cheese-night"
              tone="dark"
              headline={
                view.currentHour >= 1 && view.currentHour <= 6
                  ? `夜深了……第 ${view.currentHour} 时刻`
                  : '夜幕降临 · 开局准备'
              }
              hint={
                view.currentHour === 0
                  ? '请在倒计时结束前查看你的身份卡与 3D 骰盅'
                  : me?.wakeHour === view.currentHour
                    ? '轮到你的时刻，请睁眼！'
                    : '闭眼装睡，轮到你的时刻才睁眼'
              }
              footer={
                !isOpening && !countdownMoving && view.deadlineAt ? (
                  <span className="cheese-countdown-pill cheese-countdown-pill--night" aria-label="时刻倒计时">
                    <span className="cheese-countdown-pill__label">时刻倒计时</span>
                    <strong className="cheese-countdown-pill__time">{timeFormatted}</strong>
                  </span>
                ) : undefined
              }
            >
              <div className="cheese-moon" aria-hidden="true"><span className="cheese-moon__glow" /></div>
              <ArenaRail
                label="第六时刻推进"
                className="cheese-hours-rail"
                items={[1, 2, 3, 4, 5, 6].map((hour) => ({
                  key: String(hour),
                  label: `${hour} 时`,
                  state:
                    view.currentHour === hour
                      ? 'active'
                      : view.currentHour > hour && view.currentHour <= 6
                        ? 'done'
                        : 'idle',
                }))}
              />
            </ArenaBoard>
          )}

          {me && (
            <section
              className={`cheese-secret-card ${identityCardVisible ? 'cheese-secret-card--has-identity' : 'cheese-secret-card--dice-only'}`}
              aria-label="我的私密身份与3D骰盅"
            >
              <div className="cheese-secret-card__body">
                {/* 3D 拟真骰盅与骰子 */}
                <div className="cheese-dice-cup-container">
                  <CheeseDiceCup3D
                    diceValue={me.wakeHour}
                    isMe={true}
                    canInteract={true}
                    variant="compact"
                    hint="按住掀开"
                    allowShake={false}
                  />
                </div>

                {/* 3D 秘密身份卡牌：开局看身份定时展示，到期淡出缩放彻底消失 */}
                {identityCardVisible && (
                  <div className={`cheese-identity-card-container ${identityCardExiting ? 'cheese-identity-card--exiting' : ''}`}>
                    <IdentityFlipCard
                      theme="classic"
                      variant="compact"
                      roleName={me.isThief ? '贪吃鼠（怪盗）' : me.isAccomplice ? '共犯老鼠' : '贪睡鼠（村民）'}
                      roleSubtitle={me.roleCard !== 'none' ? `身份卡：${ROLE_LABELS[me.roleCard]}` : me.isThief ? '夜间偷吃奶酪' : me.isAccomplice ? '协助大盗掩护' : '找出偷吃大盗'}
                      roleCamp={me.isThief || me.isAccomplice ? 'evil' : 'good'}
                      secretHints={[
                        me.isThief
                          ? (me.knownAccomplices.length > 0
                              ? `你在自己的时刻偷吃奶酪！你的共犯是：${me.knownAccomplices.map((id) => nameFor(members, id)).join('、')}，天亮后隐藏身份相互掩护！`
                              : '你在自己的时刻醒来并偷吃奶酪，天亮后隐藏身份！')
                          : me.isAccomplice
                            ? (me.knownAccomplices.length > 0
                                ? `你被怪盗选为共犯！怪盗是【${nameFor(members, me.knownAccomplices[0])}】${me.knownAccomplices.length > 1 ? `，另一位共犯是【${me.knownAccomplices.slice(1).map((id) => nameFor(members, id)).join('、')}】` : ''}，协助怪盗掩盖偷吃痕迹！`
                                : '你被怪盗选为共犯，协助怪盗掩盖偷吃痕迹！')
                            : '你在自己的时刻醒来观察周围动静，天亮后找出怪盗！',
                      ]}
                      canInteract={true}
                    />
                  </div>
                )}
              </div>

              {/* 专属情报条目 */}
              {(me.catPeekedHour || me.peekedHour || me.knownAccomplices.length > 0) && (
                <div className="cheese-secret-intel-row">
                  {me.isThief && me.knownAccomplices.length > 0 && (
                    <div className="cheese-intel-chip">
                      <span className="intel-icon" aria-hidden="true">🐭</span>
                      <span>你的共犯：<strong>{me.knownAccomplices.map((id) => nameFor(members, id)).join('、')}</strong>（天亮请协助掩护）</span>
                    </div>
                  )}
                  {me.isAccomplice && me.knownAccomplices.length > 0 && (
                    <div className="cheese-intel-chip">
                      <span className="intel-icon" aria-hidden="true">🧀</span>
                      <span>
                        怪盗是：<strong>{nameFor(members, me.knownAccomplices[0])}</strong>
                        {me.knownAccomplices.length > 1 && (
                          <>，另一位共犯是：<strong>{me.knownAccomplices.slice(1).map((id) => nameFor(members, id)).join('、')}</strong></>
                        )}
                      </span>
                    </div>
                  )}
                  {me.catPeekedHour && (
                    <div className="cheese-intel-chip">
                      <span className="intel-icon" aria-hidden="true">🐱</span>
                      <span>猫咪情报：<strong>{nameFor(members, me.catPeekedHour.target)}</strong> 是第 <strong>{me.catPeekedHour.hour}</strong> 时刻</span>
                    </div>
                  )}
                  {me.peekedHour && (
                    <div className="cheese-intel-chip">
                      <span className="intel-icon" aria-hidden="true">🔍</span>
                      <span>独醒偷看：<strong>{nameFor(members, me.peekedHour.target)}</strong> 是第 <strong>{me.peekedHour.hour}</strong> 时刻</span>
                    </div>
                  )}
                </div>
              )}
            </section>
          )}

          {/* 开局准备阶段置底通栏倒计时与平滑位移动效 */}
          {(isOpening || countdownMoving) && view.deadlineAt && (
            <div
              className={`cheese-opening-countdown-bar ${countdownMoving ? 'is-moving-to-top' : ''}`}
              role="status"
              aria-live="polite"
            >
              <div className="cheese-opening-countdown-inner">
                <div className="cheese-opening-countdown-left">
                  <span className="cheese-opening-icon" aria-hidden="true">⏳</span>
                  <span className="cheese-opening-title">
                    {view.phase === 'hour_choice' ? '选择醒来时刻' : '开局准备'}
                  </span>
                </div>
                <span className="cheese-countdown-pill cheese-countdown-pill--opening" aria-label="开局倒计时">
                  <span className="cheese-countdown-pill__label">倒计时</span>
                  <strong className="cheese-countdown-pill__time">{timeFormatted}</strong>
                </span>
              </div>
            </div>
          )}

          {/* 独醒且奶酪在场：手机端偷取行动面板 */}
          {view.phase === 'night' && me && me.wakeHour === view.currentHour && !view.cheeseStolen && (me.coWakers ?? []).length === 0 && (
            <ArenaBoard
              className="cheese-focal cheese-steal-panel"
              tone="accent"
              headline="🧀 轮到你的时刻且独醒！"
              hint="你是此刻唯一睁眼的老鼠，桌上的大奶酪就在你眼前——偷走它，你将成为本局怪盗"
              footer={(
                <button
                  type="button"
                  className="cheese-player-steal-btn"
                  onClick={() => {
                    if (myId) void act({ type: 'steal_cheese', playerId: myId });
                  }}
                  disabled={busy}
                >
                  <span className="cheese-icon-bounce">🧀</span>
                  <span className="cheese-steal-btn-text">
                    <strong>伸手偷走奶酪</strong>
                    <small>点击取走奶酪成为怪盗</small>
                  </span>
                </button>
              )}
            />
          )}

          {/* 独醒查验：3D 骰盅点击/长按查验他人 */}
          {view.phase === 'night' && me?.canPeek && (
            <ArenaBoard
              className="cheese-focal"
              tone="dark"
              headline="轮到你且独醒！按住目标玩家的骰盅掀开查验"
              hint="松手后自动扣盖并提交，或在下方直接跳过"
            >
              <div className="cheese-peek-grid">
                {view.players.filter((id) => id !== myId).map((id) => (
                  <div key={id} className={`cheese-peek-item ${peekTarget === id ? 'is-selected' : ''}`}>
                    <CheeseDiceCup3D
                      diceValue={me.peekedHour?.target === id ? me.peekedHour.hour : null}
                      playerName={nameFor(members, id)}
                      peekTargetName={nameFor(members, id)}
                      isMe={false}
                      canInteract={true}
                      variant="compact"
                      allowShake={false}
                      onInspectCommit={() => {
                        setPeekTarget(id);
                        void act({ type: 'peek_die', playerId: myId!, targetPlayerId: id });
                      }}
                    />
                  </div>
                ))}
              </div>
            </ArenaBoard>
          )}

          {/* 共犯挑选 */}
          {view.phase === 'accomplice_select' && me?.isThief && myTurnAccomplice && (
            <ArenaBoard
              className="cheese-focal"
              tone="accent"
              headline="你是大盗！选择你的共犯"
              hint={`需选 ${accompliceCount} 名，选中后可再次点击取消`}
            >
              <SeatTargetPicker
                label="选择共犯"
                max={accompliceCount}
                selectedIds={accomplicePicks}
                onSelect={(ids) => setAccomplicePicks(ids)}
                options={view.players
                  .filter((id) => id !== myId)
                  .map((id) => ({ id, name: nameFor(members, id) }))}
              />
            </ArenaBoard>
          )}

          {/* 天亮讨论：顶部浮层遮罩 + 卷轴式收起到底部 */}
          {view.phase === 'dawn' && (
            <>
              <div
                className={`cheese-dawn-backdrop ${discussionCollapsed ? 'is-collapsed' : 'is-expanded'}`}
                onClick={() => setDiscussionCollapsed(true)}
                aria-hidden="true"
              />
              <section
                className={`cheese-dawn-overlay ${discussionCollapsed ? 'is-collapsed' : 'is-expanded'}`}
                data-tone="paper"
                aria-label={`天亮了！线下自由讨论 桌上的奶酪不见了！抓紧盘问各个时刻的动静；讨论结束或点下方按钮进入投票 倒计时 ${timeFormatted}`}
              >
                <div className="cheese-dawn-scroll-card">
                  <div className="cheese-scroll-rod cheese-scroll-rod--top" aria-hidden="true" />
                  <div className="cheese-dawn-header">
                    <div className="cheese-dawn-title-group">
                      <span className="cheese-dawn-icon" aria-hidden="true">☀️</span>
                      <div>
                        <h3 className="cheese-dawn-title">天亮了！线下自由讨论</h3>
                        <p className="cheese-dawn-hint">
                          桌上的奶酪不见了！抓紧盘问各个时刻的动静；讨论结束或点下方按钮进入投票
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="cheese-dawn-collapse-btn"
                      onClick={() => setDiscussionCollapsed(true)}
                      aria-label="关闭收起讨论面板到屏幕底部"
                      title="关闭/收起讨论面板到屏幕底部"
                    >
                      <span className="cheese-dawn-btn-label">关闭 · 收起</span>
                      <span className="collapse-arrow" aria-hidden="true">▾</span>
                    </button>
                  </div>

                  <div className="cheese-dawn-body">
                    {view.deadlineAt && (
                      <span className="cheese-countdown-pill" aria-label="讨论倒计时">
                        <span className="cheese-countdown-pill__label">倒计时</span>
                        <strong className="cheese-countdown-pill__time">{timeFormatted}</strong>
                      </span>
                    )}
                    {(view.revealedCat || view.revealedDog) && (
                      <div className="sg-chip-row">
                        {view.revealedCat && (
                          <span className="sg-chip sg-chip--peek">
                            🐱 {nameFor(members, view.revealedCat)} 是猫
                          </span>
                        )}
                        {view.revealedDog && (
                          <span className="sg-chip sg-chip--peek">
                            🐶 {nameFor(members, view.revealedDog)} 是狗 · 指定 {nameFor(members, view.dogFirstVoter ?? '')} 先投票
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="cheese-dawn-footer">
                    <button
                      type="button"
                      className="cheese-skip-discussion-btn"
                      onClick={() => void act({ type: 'skip_discussion', playerId: myId ?? undefined })}
                      disabled={busy}
                      title="提前结束讨论，全员弹出投票窗口"
                    >
                      <span className="btn-icon" aria-hidden="true">🗳️</span>
                      <span className="btn-main-text">提前进入投票环节</span>
                    </button>
                  </div>
                  <div className="cheese-scroll-rod cheese-scroll-rod--bottom" aria-hidden="true" />
                </div>
              </section>

              {/* 收起到底部后的卷轴式通栏 */}
              <div
                className={`cheese-dawn-bottom-bar ${discussionCollapsed ? 'is-visible' : 'is-hidden'}`}
                onClick={() => setDiscussionCollapsed(false)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setDiscussionCollapsed(false);
                  }
                }}
                aria-label="点击展开天亮讨论面板"
              >
                <div className="cheese-dawn-bottom-bar__left">
                  <span className="cheese-dawn-bottom-bar__icon" aria-hidden="true">📜</span>
                  <span className="cheese-dawn-bottom-bar__status">线下自由讨论中</span>
                  {view.deadlineAt && (
                    <span className="cheese-countdown-pill cheese-countdown-pill--mini" aria-label="讨论倒计时">
                      <strong className="cheese-countdown-pill__time">{timeFormatted}</strong>
                    </span>
                  )}
                </div>
                <div className="cheese-dawn-bottom-bar__right">
                  <button
                    type="button"
                    className="cheese-dawn-expand-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDiscussionCollapsed(false);
                    }}
                    aria-label="展开讨论面板"
                  >
                    <span>展开面板</span>
                    <span className="expand-arrow" aria-hidden="true">▴</span>
                  </button>
                </div>
              </div>
            </>
          )}

          {/* 投票指认 */}
          {view.phase === 'vote' && myId && (
            <ArenaBoard
              className="cheese-focal"
              tone="paper"
              headline={me?.hasVoted ? '✓ 你的投票已完成' : '指认你怀疑的大盗'}
              hint={me?.hasVoted ? '正在等待其他玩家完成投票…' : '点选你要指认的玩家；提交后不可更改'}
              footer={view.deadlineAt ? (
                <span className="cheese-countdown-pill" aria-label="投票倒计时">
                  <span className="cheese-countdown-pill__label">倒计时</span>
                  <strong className="cheese-countdown-pill__time">{timeFormatted}</strong>
                </span>
              ) : undefined}
            >
              {voteModalDismissed && (
                <div className="cheese-vote-reopen-banner">
                  <span>🗳️ 投票进行中（已投 {totalVoted}/{view.players.length} 人）</span>
                  <button
                    type="button"
                    className="cheese-reopen-vote-btn"
                    onClick={() => setVoteModalDismissed(false)}
                  >
                    {me?.hasVoted ? '查看投票状态' : '打开投票弹窗'}
                  </button>
                </div>
              )}

              {me?.hasVoted ? (
                <p className="cheese-vote-done-note">
                  ✓ {(() => {
                    const myVote = view.votes?.[myId];
                    if (myVote?.kind === 'accuse') return `你已指认【${nameFor(members, myVote.targetPlayerId)}】`;
                    if (myVote?.kind === 'abstain') return '你已选择【弃票】';
                    return voteTarget ? `你已指认【${nameFor(members, voteTarget)}】` : '你已完成投票';
                  })()}，正在等待其他玩家完成投票…
                </p>
              ) : null}

              <SeatTargetPicker
                label="指认奶酪大盗"
                selectedIds={voteTarget ? [voteTarget] : []}
                onSelect={(ids) => setVoteTarget(ids[0] ?? null)}
                disabled={me?.hasVoted === true}
                options={view.players
                  .filter((id) => id !== myId)
                  .map((id) => ({ id, name: nameFor(members, id) }))}
              />
            </ArenaBoard>
          )}

          {/* 终局真相大揭秘全屏遮罩 */}
          {view.phase === 'game_over' && (
            <CheeseGameOverReveal view={view} members={members} myId={myId} />
          )}
        </div>
      )}

      {/* 📱 手机端专属弹出式投票窗口 */}
      {view.phase === 'vote' && myId && !isSimulatorTable && !voteModalDismissed && (
        <div
          className="cheese-mobile-vote-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="指认奶酪大盗投票窗口"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setVoteModalDismissed(true);
            }
          }}
        >
          <div className="cheese-mobile-vote-modal" onClick={(e) => e.stopPropagation()}>
            <div className="cheese-modal-header">
              <div className="cheese-modal-title-box">
                <h3>🗳️ 指认奶酪大盗</h3>
                {view.deadlineAt && (
                  <span className="cheese-modal-timer">倒计时：{timeFormatted}</span>
                )}
              </div>
              <button
                type="button"
                className="cheese-modal-close-btn"
                onClick={() => setVoteModalDismissed(true)}
                aria-label="收起窗口"
                title="暂时收起窗口"
              >
                ✕
              </button>
            </div>

            <div className="cheese-modal-body">
              {me?.hasVoted ? (
                <div className="cheese-vote-submitted-pane">
                  <div className="cheese-submitted-icon">✓</div>
                  <h3>投票已成功提交！</h3>
                  <p className="cheese-voted-target-desc">
                    {(() => {
                      const myVote = view.votes?.[myId];
                      if (myVote?.kind === 'accuse') {
                        return `你已指认【${nameFor(members, myVote.targetPlayerId)}】为奶酪大盗`;
                      } else if (myVote?.kind === 'abstain') {
                        return '你已选择【弃票】';
                      } else if (voteTarget) {
                        return `你已指认【${nameFor(members, voteTarget)}】为奶酪大盗`;
                      }
                      return '你的投票已记录完成';
                    })()}
                  </p>
                  <div className="cheese-vote-modal-progress">
                    <span>全场已投票：{totalVoted} / {view.players.length} 人</span>
                    <p className="cheese-vote-modal-sub">
                      等待其他玩家完成投票，倒计时结束后将揭晓全场票数与大盗身份…
                    </p>
                  </div>
                  <button
                    type="button"
                    className="cheese-vote-btn--done"
                    onClick={() => setVoteModalDismissed(true)}
                  >
                    收起窗口查看桌面
                  </button>
                </div>
              ) : voteConfirmCandidate !== null ? (
                <div className="cheese-vote-confirm-pane">
                  {voteConfirmCandidate === 'abstain' ? (
                    <>
                      <h4>确认放弃本次投票？</h4>
                      <p className="cheese-confirm-warning">弃票后，本局将不计入你对任何人的指认。</p>
                      <div className="cheese-vote-confirm-actions">
                        <button
                          type="button"
                          className="cheese-confirm-btn is-danger"
                          disabled={busy}
                          onClick={() => {
                            void act({ type: 'cast_abstention', playerId: myId });
                          }}
                        >
                          确认弃票
                        </button>
                        <button
                          type="button"
                          className="cheese-cancel-btn"
                          onClick={() => setVoteConfirmCandidate(null)}
                        >
                          返回重选
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <h4>确认指认该玩家？</h4>
                      <div className="cheese-confirm-target-box">
                        <span className="cheese-confirm-target-avatar">🧀</span>
                        <strong className="cheese-confirm-target-name">
                          {nameFor(members, voteConfirmCandidate)}
                        </strong>
                      </div>
                      <p className="cheese-confirm-warning">
                        提交后不可更改，桌面端将同步公开投票结果。
                      </p>
                      <div className="cheese-vote-confirm-actions">
                        <button
                          type="button"
                          className="cheese-confirm-btn is-primary"
                          disabled={busy}
                          onClick={() => {
                            setVoteTarget(voteConfirmCandidate);
                            void act({
                              type: 'cast_vote',
                              playerId: myId,
                              targetPlayerId: voteConfirmCandidate,
                            });
                          }}
                        >
                          确认指认【{nameFor(members, voteConfirmCandidate)}】
                        </button>
                        <button
                          type="button"
                          className="cheese-cancel-btn"
                          onClick={() => setVoteConfirmCandidate(null)}
                        >
                          返回重选其他玩家
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <>
                  <p className="cheese-vote-instruction">谁偷吃了奶酪？请点击指认怀疑的目标玩家：</p>
                  <div className="cheese-candidate-stack">
                    {view.players
                      .filter((id) => id !== myId)
                      .map((id) => (
                        <button
                          key={id}
                          type="button"
                          className="cheese-vote-candidate-card"
                          onClick={() => setVoteConfirmCandidate(id)}
                        >
                          <span className="candidate-avatar">👤</span>
                          <strong className="candidate-name">{nameFor(members, id)}</strong>
                          <span className="candidate-action">指认TA →</span>
                        </button>
                      ))}
                  </div>
                  <button
                    type="button"
                    className="cheese-vote-abstain-btn"
                    onClick={() => setVoteConfirmCandidate('abstain')}
                  >
                    弃权 / 弃票（不指认任何人）
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </TabletopShell>
  );
}

