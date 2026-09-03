import { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import type { RoomMemberView } from '@ldj/shared';
import { useConnection } from '../connection/useConnection.ts';
import { GameIcon } from '../shared-ui/GameIcon.tsx';
import { nameFor } from './useGameAction.ts';

type AnyRecord = Record<string, unknown>;

function getSettlementSummary(
  moduleId: string | undefined,
  view: unknown,
  members: RoomMemberView[]
): { title: string; subtitle: string; icon: 'trophy' | 'crown' | 'werewolf' | 'undercover' | 'star' } {
  if (!view || typeof view !== 'object') {
    return {
      title: '本局对局已结束',
      subtitle: '全员准备后自动开启下一把对决',
      icon: 'trophy',
    };
  }

  const v = view as AnyRecord;

  // 1. 斗地主
  if (moduleId === 'landlord') {
    const winnerTeam = v.winnerTeam;
    const winnerId = typeof v.winnerId === 'string' ? v.winnerId : null;
    const winnerName = winnerId ? nameFor(members, winnerId) : '';
    if (winnerTeam === 'landlord') {
      return {
        title: '地主获胜！',
        subtitle: winnerName ? `${winnerName} 顶住围剿，成功跑完全部手牌！` : '地主一方赢下本局',
        icon: 'crown',
      };
    }
    if (winnerTeam === 'farmers') {
      return {
        title: '农民获胜！',
        subtitle: winnerName ? `${winnerName} 率先跑牌，农民团队同盟胜利！` : '农民同盟赢下本局',
        icon: 'trophy',
      };
    }
  }

  // 2. UNO
  if (moduleId === 'uno') {
    const winnerId = typeof v.winnerId === 'string' ? v.winnerId : null;
    const winnerName = winnerId ? nameFor(members, winnerId) : '获胜玩家';
    return {
      title: `${winnerName} 率先出完手牌！`,
      subtitle: 'UNO 派对胜利！准备好下一场反应速度战了吗？',
      icon: 'star',
    };
  }

  // 3. 狼人杀
  if (moduleId === 'werewolf') {
    const winner = v.winner || v.winnerFaction;
    if (winner === 'werewolf' || winner === 'wolves') {
      return {
        title: '狼人阵营获胜！',
        subtitle: '黑夜笼罩村庄，狼人吞噬了最后的抵抗',
        icon: 'werewolf',
      };
    }
    if (winner === 'villagers' || winner === 'good') {
      return {
        title: '好人阵营获胜！',
        subtitle: '驱散迷雾，正义村民成功处决所有狼人',
        icon: 'star',
      };
    }
  }

  // 4. 谁是卧底
  if (moduleId === 'undercover') {
    const winner = v.winner || v.winnerRole;
    if (winner === 'undercover') {
      return {
        title: '卧底获胜！',
        subtitle: '伪装至深，卧底成功存活至最后！',
        icon: 'undercover',
      };
    }
    if (winner === 'civilian') {
      return {
        title: '平民获胜！',
        subtitle: '敏锐洞察，平民成功揪出所有潜伏卧底！',
        icon: 'trophy',
      };
    }
  }

  // 5. 其他桌游（情书、榴莲、怪盗等通用处理）
  const winnerId = typeof v.winnerId === 'string' ? v.winnerId : null;
  if (winnerId) {
    const winnerName = nameFor(members, winnerId);
    return {
      title: `${winnerName} 赢得本局胜利！`,
      subtitle: '精彩的策略对决！准备进行下一把',
      icon: 'trophy',
    };
  }

  return {
    title: '本局对决已完成结算',
    subtitle: '所有玩家准备就绪后即可开启新一局',
    icon: 'trophy',
  };
}

export function PostGameOverlay() {
  const { state, me, send } = useConnection();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const room = state.room;
  const game = state.game;

  // 仅在房间处于 POST_GAME 时展示
  if (!room || room.status !== 'POST_GAME') {
    return null;
  }

  const members = room.members ?? [];
  const playerMembers = members.filter((m) => m.seatRole === 'player');
  const myMember = members.find((m) => m.playerId === me?.playerId);
  const isHost = Boolean(myMember?.isHost);
  const isMeReady = Boolean(myMember?.ready);

  const readyCount = playerMembers.filter((m) => m.ready).length;
  const totalPlayers = playerMembers.length;
  const isAllReady = totalPlayers > 0 && readyCount === totalPlayers;

  const settlement = useMemo(() => {
    return getSettlementSummary(game?.moduleId, game?.view, members);
  }, [game?.moduleId, game?.view, members]);

  const handleToggleReady = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await send('room_command', { command: 'ready', ready: !isMeReady });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '操作失败');
    } finally {
      setBusy(false);
    }
  };

  const handleStartNext = async () => {
    if (busy || !isHost) return;
    setBusy(true);
    setError(null);
    try {
      await send('room_command', { command: 'start_game' });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '开局失败');
    } finally {
      setBusy(false);
    }
  };

  const handleReturnToLobby = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await send('room_command', { command: 'return_to_lobby' });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '返回大厅失败');
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div className="post-game-dock-backdrop">
      <div className="post-game-dock">
        {/* 头部标题与结算信息 */}
        <div className="post-game-dock__header">
          <div className="post-game-dock__trophy">
            <GameIcon name={settlement.icon} size={32} />
          </div>
          <div className="post-game-dock__titles">
            <h3 className="post-game-dock__title">{settlement.title}</h3>
            <p className="post-game-dock__sub">{settlement.subtitle}</p>
          </div>
        </div>

        {/* 玩家就绪状态列表 */}
        <div className="post-game-dock__roster">
          <div className="post-game-dock__roster-title">
            <span>全员就绪进度</span>
            <strong className={`post-game-dock__roster-count ${isAllReady ? 'is-complete' : ''}`}>
              {readyCount} / {totalPlayers}
            </strong>
          </div>
          <div className="post-game-dock__roster-grid">
            {playerMembers.map((p) => {
              const isMe = p.playerId === me?.playerId;
              const isReady = Boolean(p.ready);
              return (
                <div
                  key={p.playerId}
                  className={`post-game-dock__chip ${isReady ? 'is-ready' : 'is-waiting'} ${isMe ? 'is-me' : ''}`}
                >
                  <span className="post-game-dock__chip-name">
                    {p.nickname} {isMe && '(我)'}
                  </span>
                  <span className="post-game-dock__chip-badge">
                    {isReady ? (
                      <>
                        <GameIcon name="star" size={12} style={{ marginRight: '3px' }} />
                        已就绪
                      </>
                    ) : (
                      <>
                        <GameIcon name="hourglass" size={12} style={{ marginRight: '3px' }} />
                        未准备
                      </>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* 倒计时或开局提示 */}
        {isAllReady && (
          <div className="post-game-dock__auto-hint">
            <GameIcon name="rocket" size={16} style={{ marginRight: '6px' }} />
            全员已就绪！即将自动开局…
          </div>
        )}

        {error && <div className="game-error post-game-dock__error">{error}</div>}

        {/* 底部交互操作栏 */}
        <div className="post-game-dock__actions">
          {/* 准备 / 取消准备 */}
          <button
            type="button"
            className={`post-game-btn ${isMeReady ? 'post-game-btn--cancel' : 'post-game-btn--ready'}`}
            onClick={handleToggleReady}
            disabled={busy}
          >
            <GameIcon name={isMeReady ? 'hourglass' : 'rocket'} size={16} style={{ marginRight: '6px' }} />
            {isMeReady ? '取消准备' : '准备下一把'}
          </button>

          {/* 房主：立即开局 */}
          {isHost && (
            <button
              type="button"
              className="post-game-btn post-game-btn--start"
              onClick={handleStartNext}
              disabled={busy || !isAllReady}
              title={isAllReady ? '立即开始下一把' : '等待全员准备后可开局'}
            >
              <GameIcon name="crown" size={16} style={{ marginRight: '6px' }} />
              立即开局
            </button>
          )}

          {/* 返回房间大厅 */}
          <button
            type="button"
            className="post-game-btn post-game-btn--lobby"
            onClick={handleReturnToLobby}
            disabled={busy}
          >
            <GameIcon name="door_exit" size={15} style={{ marginRight: '5px' }} />
            返回房间
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
