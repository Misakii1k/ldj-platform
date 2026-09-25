import { useEffect, useId, useRef, type ReactNode, type RefObject } from 'react';
import ReactDOM from 'react-dom';

interface DurianTurnSheetProps {
  readonly title: string;
  readonly triggerRef: RefObject<HTMLElement | null>;
  readonly onDismiss: () => void;
  readonly children: ReactNode;
  /** 收起后用于重新打开的按钮文案（例如"继续我的回合"）。 */
  readonly resumeLabel?: string;
}

/**
 * 榴莲「自己的回合」可收起操作窗。
 *
 * 刻意不复用 GameDrawer：抽屉带全屏遮罩，会挡住桌面牌列；而玩家在做决策时
 * 需要一边看桌面累计需求、一边选生效半边。这里做成底部浮层，桌面保持可见。
 * 焦点陷阱、ESC、遮罩点击等可访问性行为与 GameDrawer 保持一致。
 */
export function DurianTurnSheet({
  title,
  triggerRef,
  onDismiss,
  children,
  resumeLabel = '继续我的回合',
}: DurianTurnSheetProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLElement>(null);
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;

  useEffect(() => {
    const restoreTo = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        dismissRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const items = Array.from(
        panelRef.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]',
        ) ?? [],
      ).filter((item) => item.getClientRects().length > 0);
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && (document.activeElement === first || !panelRef.current?.contains(document.activeElement))) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !panelRef.current?.contains(document.activeElement))) {
        event.preventDefault();
        first?.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      const fallback = triggerRef.current;
      if (fallback?.isConnected) fallback.focus();
      else if (restoreTo?.isConnected) restoreTo.focus();
    };
  }, [triggerRef]);

  return ReactDOM.createPortal(
    <div
      className="durian-turn-sheet-backdrop durian-turn-sheet-backdrop--passthrough"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) dismissRef.current();
      }}
    >
      <section
        ref={panelRef}
        className="durian-turn-sheet"
        role="dialog"
        aria-modal="false"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <header className="durian-turn-sheet__header">
          <h2 id={titleId} className="durian-turn-sheet__title">{title}</h2>
          <button type="button" className="durian-turn-sheet__dismiss" onClick={() => dismissRef.current()}>
            {resumeLabel === '继续我的回合' ? '收起看桌面' : resumeLabel}
          </button>
        </header>
        <div className="durian-turn-sheet__body">{children}</div>
      </section>
    </div>,
    document.body,
  );
}
