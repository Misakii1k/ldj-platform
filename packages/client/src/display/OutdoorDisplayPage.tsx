import { useCallback, useMemo } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useConnection } from '../connection/useConnection.ts';
import './outdoor-display.css';

const GAME_CHINESE_NAMES: Record<string, string> = {
  werewolf: '狼人杀',
  durian: '榴莲',
  cheese_thief: '奶酪大盗',
  undercover: '谁是卧底',
  love_letter: '情书',
  uno: 'UNO',
  bell_clash: '德国心脏病',
};

interface FactItem {
  readonly label: string;
  readonly value: string | number;
  readonly unit: string;
}

export function OutdoorDisplayPage() {
  const { state } = useConnection();
  const room = state.room;
  const game = state.game;

  const roomCode = useMemo(() => {
    if (room?.roomCode) return room.roomCode;
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const queryRoom = params.get('room');
      if (queryRoom) return queryRoom.toUpperCase();
    }
    return '8241';
  }, [room?.roomCode]);

  const joinUrl = useMemo(() => {
    if (typeof window === 'undefined') return '';
    return `${window.location.origin}/join/${roomCode}`;
  }, [roomCode]);

  const isPlaying = room?.status === 'IN_GAME' || (room?.status === 'POST_GAME' && game !== null);
  const statusKey = isPlaying ? (room?.gameId === 'durian' ? 'durian' : 'playing') : 'waiting';
  const statusText = isPlaying ? '正在进行' : '等待开局';

  const gameTitle = useMemo(() => {
    if (!room?.gameId) return '聚乐桌游';
    return GAME_CHINESE_NAMES[room.gameId] || room.gameId;
  }, [room?.gameId]);

  const roomConfig = room?.config as Record<string, unknown> | null | undefined;
  const configuredLimit = typeof roomConfig?.playerLimit === 'number' ? roomConfig.playerLimit : 12;

  const subTitle = useMemo(() => {
    if (!isPlaying) {
      return `${configuredLimit} 人局 · 人齐即发牌 · 欢迎入座`;
    }
    if (room?.gameId === 'werewolf') {
      return '经典场 · 正在进行白天与夜间对弈';
    }
    if (room?.gameId === 'durian') {
      return '水果生意 · 桌面需求持续累计中';
    }
    return '精彩对局正在进行中';
  }, [isPlaying, configuredLimit, room?.gameId]);

  const hintText = useMemo(() => {
    if (!isPlaying) return '还差几个人，扫码坐下就能开。';
    if (room?.gameId === 'durian') return '水果生意，心里有数。';
    if (room?.gameId === 'werewolf') return '天黑请闭眼，欢迎围观这一桌。';
    return '开一局，坐下来就好。';
  }, [isPlaying, room?.gameId]);

  const memberCount = room?.members?.length ?? 1;

  const facts: FactItem[] = useMemo(() => {
    if (!isPlaying) {
      return [
        { label: '已入座', value: memberCount, unit: '人' },
        { label: '需要', value: configuredLimit, unit: '人' },
        { label: '模式', value: '标准', unit: '场' },
      ];
    }
    return [
      { label: '在座', value: memberCount, unit: '人' },
      { label: '状态', value: '激战中', unit: '' },
      { label: '房间', value: roomCode, unit: '' },
    ];
  }, [isPlaying, memberCount, configuredLimit, roomCode]);

  const handleExitDisplay = useCallback(() => {
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.delete('display');
      url.searchParams.delete('view');
      window.location.href = url.toString();
    }
  }, []);

  return (
    <main className="dx-screen" aria-label="朝外展示牌">
      <header className="dx-nav">
        <div className="dx-nav__brand">
          <img src="/icon-192.png" alt="" width="36" height="36" style={{ borderRadius: '8px' }} />
          <div>
            <strong>聚乐 · 朝外展示牌</strong>
            <small>OUTDOOR SHOWCASE</small>
          </div>
        </div>
        <button
          type="button"
          className="dx-nav__close"
          onClick={handleExitDisplay}
          title="退出展示牌并返回游戏桌面"
        >
          返回桌面 ✕
        </button>
      </header>

      <div className="dx-layout">
        <section className="dx-hero" aria-live="polite">
          <span className="dx-status" data-state={statusKey}>
            {statusText}
          </span>
          <h1>{gameTitle}</h1>
          <p className="dx-sub">{subTitle}</p>
        </section>

        <section className="dx-facts" aria-label="桌况概览">
          {facts.map((fact) => (
            <div key={fact.label} className="dx-fact">
              <span>{fact.label}</span>
              <b>{fact.value}</b>
              {fact.unit && <em>{fact.unit}</em>}
            </div>
          ))}
        </section>

        <section className="dx-join" aria-label="加入方式">
          <div className="dx-room">
            <span>房间号</span>
            <b>{roomCode}</b>
            <small>在手机浏览器或 App 内输入房间号加入</small>
          </div>

          <div className="dx-qr-box">
            <div className="dx-qr-box__graphic" aria-label="加入房间二维码">
              <QRCodeSVG
                value={joinUrl}
                size={96}
                level="M"
                bgColor="#ffffff"
                fgColor="#292722"
              />
            </div>
            <div className="dx-qr-box__text">
              <strong>扫码立即加入房间</strong>
              <small>同局域网内免下载扫码直连，手机就是专属手牌</small>
            </div>
          </div>
        </section>

        <footer className="dx-foot">
          <p>
            这块屏朝外摆放，只展示公开信息：正在玩什么、进行到哪一步、怎么加入。
            <b>不会出现任何人的身份、手牌或投票细节。</b>
          </p>
          <p className="dx-hint">{hintText}</p>
        </footer>
      </div>
    </main>
  );
}
