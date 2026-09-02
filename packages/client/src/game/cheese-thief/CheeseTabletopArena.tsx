import { useRef, useState } from 'react';
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
  myId: _myId,
  members,
  onStealCheese,
  ttsEnabled = true,
  onToggleTts,
}: CheeseTabletopArenaProps) {
  // 奶酪是否已被取走：一律以服务端权威状态为准。
  // 一旦偷取成功即保持到天亮，之后任何时刻都不会回退成"未偷走"；
  // 只有当夜尚未被偷时，点击才是一次真实的偷取尝试（服务端校验当前时刻是否恰有独醒大盗）。
  const isNight = view.phase === 'night';
  const isDawn = view.phase === 'dawn';
  const isVote = view.phase === 'vote';
  const isGameOver = view.phase === 'game_over';

  const [stealSubmitting, setStealSubmitting] = useState(false);
  const submitLatchRef = useRef<number | null>(null);

  const memberNames = new Map(members.map((m) => [m.playerId, m.nickname]));
  const nameFor = (id: string | null | undefined) => (id ? memberNames.get(id) || id : '未知');

  const cheeseGone = view.cheeseStolen || (view.reveal ? Boolean(view.reveal.thiefId) : false);
  const showStolenScene = cheeseGone && (isDawn || isVote || isGameOver);

  const handleSteal = () => {
    if (!isNight || cheeseGone || stealSubmitting) return;
    setStealSubmitting(true);
    onStealCheese?.();
    // 提交节流：动作结果以服务端视图为准（成功→转已偷走展示；被拒→恢复可点）
    if (submitLatchRef.current !== null) window.clearTimeout(submitLatchRef.current);
    submitLatchRef.current = window.setTimeout(() => setStealSubmitting(false), 1200);
  };

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
          <div className={`cheese-cloth ${showStolenScene ? 'is-stolen' : ''}`}>
            {isNight ? (
              <div className="cheese-night-stage">
                {cheeseGone ? (
                  /* 偷取成功：空盘展示并保持到天亮（不可放回、不可重复偷） */
                  <div className="cheese-model-3d-btn is-stolen" aria-live="polite">
                    <div className="cheese-model-3d">
                      <span className="cheese-model-emoji" aria-hidden="true">🍽️</span>
                    </div>
                    <div className="cheese-steal-status-badge">
                      <span className="badge-stolen">✓ 奶酪已被悄悄取走</span>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    className={`cheese-model-3d-btn ${stealSubmitting ? 'is-submitting' : ''}`}
                    onClick={handleSteal}
                    disabled={stealSubmitting}
                    title="【桌面交互】大盗在自己醒来的时刻点击偷走奶酪"
                  >
                    <div className="cheese-model-3d">
                      <span className="cheese-model-emoji" aria-hidden="true">🧀</span>
                      <div className="cheese-glow" />
                    </div>
                    <div className="cheese-steal-status-badge">
                      <span className="badge-ready">✋ 触摸/点击偷走奶酪</span>
                    </div>
                  </button>
                )}
                <p className="cheese-night-guide">
                  {view.currentHour === 0 ? '夜幕降临…准备开始报时' : `当前时刻：${view.currentHour} 点`}
                  <span className="cheese-night-guide__rule">只有大盗在自己醒来的时刻才能取走，其他玩家无法偷走</span>
                </p>
              </div>
            ) : showStolenScene ? (
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
