import React from 'react';
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import { JungleBackground } from './TitleScene';
import { PlayerAvatar, type PlayerInfo } from '../components/PlayerAvatar';
import { FONT, cardPanel, glassPanel, pillTag } from '../lib/theme';
import { fadeInOut } from '../lib/transitions';

export const ForeheadRuleScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const titleEnter = spring({ frame, fps, config: { damping: 14 } });
  const p1Enter = spring({ frame: frame - 15, fps, config: { damping: 14 } });
  const p2Enter = spring({ frame: frame - 25, fps, config: { damping: 14 } });
  const p3Enter = spring({ frame: frame - 35, fps, config: { damping: 14 } });
  const p4Enter = spring({ frame: frame - 45, fps, config: { damping: 14 } });

  const explainEnter = spring({ frame: frame - 70, fps, config: { damping: 14 } });
  const pulseFocus = Math.sin(frame * 0.1) * 6;

  const opacity = fadeInOut(frame, durationInFrames, 15, 15);

  const players: PlayerInfo[] = [
    {
      id: 'p1',
      name: '玩家 A (小狮子)',
      avatarEmoji: '🦁',
      color: '#f59e0b',
      card: {
        kind: 'fruit',
        left: { fruit: 'strawberry', quantity: 2 },
        right: { fruit: 'apple', quantity: 1 },
      },
    },
    {
      id: 'p2',
      name: '玩家 B (小熊猫)',
      avatarEmoji: '🐼',
      color: '#10b981',
      card: {
        kind: 'fruit',
        left: { fruit: 'banana', quantity: 2 },
        right: { fruit: 'grape', quantity: 1 },
      },
    },
    {
      id: 'p3',
      name: '你 (小狐狸)',
      avatarEmoji: '🦊',
      color: '#ef4444',
      isMe: true,
      cardHiddenToMe: true,
      card: {
        kind: 'fruit',
        left: { fruit: 'strawberry', quantity: 2 },
        right: { fruit: 'banana', quantity: 1 },
      },
    },
    {
      id: 'p4',
      name: '玩家 D (小棕熊)',
      avatarEmoji: '🐻',
      color: '#8b5cf6',
      card: {
        kind: 'fruit',
        left: { fruit: 'grape', quantity: 3 },
        right: { fruit: 'apple', quantity: 1 },
      },
    },
  ];

  return (
    <JungleBackground>
      <AbsoluteFill style={{ padding: '60px 80px', boxSizing: 'border-box', opacity, fontFamily: FONT.family }}>
        {/* 顶部场景标题 */}
        <div
          style={{
            textAlign: 'center',
            transform: `translateY(${interpolate(titleEnter, [0, 1], [-40, 0])}px)`,
            opacity: titleEnter,
          }}
        >
          <div
            style={{
              ...pillTag(),
              display: 'inline-block',
              padding: '6px 20px',
              background: 'rgba(234,179,8,0.2)',
              border: '2.5px solid #eab308',
              fontSize: 18,
              fontWeight: 800,
              color: '#fef08a',
              marginBottom: 10,
            }}
          >
            RULE ① 核心机制
          </div>
          <h2
            style={{
              fontSize: 48,
              fontWeight: 900,
              color: '#fff',
              margin: 0,
              textShadow: '0 4px 0 #2d261e',
            }}
          >
            头顶暗牌 · <span style={{ color: '#facc15' }}>看得见别人，看不见自己</span>
          </h2>
        </div>

        {/* 玩家环形卡牌舞台 */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'flex-end',
            gap: 50,
            marginTop: 50,
          }}
        >
          {/* P1 */}
          <div
            style={{
              ...cardPanel(),
              padding: '16px',
              transform: `translateY(${interpolate(p1Enter, [0, 1], [60, 0])}px)`,
              opacity: p1Enter,
            }}
          >
            <PlayerAvatar player={players[0]!} cardScale={1.15} />
            <div style={{ textAlign: 'center', marginTop: 8, fontSize: 13, color: '#10b981', fontWeight: 700 }}>
              👁️ 你清晰可见
            </div>
          </div>

          {/* P2 */}
          <div
            style={{
              ...cardPanel(),
              padding: '16px',
              transform: `translateY(${interpolate(p2Enter, [0, 1], [60, 0])}px)`,
              opacity: p2Enter,
            }}
          >
            <PlayerAvatar player={players[1]!} cardScale={1.15} />
            <div style={{ textAlign: 'center', marginTop: 8, fontSize: 13, color: '#10b981', fontWeight: 700 }}>
              👁️ 你清晰可见
            </div>
          </div>

          {/* P3 (你) - 特殊焦点 */}
          <div
            style={{
              ...cardPanel(),
              padding: '16px 20px',
              transform: `translateY(${interpolate(p3Enter, [0, 1], [60, pulseFocus])}px) scale(1.08)`,
              opacity: p3Enter,
              background: 'rgba(239,68,68,0.12)',
              borderColor: '#facc15',
            }}
          >
            <PlayerAvatar player={players[2]!} cardScale={1.18} highlightCard />
            <div style={{ textAlign: 'center', marginTop: 8, fontSize: 14, color: '#facc15', fontWeight: 800 }}>
              ❓ 自己完全未知（他人可见）
            </div>
          </div>

          {/* P4 */}
          <div
            style={{
              ...cardPanel(),
              padding: '16px',
              transform: `translateY(${interpolate(p4Enter, [0, 1], [60, 0])}px)`,
              opacity: p4Enter,
            }}
          >
            <PlayerAvatar player={players[3]!} cardScale={1.15} />
            <div style={{ textAlign: 'center', marginTop: 8, fontSize: 13, color: '#10b981', fontWeight: 700 }}>
              👁️ 你清晰可见
            </div>
          </div>
        </div>

        {/* 底部机制要点卡片 */}
        <div
          style={{
            ...glassPanel(),
            marginTop: 45,
            maxWidth: 960,
            margin: '45px auto 0',
            padding: '20px 36px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            transform: `translateY(${interpolate(explainEnter, [0, 1], [30, 0])}px)`,
            opacity: explainEnter,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <span style={{ fontSize: 36 }}>💡</span>
            <div>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#fef08a' }}>
                库存总和 = 所有存活玩家头顶暗牌水果的累加！
              </div>
              <div style={{ fontSize: 15, color: '#cbd5e1', marginTop: 4, fontWeight: 700 }}>
                你必须根据别人的暗牌、以及他们出牌时的神态选择，反推出自己头顶到底有什么！
              </div>
            </div>
          </div>
          <div
            style={{
              ...cardPanel(),
              background: '#facc15',
              color: '#2d261e',
              fontWeight: 900,
              fontSize: 15,
              padding: '8px 18px',
              whiteSpace: 'nowrap',
            }}
          >
            信息差博弈
          </div>
        </div>
      </AbsoluteFill>
    </JungleBackground>
  );
};
