/**
 * goose_relay_classic_v1 客户端主页面（线下辅助形态）。
 * 只消费严格解析后的以鹅传鹅视角（goose-relay/types.ts）。
 * 定位：线下桌游辅助——App 负责案情卡私密分发、传递顺序/计时、指认推进、投票与终局判定；
 * 线下为肢体比划+鹅叫传递（数字版用文字演绎），讨论在线下进行。
 */
import { useRef, useState } from 'react';
import { useConnection } from '../../connection/useConnection.ts';
import { GameLeaveButton } from '../GameLeaveButton.tsx';
import { nameFor, useGameAction } from '../useGameAction.ts';
import { ActionDock } from '../tabletop/ActionDock.tsx';
import { GameDrawer } from '../tabletop/GameDrawer.tsx';
import { TabletopShell } from '../tabletop/TabletopShell.tsx';
import type { CharacterId, GooseRelayPlayerView } from './types.ts';

const CHARACTER_LABELS: Record<CharacterId, string> = {
  grey_goose: '灰鹅',
  white_goose: '白鹅',
  brown_goose: '棕鹅',
  black_goose: '黑鹅',
  duck_goose: '鸭鹅',
  swan_goose: '天鹅',
};

function phaseLabel(phase: GooseRelayPlayerView['phase']): string {
  switch (phase) {
    case 'case_view': return '头鹅读卡';
    case 'relay': return '逐棒传递';
    case 'discussion': return '公开讨论';
    case 'accusation': return '逐一指认';
    case 'vote': return '投票揪恶';
    case 'game_over': return '对局结束';
    default: return phase;
  }
}

