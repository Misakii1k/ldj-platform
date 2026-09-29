/**
 * cheese_thief_classic_v1 客户端主页面 · 阁楼世界版。
 *
 * 视觉契约：docs/plans/2026-09-29-cheese-thief-visual/README.md
 * 像素参照：docs/ui-preview/cheese-thief/directions/（B2 / S2 / S3 / S4，用户已确认 2026-09-26）
 *
 * 玩家端 = 月光阁楼四画面（本文件组装 AtticRoom / AtticSeats / AtticCenter）；
 * 公共大屏（观战席位）= CheeseTabletopArena（T6 复用同一套阁楼场景）。
 */
import { useEffect, useRef, useState } from 'react';
import { useConnection } from '../../connection/useConnection.ts';
import { nameFor, useGameAction } from '../useGameAction.ts';
import { GameDrawer } from '../tabletop/GameDrawer.tsx';
import { TabletopShell } from '../tabletop/TabletopShell.tsx';
import { CheeseTabletopArena } from './CheeseTabletopArena.tsx';
import { FlightLayer } from '../../shared-ui/stage/FlightLayer.tsx';
import { useCheeseThiefStage } from './stage/useCheeseThiefStage.tsx';
import { CheeseGameOverReveal } from './CheeseGameOverReveal.tsx';
import { useCheeseTTS } from './useCheeseTTS.ts';
import { useCountdown } from '../../shared-ui/useCountdown.ts';
import { TabletopCountdownText } from '../../shared-ui/TabletopCountdownText.tsx';
import { TabletopVictoryBurst } from '../../shared-ui/TabletopVictoryBurst.tsx';
import { ScreenIcon } from './stage/CheeseIcons.tsx';
import { AtticRoom } from './stage/AtticRoom.tsx';
import { AtticSeats, type AtticSeatModel } from './stage/AtticSeats.tsx';
import { AtticCenter } from './stage/AtticCenter.tsx';
import {
  atticTimeFor,
  awakeSeatIds,
  cheeseSightFor,
  nightNotice,
  seatToneIndex,
  votedSeatIds,
} from './stage/atticModel.ts';
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

interface DockButton {
  readonly id: string;
  readonly label: string;
  readonly primary?: boolean;
  readonly disabled?: boolean;
  readonly onAction: () => void;
}

