import React from 'react';
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import { JungleBackground } from './TitleScene';
import {
  DurianCardGraphic,
  type MonkeySpecial,
  MONKEY_SPECIAL_COLORS,
  MONKEY_SPECIAL_DESCS,
  MONKEY_SPECIAL_ICONS,
  MONKEY_SPECIAL_NAMES,
} from '../components/DurianCardGraphic';
import { COLOR, FONT, cardPanel, glassPanel, pillTag } from '../lib/theme';
import { fadeInOut } from '../lib/transitions';

export const MonkeyCardsScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const opacity = fadeInOut(frame, durationInFrames, 15, 15);
  const titleEnter = spring({ frame, fps, config: { damping: 14 } });

  const monkeySpecials: MonkeySpecial[] = ['flip', 'do_nothing', 'three_void', 'banana_void'];

  return (
    <JungleBackground>
      <AbsoluteFill style={{ opacity, padding: '50px 80px', boxSizing: 'border-box' }}>
        {/* 标题 */}
        <div
          style={{
            textAlign: 'center',
            transform: `translateY(${interpolate(titleEnter, [0, 1], [-40, 0])}px)`,
            opacity: titleEnter,
          }}
        >
          <div
            style={{
              ...pillTag({ bg: 'rgba(59,130,246,0.2)', borderColor: '#3b82f6' }),
              display: 'inline-block',
              color: '#93c5fd',
              marginBottom: 10,
            }}
          >
            SPECIAL 乱入搅局
          </div>
          <h2
            style={{
              fontFamily: FONT.family,
              fontSize: 48,
              fontWeight: FONT.heavy,
              color: COLOR.white,
              margin: 0,
              textShadow: '0 4px 20px rgba(0,0,0,0.6)',
            }}
          >
            4 张小猴功能牌 · <span style={{ color: COLOR.gold }}>瞬间逆转桌面需求</span>
          </h2>
        </div>

        {/* 4 张小猴卡片并排展示 */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 24,
            marginTop: 45,
          }}
        >
          {monkeySpecials.map((special, index) => {
            const cardSpring = spring({
              frame: frame - index * 12,
              fps,
              config: { damping: 14 },
            });
            const color = MONKEY_SPECIAL_COLORS[special];
            const isHover = Math.sin((frame - index * 15) * 0.08) * 6;

            return (
              <div
                key={special}
                style={{
                  ...cardPanel({ border: `3px solid ${color}` }),
                  transform: `translateY(${interpolate(cardSpring, [0, 1], [60, isHover])}px) scale(${cardSpring})`,
                  opacity: cardSpring,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  padding: '24px 16px',
                  boxSizing: 'border-box',
                }}
              >
                <DurianCardGraphic
                  card={{ kind: 'monkey', special }}
                  width={240}
                  height={150}
                  glowColor={color}
                />

                {/* 强化说明卡片 */}
                <div
                  style={{
                    ...glassPanel({ border: `2.5px solid ${color}` }),
                    marginTop: 20,
                    padding: '14px 16px',
                    textAlign: 'center',
                    width: '100%',
                    boxSizing: 'border-box',
                  }}
                >
                  <div style={{ fontFamily: FONT.family, fontSize: 18, fontWeight: FONT.heavy, color, marginBottom: 6 }}>
                    {MONKEY_SPECIAL_ICONS[special]} {MONKEY_SPECIAL_NAMES[special]}
                  </div>
                  <div style={{ fontFamily: FONT.family, fontSize: 14, color: COLOR.cream, fontWeight: FONT.bold, lineHeight: 1.5 }}>
                    {MONKEY_SPECIAL_DESCS[special]}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* 底部小贴士 */}
        <div
          style={{
            ...glassPanel({ border: `2.5px solid rgba(250,204,21,0.5)` }),
            marginTop: 40,
            textAlign: 'center',
            fontSize: 18,
            fontWeight: FONT.bold,
            fontFamily: FONT.family,
            color: '#fef08a',
            padding: '12px 32px',
            display: 'inline-block',
            margin: '40px auto 0',
          }}
        >
          🐒 摸到猴子牌后直接打出，可能让原本安全的局面瞬间超卖，或将超卖危机一键化解！
        </div>
      </AbsoluteFill>
    </JungleBackground>
  );
};
