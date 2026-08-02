import { useEffect, useState, type ReactNode } from 'react';
import { reducePrivatePanelState } from './privateState.ts';

interface PrivatePanelProps {
  readonly allowed: boolean;
  readonly synced: boolean;
  readonly children: ReactNode;
}

export function PrivatePanel({ allowed, synced, children }: PrivatePanelProps) {
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    if (!synced) setRevealed((value) => reducePrivatePanelState(value, { type: 'disconnect' }));
  }, [synced]);
  useEffect(() => {
    const hide = () => setRevealed(false);
    const visibility = () => { if (document.visibilityState === 'hidden') hide(); };
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('blur', hide);
    return () => { document.removeEventListener('visibilitychange', visibility); window.removeEventListener('blur', hide); };
  }, []);
  return (
    <section className={`tabletop-private ${revealed ? 'is-revealed' : ''}`}>
      {revealed ? children : <button type="button" onClick={() => setRevealed(reducePrivatePanelState(false, { type: 'reveal', allowed, synced }))} disabled={!allowed || !synced}>按下查看本人私密信息</button>}
    </section>
  );
}
