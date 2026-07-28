/** 结算页：揭示胜方、词语与所有玩家身份。 */
import { useState, type CSSProperties } from 'react';
import { useConnection } from '../connection/useConnection.ts';
import { describeError } from '../shared-ui/errors.ts';
import type { UndercoverPlayerView, PublicPlayerInfo } from './types.ts';

interface Props { view: UndercoverPlayerView; }
function roleLabel(role: 'civilian' | 'undercover'): string { return role === 'undercover' ? '卧底' : '平民'; }

export function GameOverView({ view }: Props) {
  const { me, send, state } = useConnection();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reveal = view.reveal;
  const isHost = me !== null && state.room !== null && state.room.members.some((member) => member.playerId === me.playerId && member.isHost);
  const myId = me?.playerId ?? null;

  async function handleReturnToLobby() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try { await send('room_command', { command: 'return_to_lobby' }); }
    catch (err) { setError(describeError(err)); }
    finally { setBusy(false); }
  }

  if (reveal === null) return <section className="game-phase game-over"><div className="game-waiting-card"><strong>正在整理结算档案</strong><p>马上揭晓本局身份。</p></div></section>;
  const winnerText = view.aborted ? '对局中止' : view.winner === 'civilian' ? '平民胜利' : view.winner === 'undercover' ? '卧底胜利' : '平局';
  const sortedPlayers = [...view.players].sort((left, right) => left.seat - right.seat);

  return (
    <section className={`game-phase game-over winner-${view.winner ?? 'draw'}`}>
      <div className="winner-hero">
        <span className="winner-rays" aria-hidden="true" />
        <span className="winner-kicker">CASE CLOSED · 真相揭晓</span>
        <h2 className="winner-title">{winnerText}</h2>
        <p>{view.aborted ? '本局未完成，身份档案仍已公开。' : view.winner === 'undercover' ? '卧底成功隐藏到了最后。' : '大家通过线索找出了隐藏的卧底。'}</p>
      </div>

      <div className="word-pair">
        <div className="word-item civilian"><span className="word-label">平民词</span><strong className="word-text">{reveal.civilianWord}</strong><span className="word-corner">CIVILIAN</span></div>
        <div className="word-item undercover"><span className="word-label">卧底词</span><strong className="word-text">{reveal.undercoverWord}</strong><span className="word-corner">UNDERCOVER</span></div>
      </div>

      <div className="reveal-box">
        <div className="section-heading-row"><div><span className="section-kicker">全员档案</span><h3>身份揭示</h3></div><span className="section-count">{sortedPlayers.length} 人</span></div>
        <ul className="roles-list">
          {sortedPlayers.map((player: PublicPlayerInfo, index) => {
            const role = reveal.roles[player.playerId];
            const isMe = player.playerId === myId;
            return (
              <li key={player.playerId} className={`role-item ${role ?? 'unknown'} ${!player.alive ? 'dead' : ''}`} style={{ '--stagger-index': index } as CSSProperties}>
                <span className="role-avatar" aria-hidden="true" />
                <span className="role-seat">#{player.seat}</span>
                <span className="role-name"><strong>{isMe ? '我' : `玩家 ${player.seat}`}</strong><small>{!player.alive ? '本局已淘汰' : '存活至结算'}</small></span>
                <span className={`role-badge ${role ?? ''}`}>{role ? roleLabel(role) : '未知'}</span>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="game-action-dock">
        {isHost ? <button type="button" className="game-primary-action" onClick={handleReturnToLobby} disabled={busy || state.connState !== 'synced'}>{busy ? '正在返回…' : '返回房间大厅'}</button> : <div className="waiting-host">等待房主返回大厅</div>}
        <span>{isHost ? '可以调整设置后再开一局' : '房主操作后将自动返回'}</span>
      </div>
      {error && <div className="error-banner" role="alert">{error}</div>}
    </section>
  );
}
