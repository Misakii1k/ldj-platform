import { useMemo, useState } from 'react';
import {
  listGamesForPlayerCount,
  type GameCatalogEntry,
  type PlayerCount,
} from '@ldj/shared';
import { useConnection } from '../connection/useConnection.ts';
import { CreateRoomSheet } from './CreateRoomSheet.tsx';
import { GameCard } from './GameCard.tsx';
import { HomePartyScene } from './HomePartyScene.tsx';
import { JoinRoomSheet } from './JoinRoomSheet.tsx';
import { PlayerCountFilter } from './PlayerCountFilter.tsx';

type ActiveSheet = 'create' | 'join' | null;

export function GameHomePage() {
  const { state } = useConnection();
  const [selectedCount, setSelectedCount] = useState<PlayerCount | null>(null);
  const [selectedGame, setSelectedGame] = useState<GameCatalogEntry | null>(null);
  const [activeSheet, setActiveSheet] = useState<ActiveSheet>(null);

  const games = useMemo(() => listGamesForPlayerCount(selectedCount), [selectedCount]);
  const playableGames = games.filter((game) => game.availability === 'playable');
  const isConnected = state.connState === 'connected' || state.connState === 'synced';

  function openCreateSheet(game: GameCatalogEntry) {
    setSelectedGame(game);
    setActiveSheet('create');
  }

  function closeSheet() {
    setActiveSheet(null);
  }

  const sectionTitle = selectedCount === null
    ? '挑一局，马上开玩'
    : `${selectedCount} 人到齐，可以玩这些`;

  return (
    <main className="game-home-page" data-player-count={selectedCount ?? 'all'}>
      <HomePartyScene selectedCount={selectedCount} />
      <div className="game-home-page__content">
        <header className="home-header">
          <div className="home-brand" aria-label="闹一桌">
            <span className="home-brand__tile" aria-hidden="true">闹</span>
            <span className="home-brand__name">闹一桌</span>
          </div>
          <div className="home-header__actions">
            <span className="home-local-badge">局域网限定</span>
            <button type="button" className="home-join-link" onClick={() => setActiveSheet('join')}>
              加入房间
            </button>
          </div>
        </header>

        <section className="home-hero" aria-labelledby="home-title">
          <p className="home-hero__eyebrow">手机就是你的手牌</p>
          <h1 id="home-title">人到齐，<span>就开局。</span></h1>
          <p className="home-hero__description">
            不用下载，不用注册。连上同一个 Wi-Fi，和身边的朋友面对面玩。
          </p>
        </section>

        <PlayerCountFilter selectedCount={selectedCount} onChange={setSelectedCount} />

        <section className="home-games" aria-labelledby="game-list-title">
          <div className="home-games__heading">
            <div>
              <p className="home-games__eyebrow">游戏目录</p>
              <h2 id="game-list-title">{sectionTitle}</h2>
            </div>
            <span className="home-games__count">{games.length} 款</span>
          </div>
          {playableGames.length === 0 && (
            <p className="home-games__notice" role="status">
              这个人数的可玩游戏正在准备中，先看看即将登场的牌局吧。
            </p>
          )}
          <div className="game-grid">
            {games.map((game) => (
              <GameCard key={`${game.id}-${selectedCount ?? 'all'}`} game={game} onCreate={openCreateSheet} />
            ))}
          </div>
        </section>

        <section className="home-join-callout" aria-label="已有房间码">
          <div className="home-join-callout__icon" aria-hidden="true">⌁</div>
          <div>
            <h2>朋友已经建好房？</h2>
            <p>输入 5 位房间码，直接加入这一桌。</p>
          </div>
          <button type="button" onClick={() => setActiveSheet('join')}>加入房间 <span aria-hidden="true">→</span></button>
        </section>

        <footer className="home-footer">
          <div className={`home-connection ${isConnected ? 'is-connected' : ''}`} role="status" aria-live="polite">
            <span className="home-connection__dot" aria-hidden="true" />
            <div>
              <strong>{isConnected ? '已连接' : '正在连接'}</strong>
              <span>{isConnected ? '同一局域网内的朋友可以加入。' : '正在和局域网服务器打个招呼…'}</span>
            </div>
          </div>
          <p>R1 · 只在这张桌上玩</p>
        </footer>
      </div>

      {activeSheet === 'create' && selectedGame && (
        <CreateRoomSheet game={selectedGame} onClose={closeSheet} />
      )}
      {activeSheet === 'join' && <JoinRoomSheet onClose={closeSheet} />}
    </main>
  );
}