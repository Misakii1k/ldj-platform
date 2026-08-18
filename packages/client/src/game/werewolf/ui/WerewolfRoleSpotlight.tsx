import React from 'react';
import type { WerewolfPresentationModel } from '../presentation.ts';
import { GameIcon } from '../../../shared-ui/GameIcon.tsx';

interface WerewolfRoleSpotlightProps {
  readonly model: WerewolfPresentationModel;
}

export function WerewolfRoleSpotlight({ model }: WerewolfRoleSpotlightProps) {
  const { self, phase, mood, seats } = model;
  const isNight = mood === 'night';
  const isDawn = mood === 'dawn';
  const isRoleReveal = phase === 'role_reveal';

  // 身份确认阶段
  if (isRoleReveal && self) {
    return (
      <div className="werewolf-spotlight werewolf-spotlight--reveal">
        <div className="werewolf-spotlight__avatar-frame">
          <img src={self.artworkUrl} alt={self.roleLabel} className="werewolf-spotlight__img" />
          <div className="werewolf-spotlight__aura" />
        </div>
        <div className="werewolf-spotlight__content">
          <div className="werewolf-spotlight__tag">你的专属身份</div>
          <h2 className="werewolf-spotlight__role-name">{self.roleLabel}</h2>
          <p className="werewolf-spotlight__desc">{self.roleHint}</p>
        </div>
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
                <span>狼人阵营夜袭</span>
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
                      {mate.seatLabel} {mate.name} {mate.targetName ? `(🎯 刀 ${mate.targetName})` : ''}
                    </span>
                  ))
                )}
              </div>
              <p className="werewolf-role-intel__tip">在下方选择今夜猎杀的目标，狼人投票最高者将被袭击。</p>
            </div>
          )}

          {self.role === 'seer' && (
            <div className="werewolf-role-intel werewolf-role-intel--seer">
              <div className="werewolf-role-intel__header">
                <span className="werewolf-role-intel__icon">🔮</span>
                <span>水晶球占卜</span>
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
              <p className="werewolf-role-intel__tip">选择一位存活玩家查验其阵营归属。</p>
            </div>
          )}

          {self.role === 'witch' && (
            <div className="werewolf-role-intel werewolf-role-intel--witch">
              <div className="werewolf-role-intel__header">
                <span className="werewolf-role-intel__icon">🧪</span>
                <span>炼金魔药室</span>
              </div>
              <div className="werewolf-role-intel__potions">
                <span className={`potion-badge ${self.witchSaveUsed ? 'is-spent' : 'is-ready'}`}>
                  🟢 圣光解药：{self.witchSaveUsed ? '已使用' : '就绪'}
                </span>
                <span className={`potion-badge ${self.witchPoisonUsed ? 'is-spent' : 'is-ready'}`}>
                  🟣 剧毒药水：{self.witchPoisonUsed ? '已使用' : '就绪'}
                </span>
              </div>
              {self.nightVictimName && (
                <div className="werewolf-role-intel__alert">
                  ⚠️ 今夜倒在血泊中的是：<strong>{self.nightVictimName}</strong>
                </div>
              )}
            </div>
          )}

          {self.role === 'guard' && (
            <div className="werewolf-role-intel werewolf-role-intel--guard">
              <div className="werewolf-role-intel__header">
                <span className="werewolf-role-intel__icon">🛡️</span>
                <span>圣盾庇护</span>
              </div>
              <div className="werewolf-role-intel__guard-status">
                {self.lastGuardTargetName ? (
                  <span>上一夜守护：<strong>{self.lastGuardTargetName}</strong>（今夜不可连守）</span>
                ) : (
                  <span>上一夜未守护任何人</span>
                )}
              </div>
              <p className="werewolf-role-intel__tip">选择今夜受圣盾庇护的目标，抵挡狼人爪牙。</p>
            </div>
          )}

          {self.role === 'hunter' && (
            <div className="werewolf-role-intel werewolf-role-intel--hunter">
              <div className="werewolf-role-intel__header">
                <span className="werewolf-role-intel__icon">🏹</span>
                <span>猎人之怒</span>
              </div>
              <p className="werewolf-role-intel__tip">
                {self.pendingShoot ? '你已倒下，可在出局前开枪带走一人！' : '银弹上膛，随时准备在出局时反击。'}
              </p>
            </div>
          )}

          {self.role === 'villager' && (
            <div className="werewolf-role-intel werewolf-role-intel--villager">
              <div className="werewolf-role-intel__header">
                <span className="werewolf-role-intel__icon">🌙</span>
                <span>安睡之夜</span>
              </div>
              <p className="werewolf-role-intel__tip">夜色沉沉，万籁俱寂。闭眼静候黎明到来，准备白天的辨析与推理。</p>
            </div>
          )}

          {self.role === 'idiot' && (
            <div className="werewolf-role-intel werewolf-role-intel--idiot">
              <div className="werewolf-role-intel__header">
                <span className="werewolf-role-intel__icon">🃏</span>
                <span>愚者之戏</span>
              </div>
              <p className="werewolf-role-intel__tip">
                {self.idiotRevealed ? '你已翻牌免死，虽无法投票但可继续发言洞察全场。' : '装疯卖傻，若在白天被放逐可翻牌免死。'}
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
          <span className="werewolf-spotlight__speaker-tag">正在发言</span>
          <strong className="werewolf-spotlight__speaker-name">{speakingSeat.seatLabel} {speakingSeat.name}</strong>
        </div>
      </div>
    );
  }

  return null;
}
