import type { WerewolfPresentationModel } from '../presentation.ts';

interface VoteLedgerProps {
  readonly progress: WerewolfPresentationModel['voteProgress'];
  readonly ledger: WerewolfPresentationModel['voteLedger'];
}

export function VoteLedger({ progress, ledger }: VoteLedgerProps) {
  if (progress === null && ledger === null) return null;

  return (
    <section className="vote-ledger" aria-label="投票信息">
      {progress && (
        <p className="vote-ledger__progress">
          已投票 <strong>{progress.submitted}</strong> / {progress.expected}
        </p>
      )}
      {ledger && (
        <>
          <h2 className="vote-ledger__headline">{ledger.headline}</h2>
          {ledger.rows.length === 0 ? (
            <p className="vote-ledger__empty">本轮没有有效票</p>
          ) : (
            <ul className="vote-ledger__rows">
              {ledger.rows.map((row) => (
                <li key={row.name} className="vote-ledger__row-item">
                  <span className="vote-ledger__candidate-name">{row.name}</span>
                  <strong className="vote-ledger__candidate-count">{row.count} 票</strong>
                </li>
              ))}
            </ul>
          )}
          <p className="vote-ledger__abstain">弃票 {ledger.abstained}</p>
        </>
      )}
    </section>
  );
}
