import type { TabletopAction } from './types.ts';

interface ActionDockProps {
  readonly primary?: TabletopAction | null;
  readonly secondary?: readonly TabletopAction[];
  readonly equalOptions?: readonly TabletopAction[];
  readonly busy?: boolean;
  readonly waitingReason?: string;
}

export function ActionDock({ primary, secondary = [], equalOptions, busy = false, waitingReason }: ActionDockProps) {
  const isEqual = Boolean(equalOptions && equalOptions.length > 0);
  return (
    <section
      className={`tabletop-action-dock ${isEqual ? 'tabletop-action-dock--equal' : ''}`}
      aria-label="本回合操作"
      aria-busy={busy}
    >
      {waitingReason && <p className="tabletop-action-dock__reason" role="status">{waitingReason}</p>}
      {isEqual ? (
        equalOptions!.map((action) => (
          <button
            key={action.id}
            type="button"
            className="tabletop-action"
            onClick={action.onAction}
            disabled={busy || action.disabled}
          >
            {action.label}
          </button>
        ))
      ) : (
        <>
          {primary && (
            <button
              type="button"
              className="tabletop-action tabletop-action--primary"
              onClick={primary.onAction}
              disabled={busy || primary.disabled}
            >
              {busy ? '处理中…' : primary.label}
            </button>
          )}
          {secondary.slice(0, 2).map((action) => (
            <button
              key={action.id}
              type="button"
              className="tabletop-action"
              onClick={action.onAction}
              disabled={busy || action.disabled}
            >
              {action.label}
            </button>
          ))}
        </>
      )}
    </section>
  );
}
