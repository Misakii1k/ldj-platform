import { useRef, useState } from 'react';
import { useCountdown } from '../../shared-ui/useCountdown.ts';
import { TabletopCountdownText } from '../../shared-ui/TabletopCountdownText.tsx';
import { resolveMemberAvatar } from '../../user/avatar.ts';
import type { CheeseThiefPlayerView, CheeseThiefPublicView } from './types.ts';
import { CheeseGameOverReveal } from './CheeseGameOverReveal.tsx';
import { CheeseModel3DCanvas } from './CheeseModel3DCanvas.tsx';
import { HourDial, MoonArt, MouseSeatRing, type RoomSeat } from './stage/RoomProps.tsx';
import { AlertIcon, BallotIcon, CheeseIcon, SunIcon } from './stage/CheeseIcons.tsx';

interface RoomMemberInfo {
  playerId: string;
  nickname: string;
  avatar?: string;
}

interface CheeseTabletopArenaProps {
  view: CheeseThiefPlayerView | CheeseThiefPublicView;
  myId: string | null;
  members: RoomMemberInfo[];
  onStealCheese?: () => void;
  onSkipDiscussion?: () => void;
  ttsEnabled?: boolean;
  onToggleTts?: () => void;
}

/**
 * 公共大屏：「夜里的房间」（V04）
 *
 * 全宽三区：左老鼠席位环（任何阶段都在）/ 中央 three.js 奶酪（不动）/ 右六小时钟面。
 * 投票阶段中央换成计票板，席位环同步显示每人所得票数。
 */