export function CheeseThiefGamePage({ view }: Props) {
  const { state, me: connMe } = useConnection();
  const members = state.room?.members ?? [];
  const { act, busy, error, clearError } = useGameAction();
  const me = view.me;
  const myId = me?.playerId ?? null;
  const nameOf = (id: string) => nameFor(members, id);

  // 终局揭晓按 roundToken 去重：演到一半刷新不会重演一次。
  const stage = useCheeseThiefStage(view);
  const myMember = state.room?.members.find((m) => m.playerId === (connMe?.playerId ?? me?.playerId ?? myId));
  const isSpectator = view.me === null || myMember?.seatRole === 'spectator' || state.game?.role === 'spectator';
  const rulesRef = useRef<HTMLButtonElement | null>(null);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [peekTarget, setPeekTarget] = useState<string | null>(null);
  const [voteTarget, setVoteTarget] = useState<string | null>(null);
  const [accomplicePicks, setAccomplicePicks] = useState<string[]>([]);
  const [peekArmed, setPeekArmed] = useState(false);

  const countdown = useCountdown(view.deadlineAt);

  // 阶段或时刻变更时，自动清理陈旧错误提示与本地选择
  useEffect(() => {
    clearError();
    setPeekArmed(false);
    setPeekTarget(null);
  }, [view.phase, view.currentHour, clearError]);
  useEffect(() => {
    setVoteTarget(null);
    setAccomplicePicks([]);
  }, [view.phase]);

  // 席位驱动设备角色：spectator / 无 me 个人视图 → 公共大屏；否则玩家端。
  const isSimulator = view.mode === 'simulator';
  const isTableScreen = isSpectator;
  const isSimulatorTable = isTableScreen;

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

  const players = view.players.map((playerId) => ({
    id: playerId,
    name: nameOf(playerId),
    status: '',
    active: false,
  }));

  /* ── 席位点击：偷看 / 挑共犯 / 投票指认（按阶段互斥） ── */
  const canClickSeats = !isTableScreen && !isSpectator && myId !== null;
  const votePicking = canClickSeats && view.phase === 'vote' && !me?.hasVoted;
  const onSeatClick = canClickSeats
    ? (id: string) => {
        if (id === myId) return;
        if (view.phase === 'night' && me?.canPeek && peekArmed) {
          setPeekTarget(id);
          setPeekArmed(false);
          void act({ type: 'peek_die', playerId: myId, targetPlayerId: id });
        } else if (view.phase === 'accomplice_select' && myTurnAccomplice) {
          setAccomplicePicks((prev) => {
            if (prev.includes(id)) return prev.filter((x) => x !== id);
            if (prev.length >= accompliceCount) return prev;
            return [...prev, id];
          });
        } else if (votePicking) {
          setVoteTarget((prev) => (prev === id ? null : id));
        }
      }
    : undefined;

  /* ── 席位模型 ── */
  const time = atticTimeFor(view.phase);
  const awakeIds = awakeSeatIds(view, myId);
  const voted = votedSeatIds(view);
  const cheeseSight = cheeseSightFor(view, myId);
  const seats: AtticSeatModel[] = view.players.map((id, index) => {
    const isMe = id === myId;
    const night = time === 'night';
    return {
      id,
      seatNo: index + 1,
      name: nameOf(id),
      isMe,
      tone: seatToneIndex(view.players, id, myId),
      asleep: night && !awakeIds.has(id),
      awake: awakeIds.has(id),
      // 骰子：你自己始终知道自己的点数（未定时扣盅）；别人一律扣盅（④ 翻面才亮）
      die: isMe && me && me.wakeHour >= 1 ? me.wakeHour : null,
      cupped: isMe ? !(me && me.wakeHour >= 1) : true,
      hasLoot: isMe && cheeseSight === 'with-me',
      pickable:
        (view.phase === 'night' && Boolean(me?.canPeek) && peekArmed && !isMe) ||
        (myTurnAccomplice && !isMe),
      selected: voteTarget === id || accomplicePicks.includes(id) || peekTarget === id,
      hasVoted: (view.phase === 'vote' || view.phase === 'game_over') && voted.has(id),
      voteTag: false,
      revealedRole: null,
      votesGot: null,
      out: false,
      win: false,
      flip: '' as const,
      voteCandidate: Boolean(votePicking && !isMe),
    };
  });

  /* ── 告示牌与说明胶囊 ── */
  let when: string;
  let title: string;
  let caption: string;
  if (view.phase === 'night') {
    const notice = nightNotice(view, myId, nameOf);
    when = notice.when;
    title = notice.title;
    caption = notice.caption;
  } else if (view.phase === 'hour_choice') {
    when = '入夜前';
    title = '摇出你的醒来时刻';
    caption = '点数只有你能看到';
  } else if (view.phase === 'accomplice_select') {
    when = '夜晚 · 更深';
    title = myTurnAccomplice ? '你是大盗！' : '夜更深了……';
    caption = myTurnAccomplice ? `挑出 ${accompliceCount} 只老鼠做你的共犯` : '大盗正在悄悄物色同伙';
  } else if (view.phase === 'dawn') {
    when = '天亮了 · 讨论';
    title = view.cheeseStolen ? '奶酪不见了！' : '奶酪还在！';
    caption = view.cheeseStolen ? '砧板空了，谁拿的？' : '奶酪还在砧板上';
  } else if (view.phase === 'vote') {
    when = '天亮了 · 投票';
    title = '谁偷了奶酪？';
    caption = '秘密投票，结果揭晓时公开';
  } else {
    when = '投票结束';
    title = '揭晓……';
    caption = '';
  }

  /* ── 坞：私密信息（左）+ 按钮（右）+ 倒计时胶囊 ── */
  const dockButtons: DockButton[] = [];
  let dockStrong = '';
  let dockSpan = '';

  if (!isTableScreen && !isSpectator && me && myId) {
    if (view.phase === 'hour_choice' && me.hourChoices) {
      if (me.wakeHour >= 1) {
        dockStrong = `你会在 ${me.wakeHour} 点醒来`;
        dockSpan = '等待其他玩家选定……';
      } else {
        dockStrong = '两枚骰子，选一个作为醒来时刻';
        dockSpan = `${me.hourChoices[0]} 点 或 ${me.hourChoices[1]} 点`;
        for (const h of me.hourChoices) {
          dockButtons.push({
            id: `choose-${h}`,
            label: `选定 ${h} 点`,
            primary: h === me.hourChoices[0],
            disabled: busy,
            onAction: () => void act({ type: 'choose_hour', playerId: myId, hour: h }),
          });
        }
      }
    } else if (view.phase === 'night') {
      if (me.wakeHour === view.currentHour && view.currentHour >= 1) {
        dockStrong = me.isThief
          ? '奶酪到手，别出声'
          : me.coWakers.length > 0
            ? '你们同时醒来了'
            : view.cheeseStolen
              ? '奶酪已经不见了'
              : '只有你醒着';
        dockSpan = me.canPeek ? '可以偷看一只老鼠的骰子' : '记住你看到的，天亮再说';
        if (me.canPeek) {
          dockButtons.push({
            id: 'peek',
            label: peekArmed ? '取消偷看' : '偷看骰子',
            onAction: () => setPeekArmed((v) => !v),
          });
        }
      } else {
        dockStrong = view.currentHour < 1 ? '看好自己的骰盅' : '你在睡觉';
        dockSpan = view.currentHour < 1 ? `你在 ${me.wakeHour || '？'} 点醒来` : '轮到你的一刻会叫你';
      }
    } else if (myTurnAccomplice) {
      dockStrong = `选择 ${accompliceCount} 名共犯`;
      dockSpan = accomplicePicks.length > 0 ? `已选：${accomplicePicks.map(nameOf).join('、')}` : '点席位上的老鼠挑选';
      dockButtons.push({
        id: 'confirm-accomplice',
        label: `选定共犯（${accomplicePicks.length}/${accompliceCount}）`,
        primary: true,
        disabled: busy || accomplicePicks.length !== accompliceCount,
        onAction: () => void act({ type: 'select_accomplice', playerId: myId, accompliceIds: accomplicePicks }),
      });
    } else if (view.phase === 'dawn') {
      dockStrong = '说出你几点醒来、看到了什么';
      dockSpan = `你是 ${me.wakeHour} 点醒的。可以说真话，也可以不说。`;
      dockButtons.push({
        id: 'skip-discussion',
        label: '提前去投票',
        onAction: () => void act({ type: 'skip_discussion', playerId: myId }),
      });
    } else if (view.phase === 'vote') {
      if (me.hasVoted) {
        dockStrong = '已投票，等其他人投完';
        dockSpan = '投票是秘密的，别人看不到你投给了谁';
      } else {
        dockStrong = '点一只老鼠，指认它';
        dockSpan = '票数最多的出局；平票一起出局';
        dockButtons.push(
          {
            id: 'abstain',
            label: '弃票',
            disabled: busy,
            onAction: () => void act({ type: 'cast_abstention', playerId: myId }),
          },
          {
            id: 'confirm-vote',
            label: voteTarget ? `指认 ${nameOf(voteTarget)}` : '确认指认',
            primary: true,
            disabled: busy || !voteTarget,
            onAction: () => {
              if (voteTarget) void act({ type: 'cast_vote', playerId: myId, targetPlayerId: voteTarget });
            },
          },
        );
      }
    } else if (view.phase === 'game_over') {
      dockStrong = '对局结束';
      dockSpan = '';
    }
    // 角色卡变体（默认关）：最小呈现为坞内一行小字（§6 确认记录 3）
    if (me.roleCard !== 'none') {
      dockSpan = `${dockSpan}${dockSpan ? ' · ' : ''}身份卡：${ROLE_LABELS[me.roleCard]}`;
    }
  } else {
    dockStrong = phaseLabel(view.phase);
    dockSpan = view.phase === 'night' ? `夜间进行中 · 第 ${Math.max(1, view.currentHour)} 时刻` : '';
  }

  const phaseAnnouncement = view.phase === 'night'
    ? `${phaseLabel(view.phase)}，当前 ${Math.max(1, view.currentHour)} 点`
    : phaseLabel(view.phase);

  const headerControls = (
    <div className="cheese-top-controls">
      {isSpectator && (
        <div className="cheese-screen-badge" title="当前设备为房间公共桌面大屏（纯净展示，不发手牌）">
          <ScreenIcon /><span>公共大屏</span>
        </div>
      )}
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

  const dock = (
    <div className="cta-dock">
      <div className="cta-dock__info cheese-secret-card">
        <strong>{dockStrong}</strong>
        {dockSpan ? <span>{dockSpan}</span> : null}
      </div>
      {view.deadlineAt ? (
        <span className="cta-dock__pill" aria-label="倒计时">
          <TabletopCountdownText secondsLeft={countdown.secondsLeft} format="clock" />
        </span>
      ) : null}
      {dockButtons.length > 0 ? (
        <div className="cta-dock__actions">
          {dockButtons.map((btn) => (
            <button
              key={btn.id}
              type="button"
              className={`cta-btn${btn.primary ? ' cta-btn--primary' : ''}`}
              disabled={btn.disabled}
              onClick={btn.onAction}
            >
              {btn.label}
            </button>
          ))}
        </div>
      ) : null}
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
      hideSeats
      rulesButton={headerControls}
      stageFit="arena"
      actions={dock}
      drawer={rulesOpen && (
        <GameDrawer kind="rules" title="本局规则" triggerRef={rulesRef} onClose={() => setRulesOpen(false)}>
          <h4>奶酪大盗规则速览</h4>
          <p>1. <strong>掷骰定醒来时刻</strong>：每位玩家掷 6 面骰扣在骰盅内，决定夜间第几时刻醒来。</p>
          <p>2. <strong>夜间时刻推进</strong>：夜间 1→6 时刻依次推进，轮到自己点数时睁眼。独醒且奶酪在场者取走奶酪成为怪盗！</p>
          <p>3. <strong>独醒偷看</strong>：轮到自己时刻若独醒，可偷看任意一位玩家的骰子；若多人同醒则互相目击、无法偷看。</p>
          <p>4. <strong>共犯与胜利</strong>：大盗秘密挑选共犯。白天讨论投票，投中大盗则好人胜，否则大盗与共犯胜。</p>
        </GameDrawer>
      )}
    >
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {phaseAnnouncement}
      </p>
      {error && (
        <p className="game-error" role="alert" onClick={clearError} title="点击关闭提示">
          <span>{error}</span>
        </p>
      )}

      <div
        className={`cta-stage cta-phase--${view.phase}`}
        data-time={time}
        data-n={view.players.length}
        ref={stage.stageRef}
      >
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
              if (myId) void act({ type: 'steal_cheese', playerId: myId });
            }}
          />
        ) : (
          <>
            <AtticRoom
              time={time}
              when={when}
              title={title}
              currentHour={view.phase === 'night' ? view.currentHour : 0}
              myHour={me && me.wakeHour >= 1 ? me.wakeHour : null}
            />
            <AtticSeats seats={seats} onSeatClick={onSeatClick} />
            <AtticCenter cheese={cheeseSight} caption={caption} />
            {/* 旧「终局真相大揭秘」遮罩：T5 用画面④翻面揭晓替换后删除 */}
            {view.phase === 'game_over' && (
              <CheeseGameOverReveal view={view} members={members} myId={myId} />
            )}
          </>
        )}
      </div>

      {/* 飞行层必须挂在舞台之外：舞台内若有 transform 祖先，
          position:fixed 会退化为相对定位，实测屏幕坐标会全部失效。 */}
      <FlightLayer flights={stage.flights} simplified={stage.simplifiedFlights} />
      <TabletopVictoryBurst
        gameOver={view.phase === 'game_over'}
        isWinner={myId ? (view.winners ?? []).includes(myId) : null}
        label={view.thiefCaught ? '大盗被抓获！' : '大盗成功脱逃'}
        sublabel={myId ? ((view.winners ?? []).includes(myId) ? '你所在的阵营获胜' : '你所在的阵营落败') : undefined}
      />
    </TabletopShell>
  );
}
