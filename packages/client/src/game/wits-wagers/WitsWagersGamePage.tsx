import { useEffect, useMemo, useRef, useState } from 'react';
import { useConnection } from '../../connection/useConnection.ts';
import { TabletopOvalShell } from '../../shared-ui/TabletopOvalShell.tsx';
import { ConfirmDialog } from '../../shared-ui/ConfirmDialog.tsx';
import type { WitsWagersPlayerView, ChipId, TargetId, BetPairView } from './types.ts';
import { targetLabel } from './types.ts';
import { GuessPanel } from './GuessPanel.tsx';
import { WitsTableStage } from './stage/WitsTableStage.tsx';
import { WitsFlightLayer } from './stage/WitsFlightLayer.tsx';
import { useWitsWagersStage } from './stage/useWitsWagersStage.ts';
import { BetEditor } from './BetEditor.tsx';
import { ResultPanel } from './ResultPanel.tsx';
import { WitsMenuControls } from './WitsMenuControls.tsx';
import { WitsRulesDrawer } from './drawers/WitsRulesDrawer.tsx';
import { WitsHistoryDrawer } from './drawers/WitsHistoryDrawer.tsx';
import { WitsSettingsDrawer } from './drawers/WitsSettingsDrawer.tsx';
import { useWitsWagersSettings } from './settings/useWitsWagersSettings.ts';
import { buildSeats } from './seats.ts';
import { createInitialDraft, selectChipTarget, isDraftDirty, isDraftValid } from './betDraft.ts';
import { useWitsWagersController } from './useWitsWagersController.ts';
import './wits-wagers.css';

export interface WitsWagersGamePageProps {
  view: WitsWagersPlayerView;
  onSubmitGuess?: (value: number) => void;
  onSetBets?: (chips: BetPairView) => void;
  onReturnToLobby?: () => void;
  isSubmitting?: boolean;
  isSavingBets?: boolean;
}

const PHASE_LABELS: Record<string, string> = {
  created: '等待开局',
  answering: '秘密作答',
  arranging: '展示版图',
  betting: '赔率下注',
  settlement: '本轮结算',
  game_over: '对局结束',
};

