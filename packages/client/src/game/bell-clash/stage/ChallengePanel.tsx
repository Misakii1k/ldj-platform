import React from 'react';
import { PartyCard } from '../../party-table/PartyCard';
import type { BellClashPublicChallenge } from '../types';

export interface ChallengePanelProps {
  challenge: BellClashPublicChallenge;
  myId: string | null;
  nameOf: (playerId: string) => string;
  avatarOf: (playerId: string) => React.ReactNode;
  onVote: (doubt: boolean) => void;
  busy?: boolean;
  showNope?: boolean;
}

export const ChallengePanel: React.FC<ChallengePanelProps> = ({
  challenge,
  myId,
  nameOf,
  avatarOf,
  onVote,
  busy = false,
  showNope = false,
}) => {
  const isVoter = myId !== null && challenge.voterIds.includes(myId);
  const hasVoted =
    myId !== null &&
    (challenge.doubtIds.includes(myId) || challenge.confirmIds.includes(myId));

  return (
    <div className="bc-reveal" data-box="challenge-reveal">
      <div className="bc-reveal__card-wrap">
        <PartyCard
          card={{
            id: `challenge-${challenge.card.phrase}`,
            kind: 'phrase',
            color: challenge.card.color,
            phrase: challenge.card.phrase,
          }}
          className="bc-reveal__card"
        />
        {showNope && <div className="bc-nope">没人做过</div>}
      </div>

      <div className="bc-challenge">
        <b>真的有人这么做了吗？</b>
        <div className="bc-challenge__votes">
          {challenge.voterIds.map((voterId) => {
            const isOk = challenge.confirmIds.includes(voterId);
            const isDoubt = challenge.doubtIds.includes(voterId);
            const statusClass = isOk
              ? 'bc-vote--ok'
              : isDoubt
              ? 'bc-vote--doubt'
              : '';
            const statusText = isOk ? '有' : isDoubt ? '没做过' : '…';
            const name = nameOf(voterId);
            const initial = name.slice(0, 1);

            return (
              <div key={voterId} className={`bc-vote ${statusClass}`}>
                <i className="bc-vote__avatar">
                  {avatarOf(voterId) ?? initial}
                </i>
                <span>{name}</span>
                <em>{statusText}</em>
              </div>
            );
          })}
        </div>

        {isVoter && !hasVoted && (
          <div className="bc-challenge__actions">
            <button
              type="button"
              className="bc-btn bc-btn--vote-ok"
              disabled={busy}
              onClick={() => onVote(false)}
            >
              有
            </button>
            <button
              type="button"
              className="bc-btn bc-btn--vote-doubt"
              disabled={busy}
              onClick={() => onVote(true)}
            >
              没做过
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
