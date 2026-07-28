import { useCallback, useState } from 'react';

export type ToastKind = 'info' | 'success' | 'error';

export interface Toast {
  id: string;
  message: string;
  kind: ToastKind;
}

const TOAST_TIMEOUT_MS = 2500;

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, kind: ToastKind = 'info') => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setToasts((prev) => [...prev, { id, message, kind }]);
      window.setTimeout(() => removeToast(id), TOAST_TIMEOUT_MS);
    },
    [removeToast],
  );

  return { toasts, showToast, removeToast };
}
