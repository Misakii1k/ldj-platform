/**
 * durian_orchard_v1 客户端主页面（D7-C，TabletopShell 首次消费方）。
 * 只消费严格解析后的 durian 视角（durian/types.ts parseDurianView）。
 * 规则状态全部来自服务端视角；客户端只做叙事与提交动作。
 */
import { useRef, useState } from 'react';
import { useConnection } from '../../connection/useConnection.ts';
import { GameLeaveButton } from '../GameLeaveButton.tsx';
import { nameFor, useGameAction } from '../useGameAction.ts';
import { ActionDock } from '../tabletop/ActionDock.tsx';
import { GameDrawer } from '../tabletop/GameDrawer.tsx';
import { TabletopShell } from '../tabletop/TabletopShell.tsx';
import type { DurianFruit, DurianPlayerView } from './types.ts';

const FRUIT_LABELS: Record<DurianFruit, string> = {
  amber_pear: '琥珀梨',
  cloud_berry: '云莓',
  jade_melon: '玉瓜',
  moon_plum: '月梅',
  sun_fig: '日无花果',
};

function phaseLabel(phase: DurianPlayerView['phase']): string {
  switch (phase) {
    case 'ordering': return '接单中';
    case 'buzzer': return '按铃裁决';
    case 'game_over': return '对局结束';
    default: return phase;
  }
}

interface Props {
  view: DurianPlayerView;
}

