import { useState } from 'react';
import type { CheeseThiefPlayerView, CheeseThiefPublicView } from './types.ts';

interface RoomMemberInfo {
  playerId: string;
  nickname: string;
  avatarSeed?: string;
}

interface CheeseTabletopArenaProps {
  view: CheeseThiefPlayerView | CheeseThiefPublicView;
  myId: string | null;
  members: RoomMemberInfo[];
  onStealCheese?: () => void;
  ttsEnabled?: boolean;
  onToggleTts?: () => void;
}

export function CheeseTabletopArena({
  view,
  myId,
  members,
  onStealCheese,
  ttsEnabled = true,
  onToggleTts,
}: CheeseTabletopArenaProps) {
  const [stealTapped, setStealTapped] = useState(false);
  const me = 'me' in view ? view.me : null;
  const isThief = me?.isThief ?? false;
  const isNight = view.phase === 'night';
  const isDawn = view.phase === 'dawn';
  const isVote = view.phase === 'vote';
  const isGameOver = view.phase === 'game_over';

  const memberNames = new Map(members.map((m) => [m.playerId, m.nickname]));
  const nameFor = (id: string | null | undefined) => (id ? memberNames.get(id) || id : '未知');

  const handleStealClick = () => {
    if (stealTapped) return;
    setStealTapped(true);
    onStealCheese?.();
  };

  const isCheeseStolen = view.reveal ? Boolean(view.reveal.thiefId) : (isDawn || isVote || isGameOver);

  return (
    <div className="cheese-tabletop-arena" data-phase={view.phase}>
      {/* 顶部中央时钟与法官状态 */}
      <div className="cheese-arena-header">
        <div className="cheese-hour-track">
          {[1, 2, 3, 4, 5, 6].map((hour) => {
            const isCurrent = isNight && view.currentHour === hour;
            const isPast = isNight && view.currentHour > hour;
            return (
              <div
                key={hour}
                className={`cheese-hour-node ${isCurrent ? 'is-current' : ''} ${isPast ? 'is-past' : ''}`}
              >
                <span className="cheese-hour-node__badge">{hour} 点</span>
                <span className="cheese-hour-node__status">
                  {isCurrent ? '🌕 醒来' : isPast ? '✓ 已过' : '💤 沉睡'}
                </span>
              </div>
            );
          })}
        </div>

        {onToggleTts && (
          <button
            type="button"
            className={`cheese-tts-btn ${ttsEnabled ? 'is-active' : ''}`}
            onClick={onToggleTts}
            title="切换法官语音主持播报"
          >
            {ttsEnabled ? '🔊 语音主持开启' : '🔇 语音主持静音'}
          </button>
        )}
      </div>

      {/* 中央桌台案发区：大奶酪盘 */}
      <div className="cheese-center-table">
        <div className="cheese-wood-platter">
          <div className={`cheese-cloth ${isCheeseStolen && (isDawn || isVote || isGameOver) ? 'is-stolen' : ''}`}>
            {isNight ? (
              <div className="cheese-night-stage">
                <div className="cheese-model-3d">
                  <span className="cheese-model-emoji" aria-hidden="true">🧀</span>
                  <div className="cheese-glow" />
                </div>
                {/* 大盗夜间静音触控区（无声无震动，仅供大盗本人按压） */}
                {isThief && (
                  <button
                    type="button"
                    className={`cheese-steal-silent-btn ${stealTapped ? 'is-stolen-hidden' : ''}`}
                    onClick={handleStealClick}
                    title="【大盗专属】悄悄伸手偷走奶酪（完全静音无震动）"
                  >
                    <span>{stealTapped ? '✓ 奶酪已悄悄取走' : '✋ 伸手偷走桌面奶酪'}</span>
                  </button>
                )}
                <p className="cheese-night-guide">
                  {view.currentHour === 0 ? '夜幕降临…准备开始报时' : `当前时刻：${view.currentHour} 点`}
                </p>
              </div>
            ) : isCheeseStolen ? (
              <div className="cheese-stolen-stage">
                <div className="cheese-stolen-crumbs">
                  <span className="crumbs-emoji">🍽️</span>
                  <span className="crumbs-warning">🚨 奶酪不见了！</span>
                </div>
                <div className="cheese-crime-alert">
                  <strong>案发现场：</strong>桌上的大奶酪已被大盗偷吃！请找出真凶！
                </div>
              </div>
            ) : (
              <div className="cheese-safe-stage">
                <span className="cheese-model-emoji">🧀</span>
                <p className="cheese-safe-text">奶酪安然无恙（无人偷窃）</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 玩家环桌座次雷达 */}
      <div className="cheese-players-ring">
        {view.players.map((playerId) => {
          const isMe = playerId === myId;
          const wakeHour = view.reveal?.wakeHours?.[playerId];
          const isWinner = (view.winners ?? []).includes(playerId);
          const isThiefPlayer = view.reveal?.thiefId === playerId;
          const isAccomplicePlayer = (view.reveal?.accomplices ?? []).includes(playerId);

          return (
            <div
              key={playerId}
              className={`cheese-player-pod ${isMe ? 'is-me' : ''} ${isWinner ? 'is-winner' : ''}`}
            >
              <div className="cheese-pod-avatar">
                <span className="cheese-pod-avatar__emoji">
                  {isThiefPlayer ? '🐭' : isAccomplicePlayer ? '🦊' : '🐹'}
                </span>
              </div>
              <div className="cheese-pod-name">
                {nameFor(playerId)} {isMe ? '（我）' : ''}
              </div>
              {isGameOver && wakeHour && (
                <div className="cheese-pod-dice-badge">
                  🎲 {wakeHour} 点
                  {isThiefPlayer ? ' · 大盗' : isAccomplicePlayer ? ' · 共犯' : ' · 贪睡鼠'}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 终局真相大揭秘 */}
      {isGameOver && view.reveal && (
        <div className="cheese-table-settlement-card">
          <div className="cheese-settlement-header">
            <h3>📜 案情水落石出 · 终局真相披露</h3>
            <span className="cheese-settlement-tag">
              {view.thiefCaught ? '⚖️ 大盗被捕 · 好人胜利' : '🧀 大盗得逞 · 盗匪胜利'}
            </span>
          </div>
          <div className="cheese-settlement-body">
            <div className="cheese-settlement-row">
              <strong>真凶大盗：</strong>
              <span>{nameFor(view.reveal.thiefId)}（在 {view.reveal.stealHour ?? '?'} 点偷走奶酪）</span>
            </div>
            {(view.reveal.accomplices ?? []).length > 0 && (
              <div className="cheese-settlement-row">
                <strong>同谋共犯：</strong>
                <span>{(view.reveal.accomplices ?? []).map((id) => nameFor(id)).join('、')}</span>
              </div>
            )}
            <div className="cheese-settlement-peeks">
              <strong>独醒目击线索：</strong>
              {(view.reveal.peeks ?? []).length > 0 ? (
                <ul>
                  {(view.reveal.peeks ?? []).map((p, idx) => (
                    <li key={idx}>
                      {nameFor(p.viewer)} 偷看了 {nameFor(p.target)} 的骰子（{view.reveal?.wakeHours[p.target]} 点）
                    </li>
                  ))}
                </ul>
              ) : (
                <span>整夜无村民独醒查看</span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
