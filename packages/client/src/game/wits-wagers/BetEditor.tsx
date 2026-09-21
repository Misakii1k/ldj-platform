import type { ChipId, BetPairView, BoardTargetView } from './types.ts';
import { targetLabel } from './types.ts';
import { RollingNumber } from '../../shared-ui/RollingNumber.tsx';
import {
  calculateReserved,
  calculateAvailable,
  adjustExtraStake,
  setChipExtraStake,
  clearChip,
  estimateProfitIfTargetWins,
} from './betDraft.ts';

export interface BetEditorProps {
  score: number;
  draft: BetPairView;
  activeChipId: ChipId;
  board: readonly BoardTargetView[];
  onSelectActiveChip: (chipId: ChipId) => void;
  onChangeDraft: (draft: BetPairView) => void;
  onSaveBets: () => void;
  canSave: boolean;
  isDirty: boolean;
  isSaving?: boolean;
}

export function BetEditor({
  score,
  draft,
  activeChipId,
  board,
  onSelectActiveChip,
  onChangeDraft,
  onSaveBets,
  canSave,
  isDirty,
  isSaving = false,
}: BetEditorProps) {
  const reserved = calculateReserved(draft);
  const available = calculateAvailable(score, draft);

  const activeIndex = activeChipId === 'A' ? 0 : 1;
  const activeChip = draft[activeIndex];
  const targetObj = board.find((t) => t.id === activeChip.targetId);

  // 预计收益
  const estimate =
    activeChip.targetId !== null
      ? estimateProfitIfTargetWins(draft, board, activeChip.targetId)
      : null;

  return (
    <div className="ww-bet-editor">
      {/* 余额与预留展示 */}
      <div className="ww-bet-editor__balances">
        <div>
          积分余额: <RollingNumber as="strong" value={score} />
        </div>
        <div>
          已预留附加分: <RollingNumber as="strong" value={reserved} />
        </div>
        <div>
          可用积分: <strong>{available}</strong>
        </div>
      </div>

      {/* 筹码切换标签 */}
      {/* 筹码托盘：也是手拿取/放回筹码的动画锚点 */}
      <div className="ww-bet-editor__chip-tabs" data-ww-anchor="tray">
        {(['A', 'B'] as const).map((cid) => {
          const chip = draft[cid === 'A' ? 0 : 1];
          const isActive = cid === activeChipId;
          const target = board.find((t) => t.id === chip.targetId);
          const targetText = target ? targetLabel(target) : '未放置';

          return (
            <button
              key={cid}
              type="button"
              className={`ww-chip-tab ${isActive ? 'ww-chip-tab--active' : ''}`}
              onClick={() => onSelectActiveChip(cid)}
            >
              <span>
                <strong>筹码 {cid}</strong>
                {isActive && ' (当前配置)'}
              </span>
              <span>
                {targetText}
                {chip.extraStake > 0 && ` (+${chip.extraStake})`}
              </span>
            </button>
          );
        })}
      </div>

      {/* 当前选中筹码的附加积分调整 */}
      <div className="ww-bet-editor__stake-row">
        <div>
          {activeChip.targetId === null ? (
            <span className="ww-bet-editor__placeholder">
              请先在上方版图中点击目标槽位放置筹码 {activeChipId}
            </span>
          ) : (
            <span>
              已选目标：
              <strong>
                {targetLabel(targetObj)}
              </strong>{' '}
              (净赢 ×{targetObj?.odds})
            </span>
          )}
        </div>

        {activeChip.targetId !== null && (
          <div className="ww-bet-editor__stake-controls">
            <span>附加积分：</span>
            <div className="ww-stepper">
              <button
                type="button"
                className="ww-stepper__btn"
                disabled={activeChip.extraStake <= 0}
                onClick={() => onChangeDraft(adjustExtraStake(draft, activeChipId, -1, score))}
              >
                -
              </button>
              <span className="ww-stepper__val">{activeChip.extraStake}</span>
              <button
                type="button"
                className="ww-stepper__btn"
                disabled={available <= 0}
                onClick={() => onChangeDraft(adjustExtraStake(draft, activeChipId, 1, score))}
              >
                +
              </button>
            </div>
            <button
              type="button"
              className="ww-btn ww-btn--secondary ww-btn--compact"
              disabled={available <= 0}
              onClick={() =>
                onChangeDraft(setChipExtraStake(draft, activeChipId, activeChip.extraStake + available, score))
              }
            >
              全押可用
            </button>
            <button
              type="button"
              className="ww-btn ww-btn--secondary ww-btn--compact"
              onClick={() => onChangeDraft(clearChip(draft, activeChipId))}
            >
              清除
            </button>
          </div>
        )}
      </div>

      {/* 收益提示与保存动作 */}
      <div className="ww-bet-editor__actions">
        <div className="ww-bet-editor__estimate">
          {estimate && (
            <span>
              若该槽获胜预计：
              <span className="ww-diff-pos">+{estimate.profit} 分</span>
              {estimate.loss > 0 && <span className="ww-diff-neg"> (-{estimate.loss} 分)</span>}
            </span>
          )}
        </div>

        <button
          type="button"
          className="ww-btn ww-btn--primary"
          onClick={onSaveBets}
          disabled={!canSave || isSaving || !isDirty}
        >
          {isSaving ? '保存中…' : isDirty ? '保存整组投注' : '已是最新投注'}
        </button>
      </div>
    </div>
  );
}