export function DurianGamePage({ view }: Props) {
  const { state } = useConnection();
  const members = state.room?.members ?? [];
  const { act, busy, error } = useGameAction();
  const me = view.me;
  const myId = me?.playerId ?? null;
  const isSpectator = me === null;
  const rulesRef = useRef<HTMLButtonElement | null>(null);
  const [rulesOpen, setRulesOpen] = useState(false);

  const ordererId = view.currentPlayerId;
  const myTurnOrder = view.phase === 'ordering' && ordererId === myId;
  const bellLocked = view.bell?.status === 'locked';
  const myTurnResolve = view.phase === 'buzzer' && ordererId === myId;
  const waitingReason = view.phase === 'game_over'
    ? null
    : view.phase === 'ordering'
      ? `${nameFor(members, ordererId)} 正在选择订单选项`
      : view.bell?.status === 'open'
        ? '按铃窗口已开启，其他人可抢单'
        : `等待 ${nameFor(members, ordererId)} 裁定按铃`;

  const players = view.players.map((playerId) => ({
    id: playerId,
    name: nameFor(members, playerId),
    status: view.phase === 'game_over'
      ? `处罚 ${view.penalties[playerId] ?? 0}`
      : playerId === ordererId
        ? view.phase === 'buzzer' && bellLocked ? '待裁定' : '接单中'
        : `处罚 ${view.penalties[playerId] ?? 0}`,
    active: playerId === ordererId,
  }));

  const primary = view.phase === 'ordering' && myTurnOrder && myId
    ? { id: 'option-a', label: `接单 · ${FRUIT_LABELS[view.currentOrder!.options[0]!.fruit]}×${view.currentOrder!.options[0]!.quantity}`, disabled: false, onAction: () => void act({ type: 'submit_order', playerId: myId, optionIndex: 0 }) }
    : view.phase === 'buzzer' && view.bell?.status === 'open' && myId !== ordererId && !myTurnResolve && myId
      ? { id: 'ring', label: '按铃抢单', disabled: false, onAction: () => void act({ type: 'ring_bell', playerId: myId }) }
      : view.phase === 'buzzer' && bellLocked && myTurnResolve && myId
        ? { id: 'resolve', label: '裁定本次按铃', disabled: false, onAction: () => void act({ type: 'resolve_bell', playerId: myId }) }
        : view.phase === 'buzzer' && view.bell?.status === 'open' && myTurnResolve && myId
          ? { id: 'close', label: '关闭按铃窗口', disabled: false, onAction: () => void act({ type: 'close_bell', playerId: myId }) }
          : null;

  const secondary = view.phase === 'ordering' && myTurnOrder && view.currentOrder && myId
    ? [{
        id: 'option-b',
        label: `接单 · ${FRUIT_LABELS[view.currentOrder.options[1]!.fruit]}×${view.currentOrder.options[1]!.quantity}`,
        disabled: false,
        onAction: () => void act({ type: 'submit_order', playerId: myId, optionIndex: 1 }),
      }]
    : view.phase === 'buzzer' && view.bell?.status === 'open' && myTurnResolve && myId
      ? [{ id: 'close', label: '无人按铃，关闭窗口', disabled: false, onAction: () => void act({ type: 'close_bell', playerId: myId }) }]
      : [];

  return (
    <TabletopShell
      title="Durian：榴莲店长"
      phase={phaseLabel(view.phase)}
      spectator={isSpectator}
      players={players}
      actions={primary ? <ActionDock primary={primary} secondary={secondary} busy={busy} waitingReason={waitingReason ?? undefined} /> : <ActionDock primary={{ id: 'wait', label: '等待本回合推进', disabled: true, onAction: () => {} }} busy={busy} waitingReason={waitingReason ?? undefined} />}
      drawer={rulesOpen && (
        <GameDrawer kind="rules" title="本局规则" triggerRef={rulesRef} onClose={() => setRulesOpen(false)}>
          <p>按铃先到先得：首位按铃者锁定订单，关闭窗口后不可再抢。</p>
          <p>超卖判定：订单导致需求超过库存即超卖，当前下单者受罚；未超卖则按铃者受罚。</p>
          <p>怒气随处罚上升，处罚累计到 7 即终局，处罚最低者获胜。</p>
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

      <section className="durian-order" aria-label="当前订单">
        {view.currentOrder ? (
          <>
            <span className="durian-order__eyebrow">本单需求 · {view.currentOrder.staffEvent}</span>
            <div className="durian-order__options">
              {view.currentOrder.options.map((option, index) => (
                <div key={index} className="durian-order__option">
                  <strong>{FRUIT_LABELS[option.fruit]}</strong>
                  <span>× {option.quantity}</span>
                </div>
              ))}
            </div>
          </>
        ) : (
          <p>订单已全部完成</p>
        )}
      </section>

      <section className="durian-board" aria-label="当前需求与怒气">
        <div className="durian-demand">
          <span className="durian-board__label">当前需求</span>
          <div className="durian-demand__chips">
            {(Object.keys(view.demand) as DurianFruit[]).map((fruit) => (
              <span key={fruit} className="durian-demand__chip">
                {FRUIT_LABELS[fruit]} <strong>{view.demand[fruit]}</strong>
              </span>
            ))}
          </div>
        </div>
        <div className="durian-anger" aria-label="怒气等级">
          <span className="durian-board__label">怒气</span>
          <strong>{view.angerLevel} / 7</strong>
        </div>
      </section>

      {view.bell && (
        <section className={`durian-bell durian-bell--${view.bell.status}`} aria-label="按铃窗口">
          {view.bell.status === 'open'
            ? <span>按铃窗口开启 · 等待抢单</span>
            : <span>已锁定 · {nameFor(members, view.bell.claimantId)} 抢先按铃</span>}
        </section>
      )}

      {me && (
        <section className="durian-private" aria-label="可见库存">
          <span className="durian-board__label">其他玩家的库存（自己的已隐藏）</span>
          <div className="durian-private__cards">
            {me.visibleInventory.map((entry) => (
              <span key={entry.playerId} className="durian-private__card">
                {nameFor(members, entry.playerId)} · {FRUIT_LABELS[entry.card.fruit]}
              </span>
            ))}
          </div>
        </section>
      )}

      {view.phase === 'game_over' && (
        <section className="durian-over" aria-label="对局结果">
          <h2>本局结束</h2>
          <p>处罚最低者获胜：{view.winners.map((id) => nameFor(members, id)).join('、')}</p>
        </section>
      )}
    </TabletopShell>
  );
}
