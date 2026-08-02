import { useMemo, useRef, useState } from 'react';
import { ArrowRight, Gamepad2, LogIn, Settings } from 'lucide-react';
import {
  listGamesForPlayerCount,
  type GameCatalogEntry,
  type PlayerCount,
} from '@ldj/shared';
import { useConnection } from '../connection/useConnection.ts';
import { useMotion } from '../motion/MotionContext.tsx';
import { useHomeParallax } from '../motion/useHomeParallax.ts';
import { CreateRoomSheet } from './CreateRoomSheet.tsx';
import { GameCard } from './GameCard.tsx';
import { HomePartyScene } from './HomePartyScene.tsx';
import { JoinRoomSheet } from './JoinRoomSheet.tsx';
import { PlayerCountFilter } from './PlayerCountFilter.tsx';
import { SettingsSheet } from './SettingsSheet.tsx';

type ActiveSheet = 'create' | 'join' | 'settings' | null;

export function GameHomePage() {
  const { state } = useConnection();
  const { level } = useMotion();
  const pageRef = useRef<HTMLElement | null>(null);
  const [selectedCount, setSelectedCount] = useState<PlayerCount | null>(null);
  const [selectedGame, setSelectedGame] = useState<GameCatalogEntry | null>(null);
  const [activeSheet, setActiveSheet] = useState<ActiveSheet>(null);

  const games = useMemo(() => listGamesForPlayerCount(selectedCount), [selectedCount]);
  const playableGames = games.filter((game) => game.availability === 'playable');
  const isConnected = state.connState === 'connected' || state.connState === 'synced';
  useHomeParallax(pageRef, level === 'full');

  function openCreateSheet(game: GameCatalogEntry) {
    setSelectedGame(game);
    setActiveSheet('create');
  }

  function closeSheet() {
    setActiveSheet(null);
  }

  const sectionTitle = selectedCount === null
    ? '选一款，马上开局'
    : `适合 ${selectedCount} 位玩家的玩法`;

  return (
    <main ref={pageRef} className="game-home-page" data-player-count={selectedCount ?? 'all'} data-motion-level={level}>
      <HomePartyScene selectedCount={selectedCount} />
      <div className="game-home-page__content">
        <header className="home-header home-motion-layer" data-motion-step="0">
          <div className="home-brand" aria-label="闹一桌">
            <span className="home-brand__tile" aria-hidden="true">闹</span>
            <span className="home-brand__name">闹一桌</span>
          </div>
          <div className="home-header__actions">
            <span className="home-local-badge">局域网极速联机</span>
            <button
              type="button"
              className="home-header__button"
              onClick={() => setActiveSheet('settings')}
              aria-label="打开设置"
              title="设置"
            >
              <Settings size={18} strokeWidth={2.4} aria-hidden="true" />
              <span>设置</span>
            </button>
            <button
              type="button"
              className="home-header__button home-header__button--join"
              onClick={() => setActiveSheet('join')}
              title="加入现有对局"
            >
              <LogIn size={18} strokeWidth={2.4} aria-hidden="true" />
              <span>加入对局</span>
            </button>
          </div>
        </header>

        <section className="home-hero home-motion-layer" data-motion-step="1" aria-labelledby="home-title">
          <p className="home-hero__eyebrow">扫码即玩 · 手机就是专属手牌</p>
          <h1 id="home-title">好友到齐，<span>即刻开局。</span></h1>
          <p className="home-hero__description">
            无需下载与繁琐注册。连上同一个局域网，与身边的朋友面对面开局畅玩！
          </p>
          <div className="home-hero__actions">
            <a className="home-hero__primary" href="#game-catalog">
              <Gamepad2 size={19} strokeWidth={2.5} aria-hidden="true" />
              挑选游戏
            </a>
            <button type="button" onClick={() => setActiveSheet('join')}>
              <LogIn size={18} strokeWidth={2.5} aria-hidden="true" />
              输入房间码
            </button>
          </div>
        </section>

        <div className="home-motion-layer" data-motion-step="2">
          <PlayerCountFilter selectedCount={selectedCount} onChange={setSelectedCount} />
        </div>

        <section id="game-catalog" className="home-games home-motion-layer" data-motion-step="3" aria-labelledby="game-list-title">
          <div className="home-games__heading">
            <div>
              <p className="home-games__eyebrow">游戏目录</p>
              <h2 id="game-list-title">{sectionTitle}</h2>
            </div>
            <span className="home-games__count">共 {games.length} 款精选</span>
          </div>
          {playableGames.length === 0 && (
            <p className="home-games__notice" role="status">
              适合当前人数的可玩游戏正在全力准备中，不妨看看即将登场的特色玩法。
            </p>
          )}
          <div className="game-grid">
            {games.map((game) => (
              <GameCard key={`${game.id}-${selectedCount ?? 'all'}`} game={game} onCreate={openCreateSheet} />
            ))}
          </div>
        </section>

        <section className="home-join-callout home-motion-layer" data-motion-step="4" aria-label="已有房间码">
          <div className="home-join-callout__icon" aria-hidden="true">
            <LogIn size={23} strokeWidth={2.5} />
          </div>
          <div>
            <h2>好友已经建好房间？</h2>
            <p>输入 5 位房间码，一键切入战局。</p>
          </div>
          <button type="button" onClick={() => setActiveSheet('join')}>
            加入此桌
            <ArrowRight size={18} strokeWidth={2.5} aria-hidden="true" />
          </button>
        </section>

        <footer className="home-footer home-motion-layer" data-motion-step="5">
          <div className={`home-connection ${isConnected ? 'is-connected' : ''}`} role="status" aria-live="polite">
            <span className="home-connection__dot" aria-hidden="true" />
            <div>
              <strong>{isConnected ? '已在线' : '连接中'}</strong>
              <span>{isConnected ? '局域网连接顺畅，附近好友可随时加入！' : '正在建立局域网服务器连接…'}</span>
            </div>
          </div>
          <p>局域网桌游平台 · 属于你们的聚会时光</p>
        </footer>
      </div>

      {activeSheet === 'create' && selectedGame && (
        <CreateRoomSheet game={selectedGame} onClose={closeSheet} />
      )}
      {activeSheet === 'join' && <JoinRoomSheet onClose={closeSheet} />}
      {activeSheet === 'settings' && <SettingsSheet onClose={closeSheet} />}
    </main>
  );
}
