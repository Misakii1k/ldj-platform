import React, { useEffect, useRef } from 'react';
import type { PartyColor } from './PartyCloth';

export interface PartyColorPickerProps {
  open: boolean;
  onSelect: (color: PartyColor) => void;
  title?: string;
  className?: string;
}

const COLORS: Array<{ key: PartyColor; label: string }> = [
  { key: 'red', label: '红' },
  { key: 'yellow', label: '黄' },
  { key: 'green', label: '绿' },
  { key: 'blue', label: '蓝' },
];

export const PartyColorPicker: React.FC<PartyColorPickerProps> = ({
  open,
  onSelect,
  title = '选一个颜色',
  className,
}) => {
  const firstButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) {
      // 聚焦管理：打开时聚焦在第一个色块上
      const timer = setTimeout(() => {
        firstButtonRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [open]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // 强制选色：Esc 键不关闭
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  return (
    <div
      className={`pt-picker ${open ? 'open' : ''} ${className ?? ''}`}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onKeyDown={handleKeyDown}
    >
      <div className="pt-picker__pad">
        <p>{title}</p>
        {COLORS.map(({ key, label }, idx) => (
          <button
            key={key}
            ref={idx === 0 ? firstButtonRef : undefined}
            type="button"
            data-pick={key}
            style={{ background: `var(--pt-${key})` }}
            onClick={() => onSelect(key)}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
};
