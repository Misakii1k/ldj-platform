import { useState, type CSSProperties } from 'react';
import { useConnection } from '../connection/useConnection.ts';
import { describeError } from '../shared-ui/errors.ts';
import { ConfettiEffect } from '../shared-ui/ConfettiEffect.tsx';
import { UserAvatar } from '../user/UserAvatar.tsx';
import { useUserProfile } from '../user/UserProfileContext.tsx';
import { nameFor } from './useGameAction.ts';
import type { UndercoverPlayerView, PublicPlayerInfo } from './types.ts';

interface Props { view: UndercoverPlayerView; }
function roleLabel(role: 'civilian' | 'undercover'): string { return role === 'undercover' ? '卧底' : '平民'; }

export function GameOverView({ view }: Props) {
  const { profile } = useUserProfile();
  const { me, send, state } = useConnection();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reveal = view.reveal;
  const isHost = me !== null && state.room !== null && (state.room.members ?? []).some((member) => member.playerId === me.playerId && member.isHost);
  const myId = me?.playerId ?? null;
  const members = state.room?.members ?? [];

  async function handleReturnToLobby() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try { await send('room_command', { command: 'return_to_lobby' }); }
    catch (err) { setError(describeError(err)); }
    finally { setBusy(false); }
  }

  if (reveal === null) {
    return (
      <section className="game-phase game-over uc-stage__body">
        <div className="game-waiting-card">
          <span className="waiting-orbit" aria-hidden="true" />
          <strong>正在整理结算档案</strong>
          <p>请稍候，马上揭晓全员身份。</p>
        </div>
      </section>
    );
  }

  const winnerText = view.aborted ? '对局已中止' : view.winner === 'civilian' ? '平民阵营胜利！' : view.winner === 'undercover' ? '卧底阵营胜利！' : '双方平局！';
  const sortedPlayers = [...(view.players ?? [])].sort((left, right) => left.seat - right.seat);

  return (
    <section className={`game-phase game-over winner-${view.winner ?? 'draw'} uc-stage__body`}>
      <ConfettiEffect active={Boolean(view.winner && !view.aborted)} />

      <div className="uc-gameover-main-grid">
        <div className="uc-gameover-left-col">
          <div className="winner-hero">
            <span className="winner-rays" aria-hidden="true" />
            <span className="winner-tag">对局已结算</span>
            <h2 className="winner-title">{winnerText}</h2>
            <p>{view.aborted ? '本局中途中止，身份档案全面公开。' : view.winner === 'undercover' ? '卧底巧妙隐藏到了最后，成功智取！' : '众人慧眼如炬，成功找出了人群中的卧底！'}</p>
          </div>

          <div className="word-pair">
            <div className="word-item civilian">
              <span className="word-label">平民词条</span>
              <strong className="word-text">{reveal.civilianWord}</strong>
              <span className="word-corner">CIVILIAN</span>
            </div>
            <div className="word-item undercover">
              <span className="word-label">卧底词条</span>
              <strong className="word-text">{reveal.undercoverWord}</strong>
              <span className="word-corner">UNDERCOVER</span>
            </div>
          </div>

          <div className="game-action-dock">
            {isHost ? (
              <button type="button" className="game-primary-action" onClick={handleReturnToLobby} disabled={busy || state.connState !== 'synced'}>
                {busy ? '正在返回…' : '返回大厅准备下一局'}
              </button>
            ) : (
              <div className="waiting-host">等待房主返回大厅…</div>
            )}
            <span>{isHost ? '大厅内可调整规则或直接再开一局' : '房主操作后全员自动返回大厅'}</span>
          </div>
        </div>

        <div className="uc-gameover-right-col">
          <div className="uc-panel">
            <div className="uc-panel__head">
              <h3>全员身份档案</h3>
              <span>共 {sortedPlayers.length} 人</span>
            </div>
            <ul className="roles-list">
              {sortedPlayers.map((player: PublicPlayerInfo, index) => {
                const role = reveal.roles?.[player.playerId];
                const isMe = player.playerId === myId;
                const member = members.find((m) => m.playerId === player.playerId);
                return (
                  <li key={player.playerId} className={`role-item ${role ?? 'unknown'} ${!player.alive ? 'dead' : ''}`} style={{ '--stagger-index': index } as CSSProperties}>
                    <UserAvatar
                      avatar={member?.avatar ?? (isMe ? profile.avatar : 'preset:fox')}
                      nickname={nameFor(members, player.playerId)}
                      size={36}
                      className="role-avatar"
                    />
                    <span className="role-seat">#{player.seat}</span>
                    <span className="role-name">
                      <strong>{isMe ? '我' : nameFor(members, player.playerId) || `玩家 ${player.seat}`}</strong>
                      <small>{!player.alive ? '本局已淘汰' : '存活至结算'}</small>
                    </span>
                    <span className={`role-badge ${role ?? ''}`}>{role ? roleLabel(role) : '未知'}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </div>

      {error && <div className="error-banner" role="alert">{error}</div>}
    </section>
  );
}
