/**
 * cheese_thief_classic_v1 客户端主页面（线下辅助与模拟模式双模体系）。
 * 支持「📱 玩家手牌端（3D 骰盅防偷窥）」与「🖥️ 桌面中央端（案发大屏与 TTS 法官）」
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
import { IdentityFlipCard } from '../../shared-ui/IdentityFlipCard.tsx';
import { useCheeseTTS } from './useCheeseTTS.ts';
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

  // 专属 TTS/录音法官主持 Hook
  const { ttsEnabled, toggleTts } = useCheeseTTS({
    phase: view.phase,
    currentHour: view.currentHour,
    mode: view.mode,
    isTable: isSimulatorTable || !isSimulator,
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

  if (myTurnAccomplice && myId) {
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
    : view.phase === 'night'
      ? me?.wakeHour === view.currentHour
        ? me.canPeek
          ? '轮到你的时刻且独醒：按住目标玩家骰盅偷看其点数，或直接跳过'
          : (me.coWakers ?? []).length > 0
            ? '轮到你的时刻：有其他人同时醒来，互相目击'
            : '轮到你的时刻推进中'
        : '夜间进行中——闭眼装睡，轮到你的时刻才睁眼'
      : view.phase === 'accomplice_select'
        ? '大盗正在秘密挑选共犯（限时 15 秒）…'
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
          <span className="cheese-btn-icon">📱</span>
          <span className="cheese-btn-text">玩家端</span>
        </button>
        <button
          type="button"
          className={`cheese-role-pill ${deviceRole === 'table' ? 'is-active' : ''}`}
          onClick={() => selectDeviceRole('table')}
          aria-pressed={deviceRole === 'table'}
          title="作为桌面中央公共案发大屏使用（平放于桌面正中）"
        >
          <span className="cheese-btn-icon">🖥️</span>
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
        <span>{ttsEnabled ? '🔊 语音' : '🔇 静音'}</span>
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
          <h4>🧀 奶酪大盗规则速览</h4>
          <p>1. <strong>掷骰定醒来时刻</strong>：每位玩家掷 6 面骰扣在骰盅内，决定夜间第几时刻醒来。</p>
          <p>2. <strong>夜间时刻推进</strong>：夜间 1→6 时刻依次推进，轮到自己点数时睁眼。独醒且奶酪在场者取走奶酪成为怪盗！</p>
          <p>3. <strong>独醒偷看</strong>：轮到自己时刻若独醒，可按住任意一位玩家的 3D 骰盅查验其骰子；若多人同醒则互相目击、无法偷看。</p>
          <p>4. <strong>共犯与胜利</strong>：大盗秘密挑选共犯。白天讨论投票，投中大盗则好人胜，否则大盗与共犯胜。</p>
        </GameDrawer>
      )}
    >
      <p
        className={`cheese-phase-feedback cheese-phase-feedback--${presentationState}`}
        role="status"
        aria-live="polite"
        aria-atomic="true"
        style={{
          position: 'absolute',
          width: '1px',
          height: '1px',
          padding: 0,
          margin: '-1px',
          overflow: 'hidden',
          clip: 'rect(0, 0, 0, 0)',
          whiteSpace: 'nowrap',
          border: 0,
        }}
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
          {/* 夜间推进时刻轴置顶展示 */}
          {view.phase === 'night' && (
            <section className="cheese-night" aria-label="夜间时间轴">
              <div className="cheese-moon" aria-hidden="true"><span className="cheese-moon__glow" /></div>
              <div className="cheese-night__copy">
                <strong>{view.currentHour >= 1 && view.currentHour <= 6 ? `夜深了……第 ${view.currentHour} 时刻` : '夜幕降临'}</strong>
                <span>{me?.wakeHour === view.currentHour ? '【轮到你的时刻，请睁眼！】' : '闭眼装睡，轮到你的时刻才睁眼。'}</span>
              </div>
              <ol className="cheese-hours" aria-label="第六时刻推进">
                {[1, 2, 3, 4, 5, 6].map((hour) => (
                  <li
                    key={hour}
                    className={`cheese-hours__dot ${view.currentHour === hour ? 'is-current' : ''} ${view.currentHour > hour && view.currentHour <= 6 ? 'is-done' : ''}`}
                  >
                    {hour}
                  </li>
                ))}
              </ol>
            </section>
          )}

          {me && (
            <section className="cheese-secret-card" aria-label="我的私密身份与3D骰盅">
              <div className="cheese-secret-card__header">
                <div className="cheese-secret-card__title-group">
                  <span className="cheese-secret-card__icon" aria-hidden="true">🧀</span>
                  <h3>我的私密身份与 3D 骰盅</h3>
                </div>
                <span className="cheese-secret-card__privacy-tag">🔒 按住掀起 · 松手扣盖防窥</span>
              </div>

              <div className="cheese-secret-card__body">
                {/* 3D 拟真骰盅与骰子（左列） */}
                <div className="cheese-dice-cup-container">
                  <CheeseDiceCup3D
                    diceValue={me.wakeHour}
                    playerName="我（本局骰点）"
                    isMe={true}
                    canInteract={true}
                    hint="按住骰盅掀开查看"
                  />
                </div>

                {/* 3D 秘密身份卡牌（右列） */}
                <div className="cheese-identity-card-container">
                  <IdentityFlipCard
                    theme="classic"
                    variant="compact"
                    roleName={me.isThief ? '贪吃鼠（怪盗）' : me.isAccomplice ? '共犯老鼠' : '贪睡鼠（村民）'}
                    roleSubtitle={me.roleCard !== 'none' ? `身份卡：${ROLE_LABELS[me.roleCard]}` : me.isThief ? '夜间偷吃奶酪' : '找出偷吃大盗'}
                    roleCamp={me.isThief || me.isAccomplice ? 'evil' : 'good'}
                    secretHints={[
                      me.isThief
                        ? '你在自己的时刻醒来并偷吃奶酪，天亮后隐藏身份！'
                        : me.isAccomplice
                          ? '你被怪盗选为共犯，协助怪盗掩盖偷吃痕迹！'
                          : '你在自己的时刻醒来观察周围动静，天亮后找出怪盗！',
                    ]}
                    canInteract={true}
                  />
                </div>
              </div>

              {/* 专属情报条目 */}
              {(me.catPeekedHour || me.peekedHour) && (
                <div className="cheese-secret-intel-row">
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

          {/* 独醒查验：3D 骰盅点击/长按查验他人 */}
          {view.phase === 'night' && me?.canPeek && (
            <section className="sg-panel" aria-label="查看对象选择">
              <div className="sg-panel__head">
                <h3>🔍 轮到你且独醒！按住目标玩家骰盅掀开查验</h3>
                <span>松手后自动扣盖并提交，或在下方直接跳过</span>
              </div>
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
                      onInspectCommit={() => {
                        setPeekTarget(id);
                        void act({ type: 'peek_die', playerId: myId!, targetPlayerId: id });
                      }}
                    />
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* 共犯挑选 */}
          {view.phase === 'accomplice_select' && me?.isThief && myTurnAccomplice && (
            <section className="sg-panel" aria-label="共犯选择">
              <div className="sg-panel__head">
                <h3>你是大盗！选择你的共犯</h3>
                <span>需选 {accompliceCount} 名</span>
              </div>
              <div className="sg-chip-row">
                {view.players.filter((id) => id !== myId).map((id) => {
                  const selected = accomplicePicks.includes(id);
                  return (
                    <button
                      key={id}
                      type="button"
                      className={`sg-chip sg-chip--btn ${selected ? 'sg-chip--m' : ''}`}
                      disabled={!selected && accomplicePicks.length >= accompliceCount}
                      onClick={() => {
                        setAccomplicePicks((prev) =>
                          prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
                        );
                      }}
                      aria-pressed={selected}
                    >
                      {selected ? '✓ ' : ''}{nameFor(members, id)}
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {/* 天亮讨论 */}
          {view.phase === 'dawn' && (
            <section className="sg-panel cheese-dawn" aria-label="天亮讨论">
              <div className="sg-panel__head">
                <h3>天亮了！线下自由讨论</h3>
                <span>讨论计时结束后自动进入投票</span>
              </div>
              <p className="sg-hint">桌上的奶酪不见了！谁偷走了奶酪？可以撒谎，抓紧问足问题。</p>
              {(view.revealedCat || view.revealedDog) && (
                <div className="sg-chip-row">
                  {view.revealedCat && <span className="sg-chip sg-chip--peek">🐱 {nameFor(members, view.revealedCat)} 是猫</span>}
                  {view.revealedDog && <span className="sg-chip sg-chip--peek">🐶 {nameFor(members, view.revealedDog)} 是狗 · 指定 {nameFor(members, view.dogFirstVoter ?? '')} 先投票</span>}
                </div>
              )}
            </section>
          )}

          {/* 投票指认 */}
          {view.phase === 'vote' && myId && (
            <section className="sg-panel" aria-label="投票指认">
              <div className="sg-panel__head">
                <h3>{me?.hasVoted ? '✓ 你的投票已完成' : '指认你怀疑的大盗'}</h3>
                <span>{me?.hasVoted ? '已提交，等待开票' : '点选后在下方栏确认（或弃票）'}</span>
              </div>
              {me?.hasVoted ? (
                <p className="sg-hint" style={{ color: 'var(--brand-accent, #10b981)', fontWeight: 800 }}>
                  ✓ {voteTarget ? `你已指认 ${nameFor(members, voteTarget)}` : '你已选择弃票'}，正在等待其他玩家完成投票…
                </p>
              ) : null}
              <div className="sg-chip-row">
                {view.players.filter((id) => id !== myId).map((id) => (
                  <button
                    key={id}
                    type="button"
                    disabled={me?.hasVoted === true}
                    className={`sg-chip sg-chip--btn ${voteTarget === id ? 'sg-chip--selected' : ''}`}
                    style={{ opacity: me?.hasVoted && voteTarget !== id ? 0.45 : 1, cursor: me?.hasVoted ? 'not-allowed' : 'pointer' }}
                    onClick={() => !me?.hasVoted && setVoteTarget(id)}
                    aria-pressed={voteTarget === id}
                  >
                    {voteTarget === id ? '✓ ' : ''}{nameFor(members, id)}
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* 终局结算 */}
          {view.phase === 'game_over' && (
            <div className="winner-hero">
              <span className="winner-rays" aria-hidden="true" />
              <h2 className="winner-title">
                {view.thiefCaught === null
                  ? '整夜无人偷走奶酪，好人们守住了！'
                  : view.thiefCaught
                    ? '大盗被抓住了！'
                    : '大盗逃之夭夭！'}
              </h2>
              <p>{(view.winners ?? []).map((id) => nameFor(members, id)).join('、')} 获胜</p>
            </div>
          )}
        </div>
      )}
    </TabletopShell>
  );
}
