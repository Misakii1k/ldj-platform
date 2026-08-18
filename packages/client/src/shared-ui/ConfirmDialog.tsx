/**
 * 共享确认弹窗（P1-6）：替代原生 confirm()。
 * 采用 React Portal 挂载到 document.body，避免受父容器 transform / overflow 限制
 */
import { useId } from 'react';
import { createPortal } from 'react-dom';

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel: string;
  secondaryLabel?: string;
  busy?: boolean;
  destructive?: boolean;
  onConfirm: () => void;
  onSecondary?: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  secondaryLabel,
  busy = false,
  destructive = false,
  onConfirm,
  onSecondary,
  onCancel,
}: ConfirmDialogProps) {
  const titleId = useId();

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="confirm-dialog-backdrop"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel();
      }}
    >
      <section className="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby={titleId}>
        <h2 id={titleId}>{title}</h2>
        <p>{message}</p>
        <div className="confirm-dialog__actions">
          <button type="button" className="confirm-btn confirm-btn--cancel" onClick={onCancel} disabled={busy}>
            取消
          </button>
          {secondaryLabel && onSecondary && (
            <button
              type="button"
              className="confirm-btn confirm-btn--danger"
              onClick={onSecondary}
              disabled={busy}
            >
              {busy ? '处理中…' : secondaryLabel}
            </button>
          )}
          <button
            type="button"
            className={`confirm-btn ${destructive ? 'confirm-btn--danger' : 'confirm-btn--primary'}`}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? '处理中…' : confirmLabel}
          </button>
        </div>
      </section>
    </div>,
    document.body,
  );
}
