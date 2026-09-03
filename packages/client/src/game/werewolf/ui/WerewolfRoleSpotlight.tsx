import React from 'react';
import type { WerewolfPresentationModel } from '../presentation.ts';
import { GameIcon } from '../../../shared-ui/GameIcon.tsx';
import { IdentityFlipCard } from '../../../shared-ui/IdentityFlipCard.tsx';

interface WerewolfRoleSpotlightProps {
  readonly model: WerewolfPresentationModel;
}

export function WerewolfRoleSpotlight({ model }: WerewolfRoleSpotlightProps) {
  const { self, phase, mood, seats } = model;
  const isNight = mood === 'night';
  const isDawn = mood === 'dawn';
  const isRoleReveal = phase === 'role_reveal';

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
                  self.wolfTeammates.map((mate) => (
                    <span
                      key={mate.playerId}
                      className={`werewolf-role-intel__tag ${mate.alive ? 'is-alive' : 'is-dead'}`}
                    >
                      {mate.seatLabel} {mate.name} {mate.targetName ? `(刀 ${mate.targetName})` : ''}
                    </span>
                  ))
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

  // 默认阶段展示（发言阶段高亮发言人）
  const speakingSeat = seats.find((s) => s.isSpeaking);
  if (speakingSeat) {
    return (
      <div className="werewolf-spotlight werewolf-spotlight--speaking">
        <div className="werewolf-spotlight__speaker-halo">
          <span className="werewolf-spotlight__wave" />
          <span className="werewolf-spotlight__speaker-tag">{phase === 'last_words' ? '正在留遗言' : '正在发言'}</span>
          <strong className="werewolf-spotlight__speaker-name">{speakingSeat.seatLabel} {speakingSeat.name}</strong>
        </div>
        <p className="werewolf-spotlight__speaker-line">
          {model.speakerLine ?? '正在组织语言…'}
        </p>
      </div>
    );
  }

  return null;
}
