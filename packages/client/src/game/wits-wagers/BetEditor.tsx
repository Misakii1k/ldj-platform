import type { ChipId, BetPairView, BoardTargetView } from './types.ts';
import { targetLabel, formatPoints } from './types.ts';
import { playerColorFor, PLAYER_COLORS } from './seats.ts';
import { WitsChip } from './stage/WitsChip.tsx';
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
  /** 我的 playerId：托盘里的两枚筹码用与座位章一致的玩家色 */
  myPlayerId?: string | null;
  onSelectActiveChip: (chipId: ChipId) => void;
  onChangeDraft: (draft: BetPairView) => void;
  onSaveBets: () => void;
  canSave: boolean;
  isDirty: boolean;
  isSaving?: boolean;
}

/**
 * 下注托盘（01-CONTRACT.md §4.4，A2 的 .tray）。
 *
 * 「可用 N / 余额 M」| 筹码 A + 目标面值与赔率 + 步进器 | 筹码 B 同结构。
 * 只换皮：选筹码、点牌放置、加注上限、保存、二次确认的逻辑全部不动（betDraft.ts 不改）。
 */
export function BetEditor({
  score,
  draft,
  activeChipId,
  board,
  myPlayerId = null,
  onSelectActiveChip,
  onChangeDraft,
  onSaveBets,
  canSave,
  isDirty,
  isSaving = false,
}: BetEditorProps) {
  const reserved = calculateReserved(draft);
  const available = calculateAvailable(score, draft);
  const myColor = myPlayerId ? playerColorFor(myPlayerId) : PLAYER_COLORS[0];

  const activeIndex = activeChipId === 'A' ? 0 : 1;
  const activeChip = draft[activeIndex];

  // 预计收益
  const estimate =
    activeChip.targetId !== null
      ? estimateProfitIfTargetWins(draft, board, activeChip.targetId)
      : null;

  return (
    <div className="ww-bet-editor">
      {/* 托盘：可用/余额 + 两枚筹码；也是筹码飞出/飞回的动画锚点 */}
      <div className="ww-tray" data-stage-anchor="tray">
        <div className="ww-tray__balance">
          可用 <b>{available.toLocaleString('zh-CN')}</b>
          <span className="ww-tray__balance-sub">
            / 余额 {formatPoints(score)}{reserved > 0 ? ` · 已押 ${formatPoints(reserved)}` : ''}
          </span>
        </div>

        {(['A', 'B'] as const).map((cid) => {
          const index = cid === 'A' ? 0 : 1;
          const chip = draft[index];
          const isActive = cid === activeChipId;
          const target = board.find((t) => t.id === chip.targetId);

          return (
            <div
              key={cid}
              className={`ww-tray__bet ${isActive ? 'ww-tray__bet--active' : ''}`}
            >
              <button
                type="button"
                className="ww-tray__chip-btn"
                aria-pressed={isActive}
                aria-label={`选择筹码 ${cid}${isActive ? '（当前配置）' : ''}`}
                onClick={() => onSelectActiveChip(cid)}
              >
                <WitsChip color={myColor} label={cid} size={46} />
              </button>
              <div className="ww-tray__bet-to">
                {target ? targetLabel(target) : '未放置'}
                {target && <small> ×{target.odds}</small>}
              </div>
              <div className="ww-stepper" aria-label={`筹码 ${cid} 加注`}>
                <button
                  type="button"
                  className="ww-stepper__btn"
                  disabled={chip.extraStake <= 0}
                  onClick={() => onChangeDraft(adjustExtraStake(draft, cid, -1, score))}
                >
                  −
                </button>
                <span className="ww-stepper__val">
                  {chip.extraStake > 0 ? `+${chip.extraStake}` : '0'}
                </span>
                <button
                  type="button"
                  className="ww-stepper__btn"
                  disabled={available <= 0}
                  onClick={() => onChangeDraft(adjustExtraStake(draft, cid, 1, score))}
                >
                  +
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* 操作行：放置提示 / 收益预估 + 辅助动作 + 主按钮 */}
      <div className="ww-bet-editor__actions">
        <div className="ww-bet-editor__estimate">
          {activeChip.targetId === null ? (
            <span className="ww-bet-editor__placeholder">
              点上方牌面放置筹码 {activeChipId}
            </span>
          ) : (
            estimate && (
              <span>
                若 {targetLabel(board.find((t) => t.id === activeChip.targetId))} 获胜预计：
                <span className="ww-diff-pos">+{estimate.profit} 分</span>
                {estimate.loss > 0 && <span className="ww-diff-neg"> (-{estimate.loss} 分)</span>}
              </span>
            )
          )}
        </div>

        <div className="ww-bet-editor__buttons">
          {activeChip.targetId !== null && (
            <>
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
                收回筹码 {activeChipId}
              </button>
            </>
          )}
          <button
            type="button"
            className="ww-btn ww-btn--primary"
            onClick={onSaveBets}
            disabled={!canSave || isSaving || !isDirty}
          >
            {isSaving ? '保存中…' : isDirty ? '确认下注' : '已是最新投注'}
          </button>
        </div>
      </div>
    </div>
  );
}
