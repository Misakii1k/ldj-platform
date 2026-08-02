import type { TabletopPlayer } from './types.ts';

export function PlayerStrip({ players }: { readonly players: readonly TabletopPlayer[] }) {
  const compact = players.length >= 8;
  return (
    <ol className={`tabletop-player-strip ${compact ? 'tabletop-player-strip--compact' : ''}`} aria-label="玩家席位">
      {players.map((player, index) => (
        <li key={player.id} className={`tabletop-player ${player.active ? 'is-active' : ''} ${player.eliminated ? 'is-eliminated' : ''}`}>
          <span className="tabletop-player__seat" aria-hidden="true">{index + 1}</span>
          <strong>{player.name}</strong>
          <span>{player.eliminated ? '已离场' : player.status}</span>
        </li>
      ))}
    </ol>
  );
}
