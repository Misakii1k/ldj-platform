import React from 'react';

/**
 * 席位直选：把「选一名玩家」从面板网格搬回席位本身。
 *
 * 偷看骰盅、指认恶鹅、投票、判定伪人都需要选人；面板里的名字网格与席位条重复，
 * 且小屏上两处都要滚动。这里只渲染可点选的席位芯片，面板只保留「已选对象 + 确认」。
 */
export interface SeatTargetOption {
  readonly id: string;
  readonly name: string;
  readonly disabled?: boolean;
  /** 副标题，例如「剩 3 张」「已自告」。 */
  readonly hint?: string;
}

export interface SeatTargetPickerProps {
  readonly options: readonly SeatTargetOption[];
  readonly selectedIds: readonly string[];
  readonly onSelect: (ids: string[]) => void;
  /** 最多可选人数；默认 1。 */
  readonly max?: number;
  readonly label: string;
  readonly disabled?: boolean;
}

export function SeatTargetPicker({
  options,
  selectedIds,
  onSelect,
  max = 1,
  label,
  disabled = false,
}: SeatTargetPickerProps) {
  const toggle = (id: string) => {
    if (disabled) return;
    const selected = selectedIds.includes(id);
    if (selected) {
      onSelect(selectedIds.filter((current) => current !== id));
      return;
    }
    if (max <= 1) {
      onSelect([id]);
      return;
    }
    if (selectedIds.length >= max) return;
    onSelect([...selectedIds, id]);
  };

  return (
    <div className="seat-target-picker" role="group" aria-label={label}>
      {options.map((option) => {
        const selected = selectedIds.includes(option.id);
        const blocked = disabled || option.disabled === true
          || (!selected && max > 1 && selectedIds.length >= max);
        return (
          <button
            key={option.id}
            type="button"
            className={`seat-target-picker__chip ${selected ? 'is-selected' : ''}`}
            aria-pressed={selected}
            disabled={blocked}
            onClick={() => toggle(option.id)}
          >
            <span className="seat-target-picker__name">{option.name}</span>
            {option.hint !== undefined && <span className="seat-target-picker__hint">{option.hint}</span>}
          </button>
        );
      })}
    </div>
  );
}
