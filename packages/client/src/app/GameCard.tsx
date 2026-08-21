import { useState } from 'react';
import type { GameCatalogEntry } from '@ldj/shared';
import { Plus, Users } from 'lucide-react';

interface GameCardProps {
  game: GameCatalogEntry;
  onCreate: (game: GameCatalogEntry) => void;
}

function gameMark(gameId: string): string {
  switch (gameId) {
    case 'undercover': return '谁';
    case 'uno': return 'UNO';
    case 'landlord': return '斗';
    case 'werewolf': return '狼';
    case 'durian': return '榴';
    case 'loveletter': return '情';
    case 'cheese-thief': return '奶';
    case 'goose-relay': return '鹅';
    case 'night-testimony': return '证';
    case 'bell-clash': return '铃';
    case 'echo-judge': return '伪';
    default: return '玩';
  }
}

function playerRange(game: GameCatalogEntry): string {
  return game.minPlayers === game.maxPlayers
    ? `${game.minPlayers} 人`
    : `${game.minPlayers}–${game.maxPlayers} 人`;
}

function availabilityLabel(game: GameCatalogEntry): string {
  if (game.availability === 'playable') return '可以开局';
  if (game.availability === 'blocked_rights') return '暂未开放';
  if (game.availability === 'internal_prototype') return '体验版';
  return '敬请期待';
}

export function GameCard({ game, onCreate }: GameCardProps) {
  const isPlayable = game.availability === 'playable';
  const isFeatured = game.id === 'undercover';
  const [imgError, setImgError] = useState(false);

  return (
    <article className={`game-card game-card--${game.theme} ${isFeatured ? 'game-card--featured' : ''}`}>
      {isFeatured && <span className="game-card__ticket" aria-hidden="true">01</span>}
      <div className="game-card__meta">
        <span className={`game-card__availability ${isPlayable ? 'is-live' : ''}`}>
          {availabilityLabel(game)}
        </span>
        <span className="game-card__players">
          <Users size={14} strokeWidth={2.4} aria-hidden="true" />
          {playerRange(game)}
        </span>
      </div>
      <div className="game-card__illustration" aria-hidden="true">
        {!imgError ? (
          <div className="game-card__icon-wrap">
            <div className="game-card__icon-glow" />
            <img
              src={`/icons/${game.id}.png`}
              alt={game.displayName}
              className="game-card__icon-img"
              onError={() => setImgError(true)}
            />
          </div>
        ) : (
          <>
            <span className="game-card__card game-card__card--back">?</span>
            <span className="game-card__card game-card__card--front">{gameMark(game.id)}</span>
          </>
        )}
      </div>
      <h3>{game.displayName}</h3>
      <p className="game-card__summary">{game.summary}</p>
      <ul className="game-card__tags" aria-label={`${game.displayName} 标签`}>
        {game.tags.map((tag) => <li key={tag}>{tag}</li>)}
      </ul>
      {isPlayable ? (
        <button type="button" className="game-card__action" onClick={() => onCreate(game)}>
          <Plus size={18} strokeWidth={2.6} aria-hidden="true" />
          创建房间
        </button>
      ) : (
        <button type="button" className="game-card__action game-card__action--soon" disabled>
          {game.comingSoonMessage ?? '即将推出'}
        </button>
      )}
    </article>
  );
}

