import { useEffect, useId, useRef, type ReactNode, type RefObject } from 'react';
import type { GameDrawerKind } from './types.ts';

interface GameDrawerProps {
  readonly kind: GameDrawerKind;
  readonly title: string;
  readonly triggerRef: RefObject<HTMLElement | null>;
  readonly onClose: () => void;
  readonly children: ReactNode;
}

export function GameDrawer({ kind, title, triggerRef, onClose, children }: GameDrawerProps) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', close);
    return () => { window.removeEventListener('keydown', close); triggerRef.current?.focus(); };
  }, [onClose, triggerRef]);
  return (
    <div className="tabletop-drawer-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <aside className={`tabletop-drawer tabletop-drawer--${kind}`} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header><h2 id={titleId}>{title}</h2><button ref={closeRef} type="button" onClick={onClose} aria-label="关闭抽屉">×</button></header>
        <div className="tabletop-drawer__content">{children}</div>
      </aside>
    </div>
  );
}
