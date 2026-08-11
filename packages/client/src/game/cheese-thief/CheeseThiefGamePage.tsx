/**
 * cheese_thief_classic_v1 客户端主页面（线下辅助形态）。
 * 只消费严格解析后的奶酪大盗视角（cheese-thief/types.ts）。
 * 定位：线下桌游辅助——App 负责私密分发（骰点/身份/共犯）、夜间推进、讨论与投票计时、终局判定；
 * 讨论本身在线下进行（App 不提供聊天/语音）。
 */
import { useRef, useState } from 'react';
import { useConnection } from '../../connection/useConnection.ts';
import { GameLeaveButton } from '../GameLeaveButton.tsx';
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
    case 'night': return `夜间 · 时刻 ${phase} / 6`;
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

  const myTurnChoose = view.phase === 'hour_choice' && myId !== null && me?.wakeHour === undefined;
  const myTurnAccomplice =
    view.phase === 'accomplice_select' && me?.isThief === true && myId !== null;
  // 共犯数量按人数档（5–6 人 1 名、7–8 人 2 名；公开信息）
  const accompliceCount = view.players.length >= 7 ? 2 : 1;

  const players = view.players.map((playerId) => {
    let status = '';
    if (view.phase === 'game_over') {
      status = view.winners.includes(playerId) ? '获胜' : '失败';
    } else if (playerId === myId) {
      status = me?.isThief ? '我是大盗' : me?.isAccomplice ? '我是共犯' : '';
    }
    return { id: playerId, name: nameFor(members, playerId), status, active: false };
  });

  // 私密身份徽标（只对自己可见的信息展示在个人区域，不放进玩家条）
  const myRoleLine =
    me === null
      ? null
      : [
          me.isThief ? '你是大盗' : null,
          me.isAccomplice ? `你是共犯${view.phase === 'game_over' ? '' : '（' + me.knownAccomplices.map((id) => nameFor(members, id)).join('、') + '）'}` : null,
          me.roleCard !== 'none' ? `身份卡：${ROLE_LABELS[me.roleCard]}` : null,
        ].filter(Boolean).join(' · ');

  // 主操作
  let primary: Parameters<typeof ActionDock>[0]['primary'] | null = null;
  let secondary: Parameters<typeof ActionDock>[0]['secondary'] = [];

  if (myTurnChoose && myId && me?.hourChoices) {
    const [a, b] = me.hourChoices;
    primary = { id: 'choose-a', label: `醒来时刻 ${a}`, disabled: false, onAction: () => void act({ type: 'choose_hour', playerId: myId, hour: a }) };
    secondary = [{ id: 'choose-b', label: `醒来时刻 ${b}`, disabled: false, onAction: () => void act({ type: 'choose_hour', playerId: myId, hour: b }) }];
  } else if (myTurnAccomplice && myId) {
    // 大盗选择共犯：多选至人数档数量后提交
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
    secondary = view.players
      .filter((id) => id !== myId)
      .map((id) => ({
        id: `accomplice-${id}`,
        label: `${selected.includes(id) ? '✓ ' : ''}${nameFor(members, id)}`,
        disabled: selected.includes(id) ? selected.length >= accompliceCount : false,
        onAction: () => {
          setAccomplicePicks((prev) =>
            prev.includes(id) ? prev.filter((p) => p !== id) : prev.length >= accompliceCount ? prev : [...prev, id],
          );
        },
      }));
  } else if (view.phase === 'night' && me?.canPeek && myId) {
    primary = peekTarget
      ? { id: 'confirm-peek', label: `查看 ${nameFor(members, peekTarget)} 的骰子`, disabled: false, onAction: () => { void act({ type: 'peek_die', playerId: myId, targetPlayerId: peekTarget }); setPeekTarget(null); } }
      : { id: 'skip-peek', label: '不查看（跳过）', disabled: false, onAction: () => void act({ type: 'skip_peek', playerId: myId }) };
    secondary = view.players
      .filter((id) => id !== myId)
      .map((id) => ({
        id: `peek-${id}`,
        label: nameFor(members, id),
        disabled: false,
        onAction: () => setPeekTarget(id),
      }));
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
    primary = voteTarget
      ? { id: 'confirm-vote', label: `指认 ${nameFor(members, voteTarget)}`, disabled: false, onAction: () => { void act({ type: 'cast_vote', playerId: myId, targetPlayerId: voteTarget }); setVoteTarget(null); } }
      : { id: 'abstain', label: '弃票', disabled: false, onAction: () => void act({ type: 'cast_abstention', playerId: myId }) };
    secondary = view.players
      .filter((id) => id !== myId)
      .map((id) => ({
        id: `vote-${id}`,
        label: nameFor(members, id),
        disabled: false,
        onAction: () => setVoteTarget(id),
      }));
  }
  const waitingReason = view.phase === 'game_over'
    ? null
    : view.phase === 'hour_choice'
      ? '等待大家选择醒来时刻'
      : view.phase === 'night'
        ? '夜间进行中——闭眼，等待时刻推进'
        : view.phase === 'accomplice_select'
          ? '大盗正在选择共犯'
          : view.phase === 'dawn'
            ? '天亮讨论中——线下自由发言，讨论结束自动进入投票'
            : '等待投票推进';

  return (
    <TabletopShell
      title="奶酪大盗：月夜鼠影"
      phase={phaseLabel(view.phase)}
      spectator={isSpectator}
      players={players}
      actions={
        primary || secondary.length > 0
          ? <ActionDock primary={primary ?? { id: 'wait', label: '等待阶段推进', disabled: true, onAction: () => {} }} secondary={secondary} busy={busy} waitingReason={waitingReason ?? undefined} />
          : <ActionDock primary={{ id: 'wait', label: '等待阶段推进', disabled: true, onAction: () => {} }} busy={busy} waitingReason={waitingReason ?? undefined} />
      }
      drawer={rulesOpen && (
        <GameDrawer kind="rules" title="本局规则" triggerRef={rulesRef} onClose={() => setRulesOpen(false)}>
          <p>掷骰定醒来时刻：夜间 1→6 依次推进，独醒且奶酪在场者取走奶酪成为大盗；多人同醒互相目击。</p>
          <p>共犯：5 人 1 名（大盗选）、6 人 1 名（相识）、7–8 人 2 名（7 人不相识）。共犯胜利条件同大盗。</p>
          <p>投票：并列最高票一并出局；投中大盗 → 好人胜，否则大盗+共犯胜。</p>
        </GameDrawer>
      )}
    >
      <header className="durian-page__bar">
        <GameLeaveButton />
        <button ref={rulesRef} type="button" className="durian-page__rules" onClick={() => setRulesOpen(true)}>
          本局规则
        </button>
      </header>

      {error && <p className="game-error" role="alert">{error}</p>}

      {me && (
        <section className="cheese-private" aria-label="我的私密信息">
          <span className="durian-board__label">我的私密信息（仅自己可见）</span>
          <div className="cheese-private__cards">
            {view.phase !== 'hour_choice' && me.wakeHour >= 1 && (
              <span className="cheese-private__card">醒来时刻 <strong>{me.wakeHour}</strong></span>
            )}
            {myRoleLine && <span className="cheese-private__card">{myRoleLine}</span>}
            {me.catPeekedHour && (
              <span className="cheese-private__card">
                猫查看：{nameFor(members, me.catPeekedHour.target)} 醒来时刻 <strong>{me.catPeekedHour.hour}</strong>
              </span>
            )}
            {me.peekedHour && (
              <span className="cheese-private__card">
                偷看：{nameFor(members, me.peekedHour.target)} 醒来时刻 <strong>{me.peekedHour.hour}</strong>
              </span>
            )}
          </div>
        </section>
      )}

      {view.phase === 'hour_choice' && me?.hourChoices && (
        <section className="cheese-hour-choice" aria-label="选择醒来时刻">
          <p>你掷出了 <strong>{me.hourChoices[0]}</strong> 和 <strong>{me.hourChoices[1]}</strong>，选择其一作为你的醒来时刻。</p>
        </section>
      )}

      {view.phase === 'night' && (
        <section className="cheese-night" aria-label="夜间遮罩">
          <p className="cheese-night__mask">
            {view.currentHour >= 1 && view.currentHour <= 6
              ? `夜深了……第 ${view.currentHour} 时刻`
              : '夜幕降临'}
          </p>
          <p className="cheese-night__hint">闭眼装睡，等待时刻推进；只有轮到你醒来时才睁眼。</p>
        </section>
      )}

      {view.phase === 'accomplice_select' && me?.isThief && (
        <section className="cheese-accomplice" aria-label="共犯选择">
          <p>你是大盗！请选择你的共犯（下方按钮逐一选择）。</p>
        </section>
      )}

      {view.phase === 'dawn' && (
        <section className="cheese-dawn" aria-label="天亮讨论">
          <p>天亮了！线下自由讨论谁偷走了奶酪（可撒谎）。讨论计时结束后进入投票。</p>
          {view.revealedCat && <p className="cheese-dawn__reveal">🐱 {nameFor(members, view.revealedCat)} 是猫</p>}
          {view.revealedDog && <p className="cheese-dawn__reveal">🐶 {nameFor(members, view.revealedDog)} 是狗，指定 {nameFor(members, view.dogFirstVoter ?? '')} 先投票</p>}
        </section>
      )}

      {view.phase === 'vote' && (
        <section className="cheese-vote" aria-label="投票指认">
          <p>秘密投票指认你怀疑的大盗（或弃票）。</p>
        </section>
      )}

      {view.phase === 'game_over' && view.reveal && (
        <section className="durian-over" aria-label="对局结果">
          <h2>本局结束</h2>
          <p>
            {view.thiefCaught === null
              ? '整夜无人偷走奶酪，好人们守住了！'
              : view.thiefCaught
                ? `大盗被抓住了！${view.winners.map((id) => nameFor(members, id)).join('、')} 获胜`
                : `大盗逃之夭夭！${view.winners.map((id) => nameFor(members, id)).join('、')} 获胜`}
          </p>
          <ul className="cheese-reveal">
            <li>大盗：{nameFor(members, view.reveal.thiefId ?? '')}</li>
            <li>盗取时刻：{view.reveal.stealHour ?? '—'}</li>
            <li>共犯：{view.reveal.accomplices.map((id) => nameFor(members, id)).join('、') || '无'}</li>
            <li>醒来时刻：{view.players.map((id) => `${nameFor(members, id)}@${view.reveal?.wakeHours[id] ?? '?'}`).join('、')}</li>
          </ul>
        </section>
      )}
    </TabletopShell>
  );
}
