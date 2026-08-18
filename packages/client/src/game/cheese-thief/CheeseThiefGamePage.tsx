/**
 * cheese_thief_classic_v1 客户端主页面（线下辅助形态）。
 * 只消费严格解析后的奶酪大盗视角（cheese-thief/types.ts）。
 * 定位：线下桌游辅助——App 负责私密分发（骰点/身份/共犯）、夜间推进、讨论与投票计时、终局判定；
 * 讨论本身在线下进行（App 不提供聊天/语音）。
 * 视觉：月夜主题——第六时刻夜间时间轴、月面叶脉，共犯/查看/指认以点选芯片完成。
 */
import { useRef, useState } from 'react';
import { useConnection } from '../../connection/useConnection.ts';
import { nameFor, useGameAction } from '../useGameAction.ts';
import { ActionDock } from '../tabletop/ActionDock.tsx';
import { GameDrawer } from '../tabletop/GameDrawer.tsx';
import { TabletopShell } from '../tabletop/TabletopShell.tsx';
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
  const { act, busy, error } = useGameAction();
  const me = view.me;
  const myId = me?.playerId ?? null;
  const isSpectator = me === null;
  const rulesRef = useRef<HTMLButtonElement | null>(null);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [peekTarget, setPeekTarget] = useState<string | null>(null);
  const [voteTarget, setVoteTarget] = useState<string | null>(null);
  const [accomplicePicks, setAccomplicePicks] = useState<string[]>([]);

  const myTurnChoose =
    view.phase === 'hour_choice' && myId !== null && (me?.wakeHour === 0 || me?.wakeHour === undefined);
  const myTurnAccomplice =
    view.phase === 'accomplice_select' && me?.isThief === true && myId !== null;
  // 共犯数量按人数档（5–6 人 1 名、7–8 人 2 名；公开信息）
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

  // 私密身份徽标（只对自己可见的信息展示在个人区域，不放进玩家条）
  const myRoleLine =
    me === null
      ? null
      : [
          me.isThief
            ? '🧀 你是大盗'
            : me.isAccomplice
              ? `🤝 你是共犯（大盗及同伙：${(me.knownAccomplices ?? []).map((id) => nameFor(members, id)).join('、')}）`
              : '🐭 你是贪睡鼠（村民）',
          me.roleCard !== 'none' ? `🃏 身份卡：${ROLE_LABELS[me.roleCard]}` : null,
        ].filter(Boolean).join(' · ');

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
          ? '轮到你的时刻且独醒：请选择查看一位玩家的骰子点数或跳过'
          : (me.coWakers ?? []).length > 0
            ? '轮到你的时刻：有其他人同时醒来，互相目击'
            : '轮到你的时刻推进中'
        : '夜间进行中——闭眼装睡，轮到你的时刻才睁眼'
      : view.phase === 'accomplice_select'
        ? '大盗正在秘密挑选共犯…'
        : view.phase === 'dawn'
          ? '天亮讨论中——线下自由发言，讨论结束自动进入投票'
          : me?.hasVoted
            ? '你已完成投票，等待其他玩家完成投票…'
            : '请选择你怀疑的大盗，或在下方操作栏弃票';

  return (
    <TabletopShell
      title="奶酪大盗"
      phase={phaseLabel(view.phase)}
      spectator={isSpectator}
      players={players}
      theme="night"
      rulesButton={(
        <button ref={rulesRef} type="button" className="tabletop-rules-btn" onClick={() => setRulesOpen(true)}>
          本局规则
        </button>
      )}
      actions={
        <ActionDock
          primary={primary ?? { id: 'wait', label: '等待阶段推进', disabled: true, onAction: () => {} }}
          secondary={secondary}
          busy={busy}
          waitingReason={waitingReason ?? undefined}
        />
      }
      drawer={rulesOpen && (
        <GameDrawer kind="rules" title="本局规则" triggerRef={rulesRef} onClose={() => setRulesOpen(false)}>
          <p>掷骰定醒来时刻：1~6 纯随机确定醒来时刻。夜间 1→6 依次推进，独醒且奶酪在场者取走奶酪成为大盗。</p>
          <p>独醒偷看：轮到自己的时刻，若独醒可查看场上任意一人骰子；若 2 人或以上同醒则互相目击无法查看。</p>
          <p>共犯：5 人 1 名（大盗选）、6 人 1 名（相识）、7–8 人 2 名（7 人不相识）。共犯胜利条件同大盗。</p>
          <p>投票：并列最高票一并出局；投中大盗 → 好人胜，否则大盗+共犯胜。</p>
        </GameDrawer>
      )}
    >
      {error && <p className="game-error" role="alert">{error}</p>}

      {view.phase !== 'game_over' ? (
        <div className="sg-stage">
          {me && (
            <section className="cheese-secret-card" aria-label="我的私密信息">
              <div className="cheese-secret-card__header">
                <div className="cheese-secret-card__title-group">
                  <span className="cheese-secret-card__icon" aria-hidden="true">🧀</span>
                  <h3>我的私密身份与骰子</h3>
                </div>
                <span className="cheese-secret-card__privacy-tag">🔒 仅自己可见 · 请勿展示给他人</span>
              </div>

              <div className="cheese-secret-card__body">
                {/* 身份大胶囊 */}
                <div className={`cheese-secret-role ${me.isThief ? 'role--thief' : me.isAccomplice ? 'role--accomplice' : 'role--sleeper'}`}>
                  <span className="secret-role-icon">{me.isThief ? '🐭🧀' : me.isAccomplice ? '🤝🐭' : '😴🐭'}</span>
                  <div className="secret-role-text">
                    <span className="secret-role-label">本局身份</span>
                    <strong>{me.isThief ? '贪吃鼠（怪盗）' : me.isAccomplice ? '共犯老鼠' : '贪睡鼠（村民）'}</strong>
                  </div>
                </div>

                {/* 投骰醒来时刻卡片 */}
                {me.wakeHour !== undefined && me.wakeHour >= 1 && (
                  <div className="cheese-secret-dice">
                    <span className="secret-dice-label">投骰睁眼时刻</span>
                    <div className="secret-dice-display">
                      <span className="secret-dice-icon" aria-hidden="true">🎲</span>
                      <strong className="secret-dice-num">第 {me.wakeHour} 时刻</strong>
                    </div>
                  </div>
                )}
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

          {view.phase === 'night' && me?.wakeHour === view.currentHour && (me.coWakers ?? []).length > 0 && (
            <section className="sg-panel" aria-label="同醒目击">
              <div className="sg-panel__head">
                <h3>👀 轮到你的时刻（第 {view.currentHour} 时刻）</h3>
                <span style={{ color: 'var(--brand-accent, #3b82f6)', fontWeight: 800 }}>多人同时睁眼</span>
              </div>
              <p className="sg-hint">
                你与 <strong>{(me.coWakers ?? []).map((id) => nameFor(members, id)).join('、')}</strong> 在同一时刻醒来，彼此互相目击，无法偷看他人骰子。
              </p>
            </section>
          )}

          {view.phase === 'night' && me?.canPeek && (
            <section className="sg-panel" aria-label="查看对象选择">
              <div className="sg-panel__head">
                <h3>🔍 轮到你且独醒！选择查看一位玩家的骰子</h3>
                <span>或在下方操作栏点击跳过</span>
              </div>
              <div className="sg-chip-row">
                {view.players.filter((id) => id !== myId).map((id) => (
                  <button
                    key={id}
                    type="button"
                    className={`sg-chip sg-chip--btn ${peekTarget === id ? 'sg-chip--selected' : ''}`}
                    onClick={() => setPeekTarget(id)}
                    aria-pressed={peekTarget === id}
                  >
                    {peekTarget === id ? '🔍 ' : ''}{nameFor(members, id)}
                  </button>
                ))}
              </div>
            </section>
          )}

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

          {view.phase === 'dawn' && (
            <section className="sg-panel cheese-dawn" aria-label="天亮讨论">
              <div className="sg-panel__head">
                <h3>天亮了！线下自由讨论</h3>
                <span>讨论计时结束后自动进入投票</span>
              </div>
              <p className="sg-hint">谁偷走了奶酪？可以撒谎，抓紧问足问题。</p>
              {(view.revealedCat || view.revealedDog) && (
                <div className="sg-chip-row">
                  {view.revealedCat && <span className="sg-chip sg-chip--peek">🐱 {nameFor(members, view.revealedCat)} 是猫</span>}
                  {view.revealedDog && <span className="sg-chip sg-chip--peek">🐶 {nameFor(members, view.revealedDog)} 是狗 · 指定 {nameFor(members, view.dogFirstVoter ?? '')} 先投票</span>}
                </div>
              )}
            </section>
          )}

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
        </div>
      ) : (
        <div className="sg-stage">
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
          {view.reveal && (
            <section className="sg-panel">
              <div className="sg-panel__head">
                <h3>本局揭秘</h3>
                <span>夜间档案公开</span>
              </div>
              <ul className="sg-note-list">
                <li>大盗：{nameFor(members, view.reveal.thiefId ?? '')}</li>
                <li>盗取时刻：{view.reveal.stealHour ?? '—'}</li>
                <li>共犯：{(view.reveal.accomplices ?? []).map((id) => nameFor(members, id)).join('、') || '无'}</li>
                <li>醒来时刻：{view.players.map((id) => `${nameFor(members, id)}@${view.reveal?.wakeHours?.[id] ?? '?'}`).join('、')}</li>
              </ul>
            </section>
          )}
        </div>
      )}
    </TabletopShell>
  );
}
