import type { WerewolfPresentationModel } from '../presentation.ts';

export function GameOverReveal({ reveal }: { reveal: WerewolfPresentationModel['reveal'] }) {
  if (reveal === null) return null;
  return (
    <section className="werewolf-reveal" aria-label="终局复盘">
      <h2>{reveal.headline}</h2>
      <ul>
        {reveal.rows.map((row) => (
          <li key={row.name}>
            <span>{row.name}</span>
            <strong>{row.roleLabel}</strong>
          </li>
        ))}
      </ul>
    </section>
  );
}
