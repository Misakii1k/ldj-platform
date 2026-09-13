/**
 * 法官控制台：全知席位列表 + 一键出局/撤销（二次确认）+ 终局亮牌。
 *
 * 复用共享能力：TabletopMenuDrawer（本局规则 / 音效 / 暂离 / 退出房间 / 解散房间 +
 * 「结束对局并亮牌」自定义动作）、ConfirmDialog、UserAvatar、--gp-* 设计令牌。
 * 座位号与角色信息来自 presentation.ts（座位唯一权威 = 房间席位）。
 * 出局/撤销按 (action, 席位) 作用域记录忙碌与错误，只锁当前行。
 */
import { useCallback, useMemo, useState } from 'react';
import { Eye } from 'lucide-react';
import type { RoomMemberView, WerewolfModeratorView } from '@ldj/shared';
import { ConfirmDialog } from '../../../shared-ui/ConfirmDialog.tsx';
import { TabletopMenuDrawer } from '../../../shared-ui/TabletopMenuDrawer.tsx';
import { useTabletopMenu } from '../../../shared-ui/useTabletopMenu.ts';
import { useToast } from '../../../shared-ui/ToastContext.tsx';
import { isBusy, type ActionKey } from '../../actionState.ts';
import { useScopedAction } from '../../useScopedAction.ts';
import { ModeratorSeatRow } from './ModeratorSeatRow.tsx';
import { ModeratorRulesSheet } from './ModeratorRulesSheet.tsx';
import { buildModeratorConsoleModel, type ModeratorSeatModel } from './presentation.ts';

interface ModeratorHostConsoleProps {
  readonly view: WerewolfModeratorView;
  readonly members: readonly RoomMemberView[];
  readonly myAvatar?: string | null;
}

const END_GAME_KEY: ActionKey = { action: 'end_game', object: 'table' };

function toggleKeyFor(seat: ModeratorSeatModel): ActionKey {
  return {
    action: seat.alive ? 'eliminate_player' : 'revive_player',
    object: seat.playerId,
  };
}

function winnerLabel(winner: 'werewolf' | 'good' | null): string {
  if (winner === 'werewolf') return '狼人阵营获胜';
  if (winner === 'good') return '好人阵营获胜';
  return '对局已结束';
}

