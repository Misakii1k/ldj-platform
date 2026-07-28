import { useEffect, useId, useRef, type ReactNode } from 'react';

interface SheetDialogProps {
  title: string;
  description?: string;
  onClose: () => void;
  initialFocusRef: { readonly current: HTMLElement | null };
  children: ReactNode;
}

/** 主页弹层共用外壳：移动端底部抽屉，宽屏时居中对话框。 */
export function SheetDialog({
  title,
  description,
  onClose,
  initialFocusRef,
  children,
}: SheetDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const focusTimer = window.setTimeout(() => initialFocusRef.current?.focus(), 0);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener('keydown', handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [initialFocusRef]);

  return (
    <div
      className="sheet-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="room-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
      >
        <div className="room-sheet__handle" aria-hidden="true" />
        <header className="room-sheet__header">
          <div>
            <h2 id={titleId}>{title}</h2>
            {description && <p id={descriptionId}>{description}</p>}
          </div>
          <button type="button" className="room-sheet__close" onClick={onClose} aria-label="关闭弹层">
            ×
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}