export function CheeseTabletopArena({
  view,
  myId: _myId,
  members,
  onStealCheese,
  onSkipDiscussion,
  ttsEnabled = true,
  onToggleTts,
}: CheeseTabletopArenaProps) {
  // 奶酪是否已被取走：一律以服务端权威状态为准。
  // 一旦偷取成功即保持到天亮，之后任何时刻都不会回退成"未偷走"；
  // 只有当夜尚未被偷时，点击才是一次真实的偷取尝试（服务端校验当前时刻是否恰有独醒大盗）。
  const isNight = view.phase === 'night';
  const isDawn = view.phase === 'dawn';
  const isVote = view.phase === 'vote';
  const isGameOver = view.phase === 'game_over';

  const [stealSubmitting, setStealSubmitting] = useState(false);
  const submitLatchRef = useRef<number | null>(null);

  const memberById = new Map(members.map((m) => [m.playerId, m]));
  const nameFor = (id: string | null | undefined) => (id ? memberById.get(id)?.nickname || id : '未知');

  const cheeseGone = view.cheeseStolen || (view.reveal ? Boolean(view.reveal.thiefId) : false);
  const showStolenScene = cheeseGone && (isDawn || isVote || isGameOver);

  const countdown = useCountdown(view.deadlineAt);

  const handleSteal = () => {
    if (!isNight || cheeseGone || stealSubmitting) return;
    setStealSubmitting(true);
    onStealCheese?.();
    // 提交节流：动作结果以服务端视图为准（成功→转已偷走展示；被拒→恢复可点）
    if (submitLatchRef.current !== null) window.clearTimeout(submitLatchRef.current);
    submitLatchRef.current = window.setTimeout(() => setStealSubmitting(false), 1200);
  };

  // 计票数据提取
  const voteCounts: Record<string, number> = {};
  const voteFrom: Record<string, string[]> = {};
  const abstainList: string[] = [];
  if (view.votes) {
    for (const [voterId, v] of Object.entries(view.votes)) {
      if (v.kind === 'accuse') {
        voteCounts[v.targetPlayerId] = (voteCounts[v.targetPlayerId] ?? 0) + 1;
        if (!voteFrom[v.targetPlayerId]) voteFrom[v.targetPlayerId] = [];
        voteFrom[v.targetPlayerId]!.push(voterId);
      } else if (v.kind === 'abstain') {
        abstainList.push(voterId);
      }
    }
  }
  const totalVoted = view.votes ? Object.keys(view.votes).length : 0;

  // 席位环：只用公开信息。夜里谁醒着是秘密——一律「沉睡」。
  const reveal = view.reveal;
  const seats: RoomSeat[] = view.players.map((pid) => {
    const isThief = isGameOver && reveal?.thiefId === pid;
    const isAcc = isGameOver && (reveal?.accomplices ?? []).includes(pid);
    const role: RoomSeat['role'] =
      view.revealedCat === pid ? 'cat'
        : view.revealedDog === pid ? 'dog'
          : isThief ? 'thief'
            : isAcc ? 'accomplice'
              : null;
    let status: string;
    if (isNight || view.phase === 'hour_choice') status = '沉睡中';
    else if (view.phase === 'accomplice_select') status = '闭眼等待';
    else if (isDawn) status = view.dogFirstVoter === pid ? '先投票' : '讨论中';
    else if (isVote) status = view.votes?.[pid] ? '已投票' : '思考中';
    else if (isGameOver) {
      const wake = reveal?.wakeHours[pid];
      status = wake ? `${wake} 点醒` : '';
    } else status = '';
    const member = memberById.get(pid);
    return {
      playerId: pid,
      name: nameFor(pid),
      avatar: resolveMemberAvatar(member, { playerId: pid }),
      // 当前行动者：投票阶段被狗指定先投、且还没投的那一位
      active: isVote && view.dogFirstVoter === pid && !view.votes?.[pid],
      // 淘汰态：终局被抓获的大盗
      out: isThief && view.thiefCaught === true,
      status,
      role,
      winner: isGameOver && (view.winners ?? []).includes(pid),
      votes: isVote ? voteCounts[pid] ?? 0 : null,
    };
  });

  const phaseTitle = isNight
    ? '夜深了'
    : view.phase === 'hour_choice'
      ? '入夜前'
      : view.phase === 'accomplice_select'
        ? '夜色将尽'
        : isDawn
          ? '白天自由讨论'
          : isVote
            ? '全体投票指认'
            : '终局结算';

  return (
    <div className="cheese-tabletop-arena ct-room" data-phase={view.phase}>
      {/* 装饰层：窗格月亮，12% 透明度，不接事件 */}
      <div className="stage-art ct-art">
        <MoonArt />
      </div>
      {/* 月光：从右上斜切落到奶酪上；星点是静态的，不循环 */}
      <span className="ct-moonbeam" aria-hidden="true" />
      <span className="ct-stars" aria-hidden="true" />

      {/* 顶栏：阶段名 + 倒计时 + 语音开关 */}
      <div className="cheese-arena-header">
        <div className="cheese-phase-countdown-bar">
          <span className="cheese-phase-name-badge">
            {isDawn ? <SunIcon /> : isVote ? <BallotIcon /> : isGameOver ? <CheeseIcon /> : null}
            <span className="stage-title">{phaseTitle}</span>
          </span>
          {!isNight && view.deadlineAt && (
            <div className="cheese-countdown-pill" aria-label="剩余时间">
              <span className="cheese-countdown-pill__label">倒计时</span>
              <TabletopCountdownText className="cheese-countdown-pill__time stage-numeral" secondsLeft={countdown.secondsLeft} format="clock" />
            </div>
          )}
        </div>

        {onToggleTts && (
          <button
            type="button"
            className={`cheese-tts-btn ${ttsEnabled ? 'is-active' : ''}`}
            onClick={onToggleTts}
            title="切换法官语音主持播报"
          >
            {ttsEnabled ? '语音主持开启' : '语音主持静音'}
          </button>
        )}
      </div>

      <div className="ct-room__zones">
        {/* 左区：老鼠席位环 */}
        <aside className="ct-room__left">
          <MouseSeatRing seats={seats} phase={view.phase} />
        </aside>

        {/* 中区 */}
        <div className="ct-room__center">
          {/* 白天讨论阶段：操作入口 */}
          {isDawn && (
            <div className="cheese-dawn-control-banner">
              <div className="cheese-dawn-info">
                <h4 className="stage-title">白天自由讨论中</h4>
                <p>讨论时间到将自动进入投票，也可在大屏点击提前开启投票。</p>
              </div>
              {onSkipDiscussion && (
                <button
                  type="button"
                  className="cheese-skip-discussion-btn"
                  onClick={onSkipDiscussion}
                  title="提前结束讨论，全员手机端将立即弹出投票窗口"
                >
                  <span className="btn-icon" aria-hidden="true"><BallotIcon /></span>
                  <span className="btn-main-text">进入投票环节</span>
                  <span className="btn-sub-text">（全员手机弹出投票窗口）</span>
                </button>
              )}
            </div>
          )}

          {/* 投票环节：桌面端实时计票大屏 */}
          {isVote && (
            <div className="cheese-table-vote-board">
              <div className="cheese-vote-board-header">
                <div className="cheese-vote-board-title-group">
                  <h3 className="stage-title">全员投票指认大盗</h3>
                  <span className="cheese-vote-progress-badge">已投票 {totalVoted} / {view.players.length} 人</span>
                </div>
                <p className="cheese-vote-board-hint">玩家在个人手机端投票，公共大屏实时统计并公开票数及投票人</p>
              </div>

              <div className="cheese-vote-card-grid">
                {view.players.map((pid) => {
                  const count = voteCounts[pid] ?? 0;
                  const voters = voteFrom[pid] ?? [];
                  return (
                    <div key={pid} className={`cheese-vote-tally-card ${count > 0 ? 'is-voted' : ''}`}>
                      <div className="cheese-tally-card-head">
                        <span className="cheese-tally-name">{nameFor(pid)}</span>
                        <span className={`cheese-tally-badge ${count > 0 ? 'is-active' : ''}`}>
                          <span className="stage-numeral">{count}</span> 票
                        </span>
                      </div>
                      <div className="cheese-tally-voters">
                        {voters.length > 0 ? (
                          voters.map((vid) => (
                            <span key={vid} className="cheese-voter-chip" title={`${nameFor(vid)} 投了此玩家`}>
                              {nameFor(vid)}
                            </span>
                          ))
                        ) : (
                          <span className="cheese-voter-chip--empty">暂无指认</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {abstainList.length > 0 && (
                <div className="cheese-abstain-banner">
                  <span className="cheese-abstain-label">弃票玩家 ({abstainList.length})：</span>
                  <div className="cheese-abstain-names">
                    {abstainList.map((aid) => (
                      <span key={aid} className="cheese-abstain-chip">{nameFor(aid)}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 中央桌台案发区：大奶酪盘（夜晚与天亮背景展示）——three.js 奶酪本体不动 */}
          {!isVote && (
            <div className="cheese-center-table">
              <div className="cheese-wood-platter">
                <div className={`cheese-cloth ${showStolenScene ? 'is-stolen' : ''}`}>
                  {isNight ? (
                    <div className="cheese-night-stage">
                      {cheeseGone ? (
                        /* 偷取成功：3D空盘碎屑展示并保持到天亮（不可放回、不可重复偷） */
                        <div className="cheese-model-3d-btn is-stolen" aria-live="polite">
                          <CheeseModel3DCanvas isStolen={true} />
                          <div className="cheese-steal-status-badge">
                            <span className="badge-stolen">奶酪已被悄悄取走</span>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className={`cheese-model-3d-btn ${stealSubmitting ? 'is-submitting' : ''}`}
                          onClick={handleSteal}
                          disabled={stealSubmitting}
                          title="【桌面交互】大盗在自己醒来的时刻点击偷走奶酪"
                        >
                          <CheeseModel3DCanvas
                            isStolen={false}
                            interactive={true}
                            disabled={stealSubmitting}
                            onSteal={handleSteal}
                          />
                          <div className="cheese-steal-status-badge">
                            <span className="badge-ready">触摸/点击偷走奶酪</span>
                          </div>
                        </button>
                      )}
                    </div>
                  ) : showStolenScene ? (
                    <div className="cheese-stolen-stage">
                      <CheeseModel3DCanvas isStolen={true} />
                      <div className="cheese-stolen-crumbs">
                        <span className="crumbs-warning"><AlertIcon /> 奶酪不见了！</span>
                      </div>
                    </div>
                  ) : (
                    <div className="cheese-safe-stage">
                      <CheeseModel3DCanvas isStolen={false} />
                      <p className="cheese-safe-text">奶酪安然无恙（无人偷窃）</p>
                    </div>
                  )}
                </div>
              </div>
              {isNight && (
                <p className="cheese-night-guide">
                  {view.currentHour === 0 ? '夜幕降临…准备开始报时' : `当前时刻：${view.currentHour} 点`}
                  <span className="cheese-night-guide__rule">只有大盗在自己醒来的时刻才能取走，其他玩家无法偷走</span>
                </p>
              )}
              {showStolenScene && (
                <div className="cheese-crime-alert">
                  <strong>案发现场：</strong>桌上的大奶酪已被大盗偷吃！请找出真凶！
                </div>
              )}
            </div>
          )}
        </div>

        {/* 右区：六小时钟面 */}
        <aside className="ct-room__right">
          <HourDial
            phase={view.phase}
            currentHour={view.currentHour}
            stealHour={reveal?.stealHour ?? null}
            voted={totalVoted}
            total={view.players.length}
          />
        </aside>
      </div>

      {/* 终局真相大揭秘全屏遮罩 */}
      {isGameOver && (
        <CheeseGameOverReveal view={view} members={members} myId={_myId} />
      )}
    </div>
  );
}
