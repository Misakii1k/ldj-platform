import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import type { CheeseThiefPlayerView, CheeseThiefPublicView } from './types.ts';
import { UserAvatar } from '../../user/UserAvatar.tsx';
import { resolveMemberAvatar } from '../../user/avatar.ts';
import { nameFor, type MemberLike } from '../useGameAction.ts';
import { GameIcon } from '../../shared-ui/GameIcon.tsx';
import { BallotIcon, CheeseIcon, DieIcon, EyeIcon, MouseIcon, ScrollIcon } from './stage/CheeseIcons.tsx';

interface CheeseGameOverRevealProps {
  view: CheeseThiefPlayerView | CheeseThiefPublicView;
  members: readonly MemberLike[];
  myId?: string | null;
}

export function CheeseGameOverReveal({ view, members, myId }: CheeseGameOverRevealProps) {
  const [closed, setClosed] = useState(false);

  if (view.phase !== 'game_over') return null;

  const reveal = view.reveal;
  const hasThief = Boolean(reveal?.thiefId);
  const isThiefCaught = view.thiefCaught === true;

  // 终局标题与副标题判定
  let outcomeBadge = '奶酪完好';
  let outcomeClass = 'is-no-thief';
  let outcomeTitle = '奶酪安然无恙 · 全员获胜！';
  let outcomeDesc = '整夜无人单独醒来偷窃奶酪，大奶酪完好无损，所有老鼠共同胜利！';

  if (hasThief) {
    if (isThiefCaught) {
      outcomeBadge = '抓捕归案';
      outcomeClass = 'is-caught';
      outcomeTitle = '大盗落网 · 好人胜利！';
      outcomeDesc = '机敏的村民成功指认出怪盗，奶酪小镇的正义得到伸张！';
    } else {
      outcomeBadge = '盗匪得逞';
      outcomeClass = 'is-escaped';
      outcomeTitle = '大盗得逞 · 盗匪胜利！';
      outcomeDesc = '怪盗老鼠瞒天过海逃避制裁，成功将大奶酪占为己有！';
    }
  }

  const thiefName = hasThief && reveal?.thiefId ? nameFor(members, reveal.thiefId) : '无人';
  const accomplices = reveal?.accomplices ?? [];
  const peeks = reveal?.peeks ?? [];
  const wakeHours = reveal?.wakeHours ?? {};
  const votes = view.votes ?? {};

  // 关闭时展示置顶悬浮重开按钮
  if (closed) {
    return (
      <div className="cheese-reopen-reveal-container">
        <button
          type="button"
          className="cheese-reopen-reveal-btn"
          onClick={() => setClosed(false)}
          title="点击重新打开终局复盘遮罩"
        >
          <span className="cheese-reopen-reveal-btn__icon" aria-hidden="true"><ScrollIcon /></span>
          <span>查看终局真相复盘（点击打开）</span>
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="cheese-reopen-reveal-container">
        <button
          type="button"
          className="cheese-reopen-reveal-btn"
          onClick={() => setClosed(false)}
        >
          <span className="cheese-reopen-reveal-btn__icon" aria-hidden="true"><ScrollIcon /></span>
          <span>查看终局真相复盘</span>
        </button>
      </div>

      {createPortal(
        <div
          className="cheese-reveal-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="终局真相大揭秘"
          onClick={(e) => {
            if (e.target === e.currentTarget) setClosed(true);
          }}
        >
          <div className="cheese-reveal-modal" onClick={(e) => e.stopPropagation()}>
            {/* 右上角关闭叉号 */}
            <button
              type="button"
              className="cheese-reveal__close-btn"
              onClick={() => setClosed(true)}
              title="收起复盘遮罩，查看桌面与准备再来一局"
              aria-label="关闭"
            >
              ✕
            </button>

            {/* 顶栏标题 */}
            <div className="cheese-reveal__header">
              <span className={`cheese-reveal__badge ${outcomeClass}`}>{outcomeBadge}</span>
              <h2 className={`cheese-reveal__headline ${outcomeClass}`}>{outcomeTitle}</h2>
              <p className="cheese-reveal__desc">{outcomeDesc}</p>
            </div>

            {/* 核心案情焦点卡片 */}
            <div className="cheese-reveal__facts">
              {hasThief ? (
                <>
                  <div className="cheese-reveal__fact-item">
                    <span className="fact-icon" aria-hidden="true"><CheeseIcon /></span>
                    <div className="fact-content">
                      <strong>真凶怪盗</strong>
                      <span>
                        【{thiefName}】 在 <strong>第 {reveal?.stealHour} 时刻</strong> 醒来独行偷走奶酪
                      </span>
                    </div>
                  </div>
                  <div className="cheese-reveal__fact-item">
                    <span className="fact-icon" aria-hidden="true"><MouseIcon /></span>
                    <div className="fact-content">
                      <strong>同谋共犯</strong>
                      <span>
                        {accomplices.length > 0
                          ? accomplices.map((id) => `【${nameFor(members, id)}】`).join('、')
                          : '本局无共犯'}
                      </span>
                    </div>
                  </div>
                </>
              ) : (
                <div className="cheese-reveal__fact-item">
                  <span className="fact-icon" aria-hidden="true"><CheeseIcon /></span>
                  <div className="fact-content">
                    <strong>案发现场</strong>
                    <span>整夜所有时刻均为 0 人或 2 人以上醒来，大奶酪安然无恙，全员老鼠皆大欢喜！</span>
                  </div>
                </div>
              )}
            </div>

            {/* 全员苏醒时刻与身份揭秘网格 */}
            <div className="cheese-reveal__section">
              <h3 className="cheese-reveal__section-title">
                <ScrollIcon /> 全员苏醒时刻与身份揭秘
              </h3>
              <div className="cheese-reveal-players-grid">
                {view.players.map((id) => {
                  const isThief = hasThief && id === reveal?.thiefId;
                  const isAcc = accomplices.includes(id);
                  const isWin = (view.winners ?? []).includes(id);
                  const wakeHour = wakeHours[id];
                  const pName = nameFor(members, id);
                  const member = members.find((m) => m.playerId === id);
                  const avatar = resolveMemberAvatar(member, {
                    playerId: id,
                    isMe: id === myId,
                  });

                  return (
                    <div
                      key={id}
                      className={`cheese-reveal-player-card ${isThief ? 'role-thief' : isAcc ? 'role-accomplice' : 'role-villager'} ${isWin ? 'is-winner' : 'is-loser'}`}
                    >
                      <div className="player-card__avatar">
                        <UserAvatar avatar={avatar} nickname={pName} size={38} />
                      </div>
                      <div className="player-card__meta">
                        <div className="player-card__name" title={pName}>
                          {pName} {id === myId ? <span className="player-tag--me">我</span> : null}
                        </div>
                        <div className="player-card__hour">
                          <DieIcon /> <strong>{wakeHour !== undefined ? `${wakeHour} 点醒来` : '未知'}</strong>
                        </div>
                      </div>
                      <div className="player-card__badges">
                        <span className={`player-role-tag ${isThief ? 'tag-thief' : isAcc ? 'tag-acc' : 'tag-villager'}`}>
                          {isThief ? '怪盗' : isAcc ? '共犯' : '村民'}
                        </span>
                        <span className={`player-win-tag ${isWin ? 'tag-win' : 'tag-lose'}`}>
                          {isWin ? <><GameIcon name="crown" size={14} alt="" /> 胜利</> : '落败'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 独醒偷看目击线索 */}
            {peeks.length > 0 && (
              <div className="cheese-reveal__section">
                <h3 className="cheese-reveal__section-title">
                  <EyeIcon /> 独醒偷看目击记录
                </h3>
                <ul className="cheese-reveal-peeks-list">
                  {peeks.map((p, idx) => (
                    <li key={idx}>
                      【{nameFor(members, p.viewer)}】 在独醒时查验了 【{nameFor(members, p.target)}】 的骰盅，窥得点数为 <strong>{wakeHours[p.target] ?? '?'} 点</strong>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* 投票指认结果 */}
            {Object.keys(votes).length > 0 && (
              <div className="cheese-reveal__section">
                <h3 className="cheese-reveal__section-title">
                  <BallotIcon /> 投票指认记录
                </h3>
                <div className="cheese-reveal-votes-grid">
                  {Object.entries(votes).map(([voterId, vote]) => {
                    const voterName = nameFor(members, voterId);
                    if (vote.kind === 'accuse') {
                      const targetName = nameFor(members, vote.targetPlayerId);
                      const isThiefTarget = hasThief && vote.targetPlayerId === reveal?.thiefId;
                      return (
                        <div key={voterId} className={`cheese-vote-summary-chip ${isThiefTarget ? 'hit-thief' : ''}`}>
                          <span className="voter">{voterName}</span>
                          <span className="arrow">➔</span>
                          <span className="target">指认【{targetName}】</span>
                          {isThiefTarget && <span className="hit-badge">命中怪盗</span>}
                        </div>
                      );
                    }
                    return (
                      <div key={voterId} className="cheese-vote-summary-chip is-abstain">
                        <span className="voter">{voterName}</span>
                        <span className="arrow">➔</span>
                        <span className="target">选择弃票</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 底部收起按钮 */}
            <div className="cheese-reveal__footer">
              <button
                type="button"
                className="cheese-reveal__dismiss-btn"
                onClick={() => setClosed(true)}
              >
                收起复盘 · 查看桌局与准备再来一局 ➔
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