export function ModeratorHostConsole({ view, members, myAvatar }: ModeratorHostConsoleProps) {
  const model = useMemo(
    () => buildModeratorConsoleModel(view, members, { myAvatar }),
    [view, members, myAvatar],
  );

  const { act, state: actionState, errorFor } = useScopedAction();
  const { showToast } = useToast();
  const menu = useTabletopMenu();

  const [pendingSeat, setPendingSeat] = useState<ModeratorSeatModel | null>(null);
  const [endGameOpen, setEndGameOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);

  const submitToggle = useCallback(async (seat: ModeratorSeatModel) => {
    const ok = await act(toggleKeyFor(seat), {
      type: seat.alive ? 'eliminate_player' : 'revive_player',
      targetPlayerId: seat.playerId,
    });
    if (ok) setPendingSeat(null);
    // 失败时保留确认框与当前席位，错误文案由对应席位行就地显示
  }, [act]);

  const submitEndGame = useCallback(async () => {
    const ok = await act(END_GAME_KEY, { type: 'end_game' });
    if (!ok) showToast('结束对局失败，请重试', 'error');
    setEndGameOpen(false);
  }, [act, showToast]);

  const endGameBusy = isBusy(actionState, END_GAME_KEY);
  const summary = model.summary;

  const customActions = model.gameEnded ? undefined : (
    <button
      type="button"
      className="tabletop-drawer-item"
      onClick={() => {
        menu.closeMenu();
        setEndGameOpen(true);
      }}
    >
      <span className="tabletop-drawer-item__icon" aria-hidden="true">
        <Eye size={20} strokeWidth={2.2} />
      </span>
      <div className="tabletop-drawer-item__text">
        <strong>结束对局并亮牌</strong>
        <span>结算胜负，并向全场公开所有玩家的真实身份</span>
      </div>
    </button>
  );

  return (
    <div className="mod-console">
      <header className="mod-console__header">
        <div className="mod-console__title-group">
          <span className="mod-console__badge">法官视角</span>
          <h1 className="mod-console__title">狼人杀 · 法官控制台</h1>
          <span className="mod-console__seat">你是法官 · 席位 {model.moderatorSeatLabel}</span>
        </div>

        <button
          type="button"
          className="tabletop-sound-btn mod-console__menu-btn"
          onClick={menu.openMenu}
          title="展开快捷菜单：本局规则、音效、结束对局与房间管理"
        >
          <span className="tabletop-sound-btn__label">菜单</span>
        </button>
      </header>

      <div className="mod-console__status">
        {summary !== null && (
          <p className="mod-console__summary">
            存活 {summary.aliveTotal}/{summary.total} 人
            <span className="mod-console__summary-item">狼 {summary.aliveWolves}</span>
            <span className="mod-console__summary-item">神 {summary.aliveGods}</span>
            <span className="mod-console__summary-item">民 {summary.aliveVillagers}</span>
          </p>
        )}

        {model.gameEnded ? (
          <p className="mod-console__ended" role="status">
            {winnerLabel(model.winner)} · 全场身份底牌已公开
          </p>
        ) : model.suggestion !== null ? (
          <div className="mod-console__suggestion" role="status">
            <span className="mod-console__suggestion-text">{model.suggestion.reason}</span>
            <button
              type="button"
              className="confirm-btn confirm-btn--primary"
              onClick={() => setEndGameOpen(true)}
            >
              按此结果结束对局
            </button>
          </div>
        ) : null}
      </div>

      {model.seats.length === 0 ? (
        <p className="mod-console__empty">本局没有参与抽卡的玩家。</p>
      ) : (
        <ul className="mod-console__seats">
          {model.seats.map((seat) => (
            <ModeratorSeatRow
              key={seat.playerId}
              seat={seat}
              busy={isBusy(actionState, toggleKeyFor(seat))}
              error={errorFor(toggleKeyFor(seat))}
              locked={model.gameEnded}
              onRequestToggle={setPendingSeat}
            />
          ))}
        </ul>
      )}

      <TabletopMenuDrawer
        isOpen={menu.isOpen}
        onClose={menu.closeMenu}
        gameTitle="狼人杀 · 法官控制台"
        muted={menu.muted}
        onToggleSound={menu.toggleSound}
        onShowRules={() => {
          menu.closeMenu();
          setRulesOpen(true);
        }}
        onStepOut={menu.stepOut}
        onLeaveRoom={menu.requestLeave}
        onDissolveRoom={menu.requestDissolve}
        isHost={menu.isHost}
        customActions={customActions}
      />

      {menu.confirmKind && (
        <ConfirmDialog
          title={menu.confirmKind === 'dissolve' ? '解散房间' : isHostTitle(menu.isHost)}
          message={menu.confirmKind === 'dissolve'
            ? '确定要解散当前房间吗？对局将立即终止，所有玩家将被移出。'
            : menu.isHost
              ? '您是房主兼法官。选择「暂离返回主页」可保持房间在后台运行；选择「解散房间」将关闭房间。'
              : '选择「暂离返回主页」将保留您的席位，可在主页顶部随时一键返回；选择「退出房间」将释放席位。'}
          confirmLabel="暂离返回主页"
          secondaryLabel={menu.confirmKind === 'dissolve' || menu.isHost ? '解散房间' : '彻底退出'}
          onSecondary={menu.confirmKind === 'dissolve' || menu.isHost
            ? menu.confirmDissolveRoom
            : menu.confirmLeaveRoom}
          destructive={menu.confirmKind === 'dissolve' || menu.isHost}
          busy={menu.busy}
          onConfirm={menu.confirmKind === 'dissolve' ? menu.cancelConfirm : menu.stepOut}
          onCancel={menu.cancelConfirm}
        />
      )}

      {pendingSeat !== null && (
        <ConfirmDialog
          title={pendingSeat.alive
            ? `标记 ${pendingSeat.seatLabel} ${pendingSeat.name} 出局？`
            : `撤销 ${pendingSeat.seatLabel} ${pendingSeat.name} 的出局状态？`}
          message={pendingSeat.alive
            ? '该玩家会被立即标记出局，其手机端同步显示「已出局」并变灰。误操作可随时撤销。'
            : '该玩家会恢复存活状态，全场看板同步更新。'}
          confirmLabel={pendingSeat.alive ? '确认标记出局' : '确认撤销出局'}
          destructive={pendingSeat.alive}
          busy={isBusy(actionState, toggleKeyFor(pendingSeat))}
          onConfirm={() => void submitToggle(pendingSeat)}
          onCancel={() => setPendingSeat(null)}
        />
      )}

      {endGameOpen && (
        <ConfirmDialog
          title="结束对局并亮牌？"
          message="将按当前存活情况结算胜负，并向所有玩家公开全部真实身份。结束后无法恢复本局。"
          confirmLabel="确认结束并亮牌"
          destructive
          busy={endGameBusy}
          onConfirm={() => void submitEndGame()}
          onCancel={() => setEndGameOpen(false)}
        />
      )}

      {rulesOpen && <ModeratorRulesSheet onClose={() => setRulesOpen(false)} />}
    </div>
  );
}

function isHostTitle(isHost: boolean): string {
  return isHost ? '房主退出 / 解散选项' : '暂离或退出房间';
}
