import { PlayerStrip } from './PlayerStrip.tsx';
import type { TabletopShellProps } from './types.ts';

export function TabletopShell({ title, phase, spectator, players, actions, drawer, children }: TabletopShellProps) {
  return (
    <main className="tabletop-shell">
      <header className="tabletop-shell__header">
        <div><span className="tabletop-shell__eyebrow">TABLE SESSION</span><h1>{title}</h1></div>
        <div className="tabletop-shell__phase"><span>{phase}</span>{spectator && <strong>观战</strong>}</div>
      </header>
      <PlayerStrip players={players} />
      <section className="tabletop-surface">{children}</section>
      {actions}
      {drawer}
    </main>
  );
}
