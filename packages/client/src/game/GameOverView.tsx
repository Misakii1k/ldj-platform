/**
 * 结算页（Task 4）：揭示胜方、所有玩家角色、两词；房主可"返回大厅"。
 * 仅 game_over 阶段使用；reveal 不为 null。
 */
import { useState } from 'react';
import { useConnection } from '../connection/useConnection.ts';
import { describeError } from '../shared-ui/errors.ts';
import type { UndercoverPlayerView, PublicPlayerInfo } from './types.ts';

interface Props {
  view: UndercoverPlayerView;
}

function roleLabel(role: 'civilian' | 'undercover'): string {
  return role === 'undercover' ? '卧底' : '平民';
}

export function GameOverView({ view }: Props) {
  const { me, send, state } = useConnection();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reveal = view.reveal;
  const isHost =
    me !== null && state.room !== null &&
    state.room.members.some((m) => m.playerId === me.playerId && m.isHost);
  const myId = me?.playerId ?? null;

  async function handleReturnToLobby() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await send('room_command', { command: 'return_to_lobby' });
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  }

  if (reveal === null) {
    return (
      <section className="game-phase game-over">
        <h2>对局结束</h2>
        <p>正在加载结算信息…</p>
      </section>
    );
  }

  const winnerText = view.aborted
    ? '对局中止'
    : view.winner === 'civilian'
      ? '平民胜利'
      : view.winner === 'undercover'
        ? '卧底胜利'
        : '平局';

  const sortedPlayers = [...view.players].sort((a, b) => a.seat - b.seat);

  return (
    <section className="game-phase game-over">
      <h2 className="winner-title">{winnerText}</h2>

      <div className="reveal-box">
        <div className="word-pair">
          <div className="word-item civilian">
            <span className="word-label">平民词</span>
            <span className="word-text">{reveal.civilianWord}</span>
          </div>
          <div className="word-item undercover">
            <span className="word-label">卧底词</span>
            <span className="word-text">{reveal.undercoverWord}</span>
          </div>
        </div>

        <h3>身份揭示</h3>
        <ul className="roles-list">
          {sortedPlayers.map((p: PublicPlayerInfo) => {
            const role = reveal.roles[p.playerId];
            const isMe = p.playerId === myId;
            return (
              <li key={p.playerId} className={`role-item ${role ?? 'unknown'} ${!p.alive ? 'dead' : ''}`}>
                <span className="role-seat">#{p.seat}</span>
                <span className="role-name">{isMe ? '我' : `玩家 ${p.seat}`}</span>
                <span className={`role-badge ${role ?? ''}`}>
                  {role ? roleLabel(role) : '未知'}
                </span>
                {!p.alive && <span className="role-exit">已淘汰</span>}
              </li>
            );
          })}
        </ul>
      </div>

      {isHost && (
        <button
          type="button"
          className="primary-btn"
          onClick={handleReturnToLobby}
          disabled={busy || state.connState !== 'synced'}
        >
          {busy ? '处理中…' : '返回大厅'}
        </button>
      )}

      {!isHost && (
        <p className="waiting-host">等待房主返回大厅</p>
      )}

      {error && <div className="error-banner" role="alert">{error}</div>}
    </section>
  );
}
