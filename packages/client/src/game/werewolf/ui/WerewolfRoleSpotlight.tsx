import React from 'react';
import type { WerewolfPresentationModel } from '../presentation.ts';
import { GameIcon } from '../../../shared-ui/GameIcon.tsx';
import { IdentityFlipCard } from '../../../shared-ui/IdentityFlipCard.tsx';
import { UserAvatar } from '../../../user/UserAvatar.tsx';
import { useTypewriter } from './useTypewriter.ts';

interface WerewolfRoleSpotlightProps {
  readonly model: WerewolfPresentationModel;
}

export function WerewolfRoleSpotlight({ model }: WerewolfRoleSpotlightProps) {
  const { self, phase, mood, seats } = model;
  const isNight = mood === 'night';
  const isDawn = mood === 'dawn';
  const isRoleReveal = phase === 'role_reveal';
  const { displayedText } = useTypewriter(model.speakerLine, { speed: 30 });

  // 身份确认阶段：使用 3D 哥特暗夜翻牌引擎
  if (isRoleReveal && self) {
    const isWolf = self.role === 'wolf';
    const camp = isWolf ? 'evil' : 'good';
    return (
      <div className="werewolf-spotlight werewolf-spotlight--reveal-3d">
        <IdentityFlipCard
          theme="gothic"
          roleName={self.roleLabel}
          roleSubtitle={isWolf ? '狼人阵营 · 夜袭猎杀' : '好人阵营 · 找出伪装'}
          roleCamp={camp}
          artworkUrl={self.artworkUrl}
          secretHints={[self.roleHint]}
          canInteract={true}
        />
      </div>
    );
  }

  // 天亮公告阶段
  if (isDawn) {
    return (
      <div className="werewolf-spotlight werewolf-spotlight--dawn">
        <div className="werewolf-spotlight__dawn-sun">
          <span className="werewolf-spotlight__sun-core" />
          <span className="werewolf-spotlight__sun-rays" />
        </div>
        <div className="werewolf-spotlight__content">
          <div className="werewolf-spotlight__tag">黎明拂晓 · 破晓时分</div>
          <h2 className="werewolf-spotlight__headline">{model.narrative}</h2>
          <p className="werewolf-spotlight__subhint">公投辩论即将开启，请整理昨夜线索准备发言。</p>
        </div>
      </div>
    );
  }

  // 黑夜阶段：展示当前角色的专属形象与信息
  if (isNight && self && self.alive) {
    return (
      <div className={`werewolf-spotlight werewolf-spotlight--night werewolf-spotlight--${self.role}`}>
        <div className="werewolf-spotlight__avatar-frame">
          <img src={self.artworkUrl} alt={self.roleLabel} className="werewolf-spotlight__img" />
          <div className="werewolf-spotlight__aura" />
          <div className="werewolf-spotlight__role-badge">{self.roleLabel}</div>
        </div>

        <div className="werewolf-spotlight__content">
          {self.role === 'wolf' && (
            <div className="werewolf-role-intel werewolf-role-intel--wolf">
              <div className="werewolf-role-intel__header">
                <GameIcon name="cards_deck" size={16} />
                <span>狼人行动</span>
              </div>
              <div className="werewolf-role-intel__teammates">
                <span className="werewolf-role-intel__label">同伴状态：</span>
                {self.wolfTeammates.length === 0 ? (
                  <span className="werewolf-role-intel__tag">孤狼作战</span>
                ) : (
                  self.wolfTeammates.map((mate) => {
                    let statusText = '';
                    if (!mate.alive) {
                      statusText = '（已出局）';
                    } else if (mate.targetName) {
                      const targetDisplay = mate.targetSeatLabel ? `${mate.targetSeatLabel} ${mate.targetName}` : mate.targetName;
                      statusText = ` → 拟袭 ${targetDisplay}`;
                    } else {
                      statusText = '（思考中）';
                    }
                    return (
                      <span
                        key={mate.playerId}
                        className={`werewolf-role-intel__tag ${mate.alive ? 'is-alive' : 'is-dead'}`}
                      >
                        {mate.seatLabel} {mate.name}{statusText}
                      </span>
                    );
                  })
                )}
              </div>
              <p className="werewolf-role-intel__tip">在下方选择今夜袭击的目标，狼人统一意见后生效。</p>
            </div>
          )}

          {self.role === 'seer' && (
            <div className="werewolf-role-intel werewolf-role-intel--seer">
              <div className="werewolf-role-intel__header">
                <span className="werewolf-role-intel__icon">🔮</span>
                <span>查验身份</span>
              </div>
              <div className="werewolf-role-intel__history">
                <span className="werewolf-role-intel__label">查验记录：</span>
                {self.seerResults.length === 0 ? (
                  <span className="werewolf-role-intel__tag">暂无查验记录</span>
                ) : (
                  self.seerResults.map((res) => (
                    <span
                      key={`${res.night}-${res.name}`}
                      className={`werewolf-role-intel__tag werewolf-role-intel__tag--${res.team}`}
                    >
                      第{res.night}夜: {res.seatLabel} {res.name} → {res.teamLabel}
                    </span>
                  ))
                )}
              </div>
              <p className="werewolf-role-intel__tip">选择一位存活玩家查验其身份阵营。</p>
            </div>
          )}

          {self.role === 'witch' && (
            <div className="werewolf-role-intel werewolf-role-intel--witch">
              <div className="werewolf-role-intel__header">
                <span className="werewolf-role-intel__icon">🧪</span>
                <span>女巫行动</span>
              </div>
              <div className="werewolf-role-intel__potions">
                <span className={`potion-badge ${self.witchSaveUsed ? 'is-spent' : 'is-ready'}`}>
                  🟢 解药：{self.witchSaveUsed ? '已使用' : '就绪'}
                </span>
                <span className={`potion-badge ${self.witchPoisonUsed ? 'is-spent' : 'is-ready'}`}>
                  🟣 毒药：{self.witchPoisonUsed ? '已使用' : '就绪'}
                </span>
              </div>
              {self.nightVictimName && (
                <div className="werewolf-role-intel__alert">
                  今夜遇袭出局的是：<strong>{self.nightVictimName}</strong>
                </div>
              )}
            </div>
          )}

          {self.role === 'guard' && (
            <div className="werewolf-role-intel werewolf-role-intel--guard">
              <div className="werewolf-role-intel__header">
                <span className="werewolf-role-intel__icon">🛡️</span>
                <span>守卫守护</span>
              </div>
              <div className="werewolf-role-intel__guard-status">
                {self.lastGuardTargetName ? (
                  <span>上一夜守护：<strong>{self.lastGuardTargetName}</strong>（今夜不可连守）</span>
                ) : (
                  <span>上一夜未守护任何人</span>
                )}
              </div>
              <p className="werewolf-role-intel__tip">选择今夜守护的目标，防止其被狼人袭击。</p>
            </div>
          )}

          {self.role === 'hunter' && (
            <div className="werewolf-role-intel werewolf-role-intel--hunter">
              <div className="werewolf-role-intel__header">
                <span className="werewolf-role-intel__icon">🏹</span>
                <span>猎人技能</span>
              </div>
              <p className="werewolf-role-intel__tip">
                {self.pendingShoot ? '你已出局，可开枪带走场上一名存活玩家！' : '出局时可开枪带走场上一名玩家（被毒死除外）。'}
              </p>
            </div>
          )}

          {self.role === 'villager' && (
            <div className="werewolf-role-intel werewolf-role-intel--villager">
              <div className="werewolf-role-intel__header">
                <span>村民行动</span>
              </div>
              <p className="werewolf-role-intel__tip">夜间无行动，请闭眼等待天亮参与白天的讨论与投票。</p>
            </div>
          )}

          {self.role === 'idiot' && (
            <div className="werewolf-role-intel werewolf-role-intel--idiot">
              <div className="werewolf-role-intel__header">
                <span className="werewolf-role-intel__icon">🃏</span>
                <span>白痴技能</span>
              </div>
              <p className="werewolf-role-intel__tip">
                {self.idiotRevealed ? '你已翻牌免死，虽无法投票但可继续发言参与讨论。' : '若在白天被投票放逐，可翻开身份牌免除出局。'}
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // 自由发言环节（Free Discussion）
  if (phase === 'free_discussion') {
    const readyCount = model.freeDiscussionReadyCount ?? 0;
    const aliveSeats = seats.filter((s) => s.alive);
    const aliveCount = aliveSeats.length;
    const isReady = model.hasReadiedVote ?? false;
    return (
      <div className="werewolf-spotlight werewolf-spotlight--free-discussion">
        <div className="werewolf-spotlight__speaker-halo">
          <span className="werewolf-spotlight__wave" />
          <span className="werewolf-spotlight__speaker-tag">自由讨论</span>
          <strong className="werewolf-spotlight__speaker-name">公屏自由辩论环节</strong>
        </div>
        <p className="werewolf-spotlight__speaker-line">
          {displayedText || (model.speakerLine ?? '所有存活玩家现可在公屏自由发言质询。充分讨论后，请点击下方准备进入放逐公投。')}
        </p>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '6px', fontSize: '0.78rem', opacity: 0.9 }}>
          <span>{isReady ? '✅ 你已就绪' : '⏳ 等待你准备'}</span>
          <span>（全场就绪：<strong>{readyCount}</strong> / {aliveCount} 人）</span>
        </div>
      </div>
    );
  }

  // 放逐公投与 PK 决选阶段：中央舞台展示专属公投进度卡片
  if ((phase === 'voting' || phase === 'runoff_voting') && model.voteProgress) {
    const { submitted, expected, percent, remaining, isVoter, hasVoted, isRunoffCandidate, isRunoff } = model.voteProgress;
    const isCompleted = remaining === 0;

    let leftFeedback: React.ReactNode;
    if (isCompleted) {
      leftFeedback = (
        <span className="werewolf-spotlight__vote-status-text">
          <span className="werewolf-spotlight__vote-icon">✨</span> 全员已完成投票，即将揭晓结果…
        </span>
      );
    } else if (!isVoter && isRunoffCandidate) {
      leftFeedback = (
        <span className="werewolf-spotlight__vote-status-text">
          <span className="werewolf-spotlight__vote-icon">⚖️</span> 你是 PK 辩论候选人，等待其他存活玩家投票
        </span>
      );
    } else if (!isVoter) {
      leftFeedback = (
        <span className="werewolf-spotlight__vote-status-text">
          <span className="werewolf-spotlight__vote-icon">👁️</span> 观战中 · 全场公投进行中
        </span>
      );
    } else if (hasVoted) {
      leftFeedback = (
        <span className="werewolf-spotlight__vote-status-text">
          <span className="werewolf-spotlight__voted-badge">✓ 你已完成投票</span>
          <span className="werewolf-spotlight__vote-hint">等待全场就绪…</span>
        </span>
      );
    } else {
      leftFeedback = (
        <span className="werewolf-spotlight__vote-status-text">
          <span className="werewolf-spotlight__vote-icon">⏳</span> 请点击上方席位头像完成投票
        </span>
      );
    }

    const rightFeedback = isCompleted ? null : (
      <span className="werewolf-spotlight__vote-remaining">
        还差 <strong>{remaining}</strong> 票即刻结算
      </span>
    );

    return (
      <div className="werewolf-spotlight werewolf-spotlight--voting">
        <div className="werewolf-spotlight__vote-header">
          <div className="werewolf-spotlight__vote-title-wrap">
            <span className="werewolf-spotlight__pulsing-dot" aria-hidden="true" />
            <strong className="werewolf-spotlight__vote-title">
              {isRunoff ? 'PK 决选公投' : '放逐公投进行中'}
            </strong>
          </div>
          <div className="werewolf-spotlight__vote-tally">
            <span className="werewolf-spotlight__vote-tally-label">已投票</span>
            <strong className="werewolf-spotlight__vote-tally-num">{submitted}</strong>
            <span className="werewolf-spotlight__vote-tally-total">/ {expected}</span>
            <span className="werewolf-spotlight__vote-percent-badge">{percent}%</span>
          </div>
        </div>

        <div
          className="werewolf-spotlight__vote-track"
          role="progressbar"
          aria-valuenow={submitted}
          aria-valuemin={0}
          aria-valuemax={expected}
          aria-label={isRunoff ? 'PK 决选公投进度' : '放逐公投进度'}
        >
          <div
            className="werewolf-spotlight__vote-fill"
            style={{ width: `${percent}%` }}
          />
        </div>

        <div className="werewolf-spotlight__vote-footer">
          <div className="werewolf-spotlight__vote-feedback-left">{leftFeedback}</div>
          {rightFeedback && <div className="werewolf-spotlight__vote-feedback-right">{rightFeedback}</div>}
        </div>
      </div>
    );
  }

  // 默认阶段展示（发言阶段高亮发言人）
  const speakingSeat = seats.find((s) => s.isSpeaking);
  if (speakingSeat) {
    return (
      <div className="werewolf-spotlight werewolf-spotlight--speaking">
        <div className="werewolf-spotlight__speaker-halo">
          <UserAvatar
            avatar={speakingSeat.avatar}
            nickname={speakingSeat.name}
            size={34}
            className="werewolf-spotlight__speaker-avatar"
          />
          <div className="werewolf-spotlight__speaker-meta">
            <span className="werewolf-spotlight__speaker-tag">{phase === 'last_words' ? '正在留遗言' : '正在发言'}</span>
            <strong className="werewolf-spotlight__speaker-name">{speakingSeat.seatLabel} {speakingSeat.name}</strong>
            {speakingSeat.isSelf && <span className="werewolf-spotlight__self-badge">你</span>}
          </div>
        </div>
        <p className="werewolf-spotlight__speaker-line">
          {displayedText || (model.speakerLine ?? '正在组织语言…')}
        </p>
      </div>
    );
  }

  return null;
}
