import type { GameCatalogEntry } from '@ldj/shared';

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
    case 'avalon': return 'A';
    default: return '玩';
  }
}

function playerRange(game: GameCatalogEntry): string {
  return game.minPlayers === game.maxPlayers
    ? `${game.minPlayers} 人`
    : `${game.minPlayers}–${game.maxPlayers} 人`;
}

export function GameCard({ game, onCreate }: GameCardProps) {
  const isPlayable = game.availability === 'playable';
  const isFeatured = game.id === 'undercover';

  return (
    <article className={`game-card game-card--${game.theme} ${isFeatured ? 'game-card--featured' : ''}`}>
      {isFeatured && <span className="game-card__ticket" aria-hidden="true">01</span>}
      <div className="game-card__meta">
        <span className={`game-card__availability ${isPlayable ? 'is-live' : ''}`}>
          {isPlayable ? '首发游戏' : '即将推出'}
        </span>
        <span className="game-card__players">{playerRange(game)}</span>
      </div>
      <div className="game-card__illustration" aria-hidden="true">
        <span className="game-card__card game-card__card--back">?</span>
        <span className="game-card__card game-card__card--front">{gameMark(game.id)}</span>
      </div>
      <h3>{game.displayName}</h3>
      <p className="game-card__summary">{game.summary}</p>
      <ul className="game-card__tags" aria-label={`${game.displayName} 标签`}>
        {game.tags.map((tag) => <li key={tag}>{tag}</li>)}
      </ul>
      {isPlayable ? (
        <button type="button" className="game-card__action" onClick={() => onCreate(game)}>
          创建房间
          <span aria-hidden="true">→</span>
        </button>
      ) : (
        <button type="button" className="game-card__action game-card__action--soon" disabled>
          {game.comingSoonMessage ?? '即将推出'}
        </button>
      )}
    </article>
  );
}
