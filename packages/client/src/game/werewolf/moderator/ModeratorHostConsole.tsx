import { ModeratorVoicePanel } from './ModeratorVoicePanel.tsx';
/**
 * 法官控制台：1:1 原生全屏深色工作台（对齐原型 moderator.html）。
 * 全知席位列表 + 一键出局/撤销（二次确认）+ 终局亮牌。
 */
import { useCallback, useMemo, useState, useEffect } from 'react';
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
import { useTimelineJudgeVoice } from '../ui/useJudgeVoice.ts';
import { RoleTurnOverlay } from '../ui/RoleTurnOverlay.tsx';
import { webAudio } from '../../../shared-ui/WebAudioManager.ts';
import { useConnection } from '../../../connection/useConnection.ts';
import { formatTimelineTimer } from '../../../shared-ui/serverClock.ts';

interface ModeratorHostConsoleProps {
  readonly view: WerewolfModeratorView;
  readonly members: readonly RoomMemberView[];
  readonly myAvatar?: string | null;
}

const END_GAME_KEY: ActionKey = { action: 'end_game', object: 'table' };
const TIMELINE_MODE_KEY: ActionKey = { action: 'moderator_set_mode', object: 'timeline' };
const TIMELINE_NEXT_KEY: ActionKey = { action: 'moderator_next', object: 'timeline' };
const TIMELINE_PAUSE_KEY: ActionKey = { action: 'moderator_pause', object: 'timeline' };
const TIMELINE_RESUME_KEY: ActionKey = { action: 'moderator_resume', object: 'timeline' };
const TIMELINE_SKIP_KEY: ActionKey = { action: 'moderator_skip', object: 'timeline' };

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
    if (ok) {
      setPendingSeat(null);
      webAudio.playCardFlip();
      try {
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          navigator.vibrate(seat.alive ? 40 : 20);
        }
      } catch { /* Haptics are optional on unsupported browsers. */ }
    }
  }, [act]);

  const submitEndGame = useCallback(async () => {
    const ok = await act(END_GAME_KEY, { type: 'end_game' });
    if (!ok) {
      showToast('结束对局失败，请重试', 'error');
    } else {
      webAudio.playVictory();
    }
    setEndGameOpen(false);
  }, [act, showToast]);

  const submitModeToggle = useCallback(async () => {
    if (!view.timeline) return;
    const nextMode = view.timeline.mode === 'auto' ? 'manual' : 'auto';
    const ok = await act(TIMELINE_MODE_KEY, {
      type: 'moderator_set_mode',
      mode: nextMode,
      timelineId: view.timeline.id,
    });
    if (!ok) {
      showToast('切换模式失败，请重试', 'error');
    }
  }, [act, showToast, view.timeline]);

  const submitNext = useCallback(async () => {
    if (!view.timeline) return;
    const ok = await act(TIMELINE_NEXT_KEY, {
      type: 'moderator_next',
      timelineId: view.timeline.id,
    });
    if (!ok) {
      showToast('推进环节失败，请重试', 'error');
    }
  }, [act, showToast, view.timeline]);

  const submitPauseResume = useCallback(async () => {
    if (!view.timeline) return;
    const isPaused = view.timeline.paused;
    const key = isPaused ? TIMELINE_RESUME_KEY : TIMELINE_PAUSE_KEY;
    const type = isPaused ? 'moderator_resume' : 'moderator_pause';
    const ok = await act(key, {
      type,
      timelineId: view.timeline.id,
    });
    if (!ok) {
      showToast(`${isPaused ? '恢复' : '暂停'}失败，请重试`, 'error');
    }
  }, [act, showToast, view.timeline]);

  const submitSkip = useCallback(async () => {
    if (!view.timeline) return;
    const ok = await act(TIMELINE_SKIP_KEY, {
      type: 'moderator_skip',
      timelineId: view.timeline.id,
    });
    if (!ok) {
      showToast('跳过当前环节失败，请重试', 'error');
    }
  }, [act, showToast, view.timeline]);

  const { state: connState } = useConnection();
  const timelineVoice = useTimelineJudgeVoice(view.timeline, { isModerator: true, clockSample: connState.clockSample, announcement: view.announcement });
  const [currentMonotonic, setCurrentMonotonic] = useState(() => (typeof performance !== 'undefined' ? performance.now() : Date.now()));

  useEffect(() => {
    if (!view.timeline || view.timeline.paused || view.timeline.endsAt === null) {
      return;
    }
    const timer = setInterval(() => {
      setCurrentMonotonic(typeof performance !== 'undefined' ? performance.now() : Date.now());
    }, 500);
    return () => clearInterval(timer);
  }, [view.timeline]);

  const timelineTimer = useMemo(() => {
    if (!view.timeline) return null;
    return formatTimelineTimer(view.timeline, connState.clockSample, currentMonotonic);
  }, [view.timeline, connState.clockSample, currentMonotonic]);

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
    <div className="mod-console-root">
      <main className="mod-console">
        {/* 头部 Header */}
        <header className="mod-header">
          <div className="brand">
            聚乐 · 狼人杀 <small>法官视角 · MODERATOR CONSOLE</small>
          </div>
          <span className="chapter">
            席位 {model.moderatorSeatLabel} · 法官控制台
          </span>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button
              type="button"
              id="mod-rules"
              onClick={() => setRulesOpen(true)}
            >
              本局规则 ↗
            </button>
            <button
              type="button"
              className="mod-console__menu-btn"
              onClick={menu.openMenu}
              title="展开快捷菜单"
            >
              菜单
            </button>
          </div>
        </header>

        {/* 4格全局状态卡片 */}
        {summary !== null && (
          <section className="mod-status" aria-label="全局状态">
            <div className="mod-stat mod-stat--alive">
              <span>存活</span>
              <strong id="mod-alive">{summary.aliveTotal}</strong>
              <small>/ {summary.total}</small>
            </div>
            <div className="mod-stat mod-stat--wolf">
              <span>狼人</span>
              <strong id="mod-wolf">{summary.aliveWolves}</strong>
              <small>存活 <b>{summary.aliveWolves}</b></small>
            </div>
            <div className="mod-stat mod-stat--god">
              <span>神职</span>
              <strong id="mod-god">{summary.aliveGods}</strong>
              <small>存活 <b>{summary.aliveGods}</b></small>
            </div>
            <div className="mod-stat mod-stat--villager">
              <span>村民</span>
              <strong id="mod-villager">{summary.aliveVillagers}</strong>
              <small>存活 <b>{summary.aliveVillagers}</b></small>
            </div>
            <p className="mod-note" id="mod-note">
              仅法官可见全部身份。玩家端在终局亮牌前不会显示任何他人身份。
            </p>
            {model.gameEnded && (
              <div className="mod-ended-banner mod-console__ended" role="status">
                {winnerLabel(model.winner)} · 全场身份底牌已公开
              </div>
            )}
            {model.suggestion && !model.gameEnded && (
              <div
                className="mod-suggestion-banner"
                role="status"
                style={{
                  gridColumn: '1 / -1',
                  margin: '4px 0 0',
                  padding: '8px 12px',
                  background: 'rgba(234, 179, 8, 0.15)',
                  border: '1px solid #eab308',
                  borderRadius: 'var(--v2-radius)',
                  color: '#fef08a',
                  fontSize: '12px',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <span>💡 <strong>判决建议：</strong>{model.suggestion.reason}</span>
              </div>
            )}
          </section>
        )}

        {/* 时间线与主持控制栏 */}
        {view.timeline && (
          <section
            className="mod-timeline-panel"
            aria-label="主持时间线控制"
            style={{
              padding: '10px 14px',
              background: 'var(--card)',
              border: '1px solid var(--edge)',
              borderRadius: 'var(--v2-radius)',
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '10px',
            }}
          >
            <div className="mod-role-art" aria-hidden="true">
              <RoleTurnOverlay role={view.timeline.period === 'night' ? view.timeline.role : null}
                segment={view.timeline.segment} timelineId={`${view.timeline.id.split('-s')[0]}:${view.timeline.role}`} period={view.timeline.period} />
            </div>
            {timelineVoice.autoplayBlocked && <button type="button" onClick={timelineVoice.enableAudio}>开启法官旁白</button>}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--detail)' }}>
                当前环节：{view.timeline.label}
              </span>
              <span
                style={{
                  fontSize: '11px',
                  padding: '2px 8px',
                  borderRadius: '4px',
                  background: view.timeline.mode === 'auto' ? 'rgba(74, 222, 128, 0.15)' : 'rgba(234, 179, 8, 0.15)',
                  color: view.timeline.mode === 'auto' ? '#4ade80' : '#fef08a',
                  border: `1px solid ${view.timeline.mode === 'auto' ? '#4ade80' : '#eab308'}`,
                  fontWeight: 600,
                }}
              >
                {view.timeline.mode === 'auto' ? '自动辅助中' : '手动控场中'}
              </span>
              {timelineTimer && (
                <span style={{ fontSize: '12px', color: 'var(--text)', fontWeight: 600 }}>
                  {timelineTimer.status === 'paused' ? (
                    <span style={{ color: '#f87171' }}>已暂停 ({timelineTimer.secondsLeft}s)</span>
                  ) : timelineTimer.status === 'waiting' ? (
                    <span style={{ color: 'var(--secondary)' }}>等待主持人操作</span>
                  ) : timelineTimer.status === 'broadcasting' ? (
                    <span style={{ color: '#60a5fa' }}>正在播报语音 ({timelineTimer.secondsLeft}s)</span>
                  ) : (
                    <span>倒计时：{timelineTimer.secondsLeft}s</span>
                  )}
                </span>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="confirm-btn confirm-btn--cancel"
                onClick={submitModeToggle}
                disabled={isBusy(actionState, TIMELINE_MODE_KEY)}
                style={{ fontSize: '12px', padding: '4px 10px' }}
              >
                切为{view.timeline.mode === 'auto' ? '手动模式' : '自动辅助'}
              </button>

              {view.timeline.mode === 'auto' && (
                <>
                  <button
                    type="button"
                    className="confirm-btn confirm-btn--cancel"
                    onClick={submitPauseResume}
                    disabled={isBusy(actionState, view.timeline.paused ? TIMELINE_RESUME_KEY : TIMELINE_PAUSE_KEY)}
                    style={{ fontSize: '12px', padding: '4px 10px' }}
                  >
                    {view.timeline.paused ? '▶ 恢复' : '⏸ 暂停'}
                  </button>
                  <button
                    type="button"
                    className="confirm-btn confirm-btn--cancel"
                    onClick={submitSkip}
                    disabled={view.timeline.paused || isBusy(actionState, TIMELINE_SKIP_KEY)}
                    style={{ fontSize: '12px', padding: '4px 10px' }}
                  >
                    ⏭ 跳过
                  </button>
                </>
              )}

              {(view.timeline.mode === 'manual' || view.timeline.segment === 'confirm' || view.timeline.segment === 'dawn' || view.timeline.segment === 'day') && (
                <button
                  type="button"
                  className="confirm-btn"
                  onClick={submitNext}
                  disabled={isBusy(actionState, TIMELINE_NEXT_KEY)}
                  style={{ fontSize: '12px', padding: '4px 12px', fontWeight: 700 }}
                >
                  {view.timeline.segment === 'confirm'
                    ? '确认结果并进入白天'
                    : view.timeline.segment === 'day'
                      ? '开始下一夜'
                      : '下一环节 ➔'}
                </button>
              )}
            </div>
          </section>
        )}

        <ModeratorVoicePanel view={view} members={members} autoplayBlocked={timelineVoice.autoplayBlocked} onEnableAudio={timelineVoice.enableAudio} />
        {/* 席位与身份底牌网格 */}
        <section className="mod-seats" aria-labelledby="mod-seats-title">
          <div className="mod-seats-head">
            <h2 id="mod-seats-title">席位与身份底牌</h2>
            <span id="mod-seats-hint">点「标记出局」需要二次确认；出局可撤销。</span>
          </div>

          <div className="mod-seat-grid" id="mod-seat-grid">
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
          </div>
        </section>

        {/* 底部操作 */}
        <footer className="mod-footer">
          <p>法官负责标记出局与终局亮牌，不参与发言与投票。</p>
          {!model.gameEnded && (
            <button
              type="button"
              id="mod-reveal"
              className="mod-reveal"
              aria-label="结束对局并亮牌"
              onClick={() => setEndGameOpen(true)}
              disabled={endGameBusy}
            >
              结束对局并亮牌 <span aria-hidden="true">→</span>
            </button>
          )}
        </footer>
      </main>

      {/* 抽屉与二次确认弹窗 */}
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
