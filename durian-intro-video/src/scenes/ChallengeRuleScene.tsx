import React from 'react';
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import { JungleBackground } from './TitleScene';
import { BellGraphic } from '../components/BellGraphic';
import { GorillaManager } from '../components/GorillaManager';
import { ShowdownBoard } from '../components/ShowdownBoard';
import { COLOR, FONT, cardPanel, glassPanel, pillTag } from '../lib/theme';
import { fadeInOut } from '../lib/transitions';

export const ChallengeRuleScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const opacity = fadeInOut(frame, durationInFrames, 15, 15);
  const titleEnter = spring({ frame, fps, config: { damping: 14 } });
  const bellRinging = frame >= 20 && frame <= 80;
  const shakeDeg = bellRinging ? Math.sin(frame * 0.8) * 10 : 0;

  const gorillaEnter = spring({ frame: frame - 40, fps, config: { damping: 12, stiffness: 85 } });
  const showdownEnter = spring({ frame: frame - 90, fps, config: { damping: 14 } });
  const stampProgress = spring({ frame: frame - 130, fps, config: { damping: 10, stiffness: 120 } });

  return (
    <JungleBackground>
      <AbsoluteFill style={{ opacity, padding: '40px 80px', boxSizing: 'border-box' }}>
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
              ...pillTag({ bg: 'rgba(239,68,68,0.2)', borderColor: '#ef4444' }),
              display: 'inline-block',
              color: '#fca5a5',
              marginBottom: 8,
            }}
          >
            RULE ③ 高潮时刻
          </div>
          <h2
            style={{
              fontFamily: FONT.family,
              fontSize: 44,
              fontWeight: FONT.heavy,
              color: COLOR.white,
              margin: 0,
              textShadow: '0 4px 20px rgba(0,0,0,0.6)',
            }}
          >
            按铃质疑 · <span style={{ color: COLOR.gold }}>叫来猩猩店长查账大对决</span>
          </h2>
        </div>

        {/* 动态舞台 */}
        {frame < 90 ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 90,
              marginTop: 50,
            }}
          >
            {/* 拍铃 */}
            <div style={{ ...cardPanel(), padding: '30px 40px', textAlign: 'center' }}>
              <BellGraphic
                size={160}
                isRinging={bellRinging}
                shakeDeg={shakeDeg}
                label="🔔 拍铃质疑上家"
                sublabel="“你采购的水果超卖了！”"
              />
            </div>

            {/* 箭头 */}
            <div style={{ fontFamily: FONT.family, fontSize: 60, fontWeight: FONT.heavy, color: COLOR.gold, textShadow: '0 4px 0 #2d261e' }}>➔</div>

            {/* 猩猩店长暴怒登场 */}
            <div
              style={{
                transform: `scale(${gorillaEnter}) rotate(${interpolate(gorillaEnter, [0, 1], [15, 0])}deg)`,
                opacity: gorillaEnter,
              }}
            >
              <GorillaManager mood="angry" angerLevel={4} size={200} showAngerBar />
            </div>
          </div>
        ) : (
          /* 查账结算大看板 */
          <div
            style={{
              ...glassPanel({ border: `3px solid ${COLOR.success}` }),
              padding: '30px 50px',
              marginTop: 25,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              transform: `scale(${showdownEnter})`,
              opacity: showdownEnter,
            }}
          >
            <ShowdownBoard
              challengerName="你 (小狐狸)"
              accusedName="玩家 A (小狮子)"
              round={2}
              isSuccess={true}
              loserName="玩家 A"
              penaltyPoints={2}
              stampProgress={stampProgress}
              comparisons={[
                { fruit: 'strawberry', tableCount: 5, stockCount: 3 },
                { fruit: 'banana', tableCount: 2, stockCount: 4 },
                { fruit: 'durian', tableCount: 0, stockCount: 1 },
                { fruit: 'grape', tableCount: 3, stockCount: 3 },
                { fruit: 'apple', tableCount: 1, stockCount: 2 },
              ]}
            />

            {/* 判定总结 */}
            <div
              style={{
                display: 'flex',
                gap: 40,
                marginTop: 30,
              }}
            >
              <div
                style={{
                  ...cardPanel({ bg: 'rgba(34,197,94,0.1)', border: `3px solid ${COLOR.success}` }),
                  padding: '12px 24px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                }}
              >
                <span style={{ fontSize: 28, color: COLOR.success, fontWeight: FONT.heavy, textShadow: '0 2px 0 #2d261e' }}>✓</span>
                <span style={{ fontFamily: FONT.family, fontSize: 16, color: COLOR.success, fontWeight: FONT.bold }}>
                  任何一种水果 需求 {'>'} 库存 ➔ <strong>质疑成功（上家受罚）</strong>
                </span>
              </div>

              <div
                style={{
                  ...cardPanel({ bg: 'rgba(239,68,68,0.1)', border: `3px solid ${COLOR.danger}` }),
                  padding: '12px 24px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                }}
              >
                <span style={{ fontSize: 28, color: COLOR.danger, fontWeight: FONT.heavy, textShadow: '0 2px 0 #2d261e' }}>✗</span>
                <span style={{ fontFamily: FONT.family, fontSize: 16, color: COLOR.danger, fontWeight: FONT.bold }}>
                  所有水果 需求 ≤ 库存 ➔ <strong>质疑失败（按铃者受罚）</strong>
                </span>
              </div>
            </div>
          </div>
        )}
      </AbsoluteFill>
    </JungleBackground>
  );
};
