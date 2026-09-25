import { useEffect, useId, useRef, type ReactNode, type RefObject } from 'react';
import ReactDOM from 'react-dom';
import type { GameDrawerKind } from './types.ts';

interface GameDrawerProps {
  readonly className?: string;
  readonly kind: GameDrawerKind;
  readonly title: string;
  readonly triggerRef: RefObject<HTMLElement | null>;
  readonly onClose: () => void;
  readonly children: ReactNode;
}

export function GameDrawer({ kind, title, triggerRef, onClose, children, className = '' }: GameDrawerProps) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    closeRef.current?.focus();
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onCloseRef.current(); }
      if (event.key !== 'Tab') return;
      const items = Array.from(panelRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, [tabindex="0"]') ?? []).filter((item) => item.getClientRects().length > 0);
      const first = items[0]; const last = items[items.length - 1];
      if (event.shiftKey && (document.activeElement === first || !panelRef.current?.contains(document.activeElement))) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !panelRef.current?.contains(document.activeElement))) { event.preventDefault(); first?.focus(); }
    };
    window.addEventListener('keydown', close);
    return () => { window.removeEventListener('keydown', close); triggerRef.current?.focus(); };
  }, [triggerRef]);

  return ReactDOM.createPortal(
    <div
      className={`tabletop-drawer-backdrop ${className}`}
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <aside
        ref={panelRef}
        className={`tabletop-drawer tabletop-drawer--${kind}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header>
          <h2 id={titleId}>{title}</h2>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="关闭抽屉">
            ×
          </button>
        </header>
        <div className="tabletop-drawer__content">{children}</div>
      </aside>
    </div>,
    document.body,
  );
}
