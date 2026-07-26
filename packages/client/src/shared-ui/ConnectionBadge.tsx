import { getConnectionPresentation, type ConnectionState } from '../connection/connection-state';

interface ConnectionBadgeProps {
  state: ConnectionState;
}

export function ConnectionBadge({ state }: ConnectionBadgeProps) {
  const presentation = getConnectionPresentation(state);

  return (
    <div className={`connection-badge connection-badge--${presentation.tone}`} role="status" aria-live="polite">
      <span className="connection-badge__dot" aria-hidden="true" />
      <span>
        <strong>{presentation.label}</strong>
        <small>{presentation.detail}</small>
      </span>
    </div>
  );
}