function roleLabel(role: GooseRelayPlayerView['me'] extends infer _ ? NonNullable<GooseRelayPlayerView['me']>['role'] : never): string {
  switch (role) {
    case 'head': return '头鹅';
    case 'evil': return '恶鹅';
    case 'white': return '好鹅';
    default: return '';
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
  const [transmission, setTransmission] = useState<string>('');
  const [voteTarget, setVoteTarget] = useState<string | null>(null);
  const [murdererPick, setMurdererPick] = useState<CharacterId | null>(null);
  const [victimPick, setVictimPick] = useState<CharacterId | null>(null);

  const myIndex = myId === null ? -1 : view.lineOrder.indexOf(myId);
  const myTurnTransmit = view.phase === 'relay' && myIndex === view.currentIndex;
  const myTurnAccuse =
    view.phase === 'accusation' && myIndex === view.currentAccuserIndex;

  const players = view.players.map((playerId) => {
    const index = view.lineOrder.indexOf(playerId);
    let status = '';
    if (view.phase === 'game_over') {
      status = view.winners.includes(playerId) ? '获胜' : '失败';
    } else if (index === 0) {
      status = '头鹅';
    } else if (myId === playerId && me?.role === 'evil') {
      status = '恶鹅';
    } else if (view.phase === 'relay' && index === view.currentIndex) {
      status = '传递中';
    } else if (view.phase === 'accusation' && index === view.currentAccuserIndex) {
      status = '指认中';
    }
    return { id: playerId, name: nameFor(members, playerId), status, active: index === view.currentIndex || index === view.currentAccuserIndex };
  });

  // 私密信息：身份 + 本人可见案情
  const myPrivateLine =
    me === null
      ? null
      : [
          me.role ? `你是${roleLabel(me.role)}` : null,
          me.role === 'evil' ? '（恶鹅可故意传错）' : null,
        ].filter(Boolean).join(' ');

  let primary: Parameters<typeof ActionDock>[0]['primary'] | null = null;
  let secondary: Parameters<typeof ActionDock>[0]['secondary'] = [];

  if (myTurnTransmit && myId) {
    primary = {
      id: 'submit-transmit',
      label: '提交演绎',
      disabled: transmission.trim().length === 0,
      onAction: () => void act({ type: 'transmit', playerId: myId, case: { ...(me?.observed ?? { murderer: 'grey_goose', victim: 'white_goose', tool: '', scene: '' }), tool: transmission.trim(), scene: transmission.trim() } }),
    };
  } else if (myTurnAccuse && myId) {
    // 指认凶手鹅 + 受害鹅：选满后提交
    const ready = murdererPick !== null && victimPick !== null && murdererPick !== victimPick;
    primary = {
      id: 'submit-accuse',
      label: ready
        ? `指认 ${CHARACTER_LABELS[murdererPick!]} → ${CHARACTER_LABELS[victimPick!]}`
        : '先选凶手鹅与受害鹅',
      disabled: !ready,
      onAction: () => {
        if (!ready) return;
        void act({ type: 'accuse', playerId: myId, murderer: murdererPick, victim: victimPick });
      },
    };
    const characterOptions = Object.entries(CHARACTER_LABELS) as Array<[CharacterId, string]>;
    secondary = characterOptions.map(([id, label]) => ({
      id: `char-${id}`,
      label: `${murdererPick === id ? '凶手·' : victimPick === id ? '受害·' : ''}${label}`,
      disabled: false,
      onAction: () => {
        // 先选凶手，再选受害；已选相同则切换为受害
        if (murdererPick === null) setMurdererPick(id);
        else if (victimPick === null) setVictimPick(id);
        else if (murdererPick === id) setMurdererPick(null);
        else if (victimPick === id) setVictimPick(null);
      },
    }));
  } else if (view.phase === 'vote' && myId) {
    primary = voteTarget
      ? { id: 'confirm-vote', label: `投票 ${nameFor(members, voteTarget)}`, disabled: false, onAction: () => { void act({ type: 'cast_vote', playerId: myId, targetPlayerId: voteTarget }); setVoteTarget(null); } }
      : null;
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
    : view.phase === 'case_view'
      ? '头鹅正在阅读案情卡'
      : view.phase === 'relay'
        ? myTurnTransmit ? '轮到你了：请根据上一位的演绎提交你的演绎' : `等待 ${nameFor(members, view.lineOrder[view.currentIndex] ?? '')} 演绎`
        : view.phase === 'discussion'
          ? '演绎链已公开——线下讨论，讨论结束后进入指认'
          : view.phase === 'accusation'
            ? myTurnAccuse ? '轮到你了：请指认凶手鹅与受害鹅' : `等待 ${nameFor(members, view.lineOrder[view.currentAccuserIndex] ?? '')} 指认`
            : '等待投票推进';

  return (
    <TabletopShell
      title="以鹅传鹅：鹅鹅密令"
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
          <p>头鹅看案情卡（凶手鹅+受害鹅）后逐棒传递；恶鹅故意传错污染案情。</p>
          <p>从最后一人起逐一指认「凶手鹅+受害鹅」，直到有人指对；全部指错 → 恶鹅胜。</p>
          <p>指对后投票揪恶鹅：投中 → 头鹅+好鹅胜；投错 → 恶鹅胜。</p>
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

      {me && myPrivateLine && (
        <section className="durian-private" aria-label="我的私密信息">
          <span className="durian-board__label">我的私密信息（仅自己可见）</span>
          <div className="durian-private__cards">
            <span className="durian-private__card">{myPrivateLine}</span>
          </div>
        </section>
      )}

      {me?.observed && (view.phase === 'case_view' || view.phase === 'relay') && (
        <section className="goose-case" aria-label="我看到的案情">
          <span className="durian-board__label">{me.role === 'head' ? '原始案情' : '上一位的演绎'}</span>
          <div className="goose-case__card">
            <span>凶手：<strong>{CHARACTER_LABELS[me.observed.murderer]}</strong></span>
            <span>受害：<strong>{CHARACTER_LABELS[me.observed.victim]}</strong></span>
          </div>
        </section>
      )}

      {myTurnTransmit && (
        <section className="goose-transmit" aria-label="提交演绎">
          <p className="durian-board__label">你的演绎（数字版用一句话描述上一位的案情）</p>
          <input
            className="goose-transmit__input"
            value={transmission}
            maxLength={80}
            onChange={(e) => setTransmission(e.target.value)}
            placeholder="用一句话复述你看到的案情……"
          />
        </section>
      )}

      {view.phase === 'accusation' && (
        <section className="goose-accusation" aria-label="指认进度">
          <span className="durian-board__label">已完成的指认</span>
          <div className="goose-accusation__list">
            {(view.accusations ?? []).map((acc, index) => (
              <span key={index} className={`goose-accusation__item ${acc.correct ? 'goose-accusation__item--hit' : ''}`}>
                {nameFor(members, acc.playerId)} · {acc.correct ? '✓ 指对' : '✗ 指错'}
              </span>
            ))}
            {view.accusations === null || view.accusations.length === 0 ? <span className="goose-accusation__empty">尚未有人指认</span> : null}
          </div>
        </section>
      )}

      {view.phase === 'discussion' && view.transmissions && (
        <section className="goose-chain" aria-label="演绎链">
          <span className="durian-board__label">演绎链（已公开）</span>
          <ol className="goose-chain__list">
            {view.transmissions.map((card, index) => (
              <li key={index}>
                <strong>{nameFor(members, view.lineOrder[index] ?? '')}</strong>
                <span>{CHARACTER_LABELS[card.murderer]} → {CHARACTER_LABELS[card.victim]}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {view.phase === 'game_over' && view.reveal && (
        <section className="durian-over" aria-label="对局结果">
          <h2>本局结束</h2>
          <p>
            {!view.reveal.caseMatched
              ? '真相长眠，恶鹅获胜……'
              : view.reveal.evilIdentified
                ? `白鹅守住了案情并揪出恶鹅！${view.winners.map((id) => nameFor(members, id)).join('、')} 获胜`
                : `案情被指对，但恶鹅逃过了投票！${view.winners.map((id) => nameFor(members, id)).join('、')} 获胜`}
          </p>
          <ul className="cheese-reveal">
            <li>原始案情：{CHARACTER_LABELS[view.reveal.case.murderer]} → {CHARACTER_LABELS[view.reveal.case.victim]}</li>
            <li>恶鹅：{view.reveal.evilGeese.map((id) => nameFor(members, id)).join('、')}</li>
          </ul>
        </section>
      )}
    </TabletopShell>
  );
}
