import { useState } from 'react';
import type { ScoreboardProp } from './types.ts';
import { GameIcon } from '../../shared-ui/GameIcon.tsx';

interface ScoreboardPropViewProps {
  prop: ScoreboardProp;
  players: string[];
  members: Array<{ id: string; name: string }>;
  onModifyScore: (targetPlayerId: string, delta: number) => void;
  onResetScores: (initialScore: number) => void;
  disabled?: boolean;
}

export function ScoreboardPropView({
  prop,
  players,
  members,
  onModifyScore,
  onResetScores,
  disabled,
}: ScoreboardPropViewProps) {
  const [resetVal, setResetVal] = useState(100);
  const [showResetModal, setShowResetModal] = useState(false);

  const getPlayerName = (pid: string) => {
    return members.find((m) => m.id === pid)?.name ?? pid;
  };

  // 按分数降序排列
  const sortedPlayers = [...players].sort((a, b) => {
    const sA = prop.scores[a] ?? 0;
    const sB = prop.scores[b] ?? 0;
    return sB - sA;
  });

  return (
    <div className="sandbox-scoreboard-prop">
      <div className="sandbox-scoreboard-prop__header">
        <div className="sandbox-scoreboard-prop__title-box">
          <span className="sandbox-scoreboard-prop__title">💰 {prop.title}</span>
          <span className="sandbox-scoreboard-prop__unit-tag">
            单位：{prop.currencyName}
          </span>
        </div>
        <button
          type="button"
          className="sandbox-wheel-edit-btn"
          onClick={() => setShowResetModal(!showResetModal)}
        >
          {showResetModal ? '取消' : '重置全员'}
        </button>
      </div>

      {showResetModal && (
        <div className="sandbox-scoreboard-reset-box">
          <label className="sandbox-scoreboard-reset-label">
            设置全场每位玩家的初始筹码额度：
          </label>
          <div className="sandbox-scoreboard-reset-row">
            <input
              type="number"
              className="sandbox-input"
              value={resetVal}
              onChange={(e) => setResetVal(parseInt(e.target.value) || 0)}
              style={{ width: '110px' }}
            />
            <button
              type="button"
              className="sandbox-btn sandbox-btn--primary"
              onClick={() => {
                onResetScores(resetVal);
                setShowResetModal(false);
              }}
            >
              确定重置全员
            </button>
          </div>
        </div>
      )}

      {/* 玩家筹码排行榜列表 */}
      <div className="sandbox-scoreboard-list">
        {sortedPlayers.map((pId, idx) => {
          const score = prop.scores[pId] ?? 0;
          const isTop1 = idx === 0 && score > 0;

          return (
            <div
              key={pId}
              className={`sandbox-scoreboard-row ${isTop1 ? 'is-leader' : ''}`}
            >
              <div className="sandbox-scoreboard-rank-col">
                <span className={`sandbox-scoreboard-rank-badge rank-${idx + 1}`}>
                  {idx + 1}
                </span>
              </div>

              <div className="sandbox-scoreboard-player">
                <span className="sandbox-scoreboard-player__name">
                  {getPlayerName(pId)}
                </span>
              </div>

              <div className="sandbox-scoreboard-score">
                <span className="sandbox-scoreboard-score__currency">🪙</span>
                <span className="sandbox-scoreboard-score__num">{score}</span>
              </div>

              <div className="sandbox-scoreboard-btns">
                <button
                  type="button"
                  className="sandbox-chip-btn chip-minus-10"
                  onClick={() => onModifyScore(pId, -10)}
                  disabled={disabled}
                  title="扣除 10 筹码"
                >
                  -10
                </button>
                <button
                  type="button"
                  className="sandbox-chip-btn chip-minus-1"
                  onClick={() => onModifyScore(pId, -1)}
                  disabled={disabled}
                  title="扣除 1 筹码"
                >
                  -1
                </button>
                <button
                  type="button"
                  className="sandbox-chip-btn chip-plus-1"
                  onClick={() => onModifyScore(pId, 1)}
                  disabled={disabled}
                  title="增加 1 筹码"
                >
                  +1
                </button>
                <button
                  type="button"
                  className="sandbox-chip-btn chip-plus-10"
                  onClick={() => onModifyScore(pId, 10)}
                  disabled={disabled}
                  title="增加 10 筹码"
                >
                  +10
                </button>
                <button
                  type="button"
                  className="sandbox-chip-btn chip-plus-50"
                  onClick={() => onModifyScore(pId, 50)}
                  disabled={disabled}
                  title="增加 50 筹码"
                >
                  +50
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
