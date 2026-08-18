import type { Toast } from './useToast.ts';

interface ToastContainerProps {
  toasts: Toast[];
  onClose?: (id: string) => void;
}

export function ToastContainer({ toasts, onClose }: ToastContainerProps) {
  if (toasts.length === 0) return null;

  return (
    <div
      className="toast-container"
      role="region"
      aria-live="polite"
      aria-label="通知"
    >
      {toasts.map((toast) => {
        const icon =
          toast.kind === 'error' ? '🚨' : toast.kind === 'success' ? '🎉' : '📢';

        return (
          <div
            key={toast.id}
            className={`toast toast-${toast.kind}`}
            role={toast.kind === 'error' ? 'alert' : 'status'}
          >
            <span className="toast-icon" aria-hidden="true">
              {icon}
            </span>
            <span className="toast-message">{toast.message}</span>
            {onClose && (
              <button
                type="button"
                className="toast-close"
                aria-label="关闭通知"
                onClick={() => onClose(toast.id)}
              >
                ×
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