export function WitsWagersGamePage({
  view,
  onSubmitGuess: propsSubmitGuess,
  onSetBets: propsSetBets,
  onReturnToLobby: propsReturnToLobby,
  isSubmitting: propsIsSubmitting,
  isSavingBets: propsIsSavingBets,
}: WitsWagersGamePageProps) {
  const controller = useWitsWagersController(view);
  const { state } = useConnection();
  const { settings, update: updateSettings } = useWitsWagersSettings();
  const stage = useWitsWagersStage(view);

  const onSubmitGuess = propsSubmitGuess ?? controller.submitGuess;
  const onSetBets = propsSetBets ?? controller.setBets;
  const onReturnToLobby = propsReturnToLobby ?? controller.returnToLobby;
  const isSubmitting = propsIsSubmitting ?? controller.isSubmittingGuess;
  const isSavingBets = propsIsSavingBets ?? controller.isSavingBets;

  const me = view.me;
  const isSpectator = me === null;
  const members = useMemo(() => state.room?.members ?? [], [state.room?.members]);

  // 局内工具抽屉
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const settingsRef = useRef<HTMLButtonElement>(null);
  // 规则由牌桌菜单抽屉自带的「本局规则」触发，顶栏不再重复放按钮；
  // 这个 ref 没有绑定元素，GameDrawer 关闭时只是不做焦点还原。
  const rulesRef = useRef<HTMLButtonElement>(null);
  const historyRef = useRef<HTMLButtonElement>(null);

  // 下注本地草稿与当前选中配置的筹码
  const [betDraft, setBetDraft] = useState<BetPairView>(() => createInitialDraft(me?.acceptedBets));
  const [activeChipId, setActiveChipId] = useState<ChipId>('A');
  const [pendingSave, setPendingSave] = useState(false);

  // 仅在服务端确认了新的下注版本或换轮时才覆盖草稿。
  // 绝不能一见推送就重置——别人下注引发的刷新会把我还没保存的调整抹掉。
  const syncedBetKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!me) return;
    const key = `${view.roundToken}:${me.betRevision}`;
    if (syncedBetKeyRef.current === key) return;
    syncedBetKeyRef.current = key;
    setBetDraft(createInitialDraft(me.acceptedBets));
  }, [me, view.roundToken]);

  const handleSelectTarget = (targetId: TargetId) => {
    if (view.phase !== 'betting' || !me || !me.canBet) return;
    setBetDraft((curr) => selectChipTarget(curr, activeChipId, targetId));
  };

  const handleSaveBets = () => {
    if (!onSetBets || !me) return;
    if (settings.confirmBets) {
      setPendingSave(true);
      return;
    }
    onSetBets(betDraft);
  };

  const confirmSaveBets = () => {
    setPendingSave(false);
    if (!onSetBets || !me) return;
    onSetBets(betDraft);
  };

  const validTargets = new Set<TargetId>(view.board.map((t) => t.id));
  const canSaveDraft = me
    ? isDraftValid(betDraft, me.available + (me.reserved ?? 0), validTargets)
    : false;
  const isDirty = me ? isDraftDirty(betDraft, me.acceptedBets) : false;

  // 二次确认的文案要说清楚押了什么、要扣多少，而不是一句"确定吗"
  const betSummary = (() => {
    const parts = betDraft
      .filter((chip) => chip.targetId !== null)
      .map((chip) => {
        const target = view.board.find((t) => t.id === chip.targetId);
        const label = targetLabel(target);
        const stake = chip.extraStake > 0 ? `，附加 ${chip.extraStake} 分` : '';
        return `筹码 ${chip.chipId} → ${label}（净赢 ×${target?.odds ?? '?'}）${stake}`;
      });

    if (parts.length === 0) return '本轮不放置任何筹码，确认放弃这一轮的收益机会？';

    const reserved = betDraft.reduce(
      (sum, chip) => sum + (chip.targetId !== null ? chip.extraStake : 0),
      0,
    );
    const tail =
      reserved > 0
        ? `\n合计附加 ${reserved} 分，押错将失去这部分附加注。`
        : '\n只押免费筹码，押错不会亏分。';
    return parts.join('\n') + tail;
  })();

  const seats = buildSeats(view, members, stage.displayScores);

  // 桌面背面牌的摆放依据：参赛人数与已交牌人数，都是公开信息
  const activePlayers = view.players.filter((p) => !p.forfeited);
  const activePlayerCount = activePlayers.length;
  const submittedCount = activePlayers.filter((p) => p.hasSubmitted).length;

  const centerArena = (
    <div
      className="ww-game"
      data-ww-theme={settings.theme}
      data-ww-density={settings.compact ? 'compact' : 'cozy'}
      style={{ ['--ww-font-scale' as string]: String(settings.fontScale) }}
    >
      {isSpectator && <div className="ww-spectator-banner">当前正在以观众身份观战</div>}

      {controller.error && (
        <div className="ww-error-banner" role="alert">
          <span>{controller.error}</span>
          <button type="button" onClick={controller.clearError} aria-label="关闭提示">
            ✕
          </button>
        </div>
      )}

      <WitsTableStage
        phase={view.phase}
        question={view.phase === 'settlement' || view.phase === 'game_over' ? null : view.question}
        board={view.board}
        members={members}
        faceDownCount={activePlayerCount}
        submittedCount={submittedCount}
        winningTargetIds={view.revealed?.winningTargetIds ?? []}
        revealedTargets={stage.revealedTargets}
        myDraft={view.phase === 'betting' ? betDraft : (me?.acceptedBets ?? null)}
        myAcceptedBets={me?.acceptedBets ?? null}
        activeChipId={view.phase === 'betting' ? activeChipId : null}
        onSelectTarget={handleSelectTarget}
        interactive={view.phase === 'betting' && Boolean(me?.canBet)}
        bankActive={stage.bankActive}
        deadlineAt={view.deadlineAt}
        phaseKey={`${view.roundToken}:${view.phase}:${view.phaseEpoch}`}
        stageRef={stage.stageRef}
      />

      {view.phase === 'answering' && (
        <GuessPanel
          question={view.question}
          submittedGuess={me?.submittedGuess ?? null}
          canGuess={Boolean(me?.canGuess)}
          onSubmit={(val) => onSubmitGuess?.(val)}
          submitting={isSubmitting}
        />
      )}

      {view.phase === 'arranging' && (
        <div className="ww-phase-block__lead">
          全员作答完毕，版图已生成，请查看各数值槽位与赔率
        </div>
      )}

      {view.phase === 'betting' && me && me.canBet && (
        <BetEditor
          score={me.available + (me.reserved ?? 0)}
          draft={betDraft}
          activeChipId={activeChipId}
          board={view.board}
          onSelectActiveChip={setActiveChipId}
          onChangeDraft={setBetDraft}
          onSaveBets={handleSaveBets}
          canSave={canSaveDraft}
          isDirty={isDirty}
          isSaving={isSavingBets}
        />
      )}

      {(view.phase === 'settlement' || view.phase === 'game_over') && (
        <ResultPanel
          revealed={view.revealed}
          result={view.result}
          myPlayerId={me?.playerId}
          members={members}
          onReturnToLobby={onReturnToLobby}
        />
      )}
    </div>
  );

  return (
    <>
      <TabletopOvalShell
        title="一智千金"
        subtitle={`第 ${view.round}/${view.totalRounds} 轮`}
        gameId="wits-wagers"
        theme="poker"
        stageFit="arena"
        phaseKey={`${view.roundToken}:${view.phase}:${view.phaseEpoch}`}
        players={seats}
        currentUserId={me?.playerId ?? undefined}
        centerArena={centerArena}
        phaseBannerText={PHASE_LABELS[view.phase] ?? view.phase}
        onShowRules={() => setRulesOpen(true)}
        topRightControls={(
          <WitsMenuControls
            settingsRef={settingsRef}
            historyRef={historyRef}
            onOpenSettings={() => setSettingsOpen(true)}
            onOpenHistory={() => setHistoryOpen(true)}
            historyCount={view.history.length}
          />
        )}
      />

      {/* 飞行层必须挂在牌桌外壳之外：外壳内有 3D 变换祖先，
          position:fixed 会退化为相对定位，实测的屏幕坐标会全部失效。 */}
      <WitsFlightLayer flights={stage.flights} />

      {pendingSave && (
        <ConfirmDialog
          title="确认本轮投注"
          message={betSummary}
          confirmLabel={isSavingBets ? '保存中…' : '确认下注'}
          busy={isSavingBets}
          onConfirm={confirmSaveBets}
          onCancel={() => setPendingSave(false)}
        />
      )}

      {settingsOpen && (
        <WitsSettingsDrawer
          settings={settings}
          onChange={updateSettings}
          triggerRef={settingsRef}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      {rulesOpen && <WitsRulesDrawer triggerRef={rulesRef} onClose={() => setRulesOpen(false)} />}

      {historyOpen && (
        <WitsHistoryDrawer
          history={view.history}
          members={members}
          myPlayerId={me?.playerId ?? null}
          triggerRef={historyRef}
          onClose={() => setHistoryOpen(false)}
        />
      )}
    </>
  );
}
