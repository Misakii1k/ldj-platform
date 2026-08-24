import React from 'react';
import {
  AbsoluteFill,
  interpolate,
  interpolateColors,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import { JungleBackground } from './TitleScene';
import { BG, BORDER, SHADOW, RADIUS, COLOR, FONT, cardPanel, glassPanel, pillTag } from '../lib/theme';
import { fadeInOut } from '../lib/transitions';

export const PenaltySystemScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const opacity = fadeInOut(frame, durationInFrames, 15, 15);

  const titleEnter = spring({ frame, fps, config: { damping: 14 } });
  const roundAnim = Math.min(Math.floor(frame / 20) + 1, 7);

  const barProgress = (roundAnim / 7) * 100;
  const barColor = interpolateColors(roundAnim, [1, 4, 7], ['#10b981', '#f59e0b', '#ef4444']);

  const cardsEnter = spring({ frame: frame - 40, fps, config: { damping: 14 } });

  return (
    <JungleBackground>
      <AbsoluteFill style={{ padding: '50px 80px', boxSizing: 'border-box', opacity, fontFamily: FONT.family }}>
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
              ...pillTag({ bg: 'rgba(239,68,68,0.2)', borderColor: COLOR.danger }),
              display: 'inline-block',
              color: '#fca5a5',
              marginBottom: 12,
            }}
          >
            RULE ④ 惩罚与胜负
          </div>
          <h2
            style={{
              fontSize: 46,
              fontWeight: FONT.heavy,
              color: COLOR.white,
              margin: 0,
              textShadow: '0 4px 20px rgba(0,0,0,0.6)',
            }}
          >
            店长怒气值递增 · <span style={{ color: COLOR.gold, textShadow: '0 4px 0 #2d261e' }}>累计超 7 分立即淘汰！</span>
          </h2>
        </div>

        {/* 怒气进度条 */}
        <div
          style={{
            ...glassPanel(),
            maxWidth: 880,
            margin: '40px auto 0',
            padding: '28px 40px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <span style={{ fontSize: 20, fontWeight: FONT.bold, color: COLOR.goldLight }}>
              🦍 店长怒气升级系统
            </span>
            <span style={{ fontSize: 22, fontWeight: FONT.heavy, color: barColor }}>
              第 {roundAnim} 轮 ➔ 输家获得 +{roundAnim} 罚分
            </span>
          </div>

          {/* 进度条轨道 */}
          <div
            style={{
              height: 56,
              background: 'rgba(0,0,0,0.5)',
              borderRadius: RADIUS.pill,
              border: BORDER.thick,
              overflow: 'hidden',
              position: 'relative',
              boxShadow: 'inset 0 4px 10px rgba(0,0,0,0.6)',
            }}
          >
            <div
              style={{
                width: `${barProgress}%`,
                height: '100%',
                background: 'linear-gradient(90deg, #10b981 0%, #f59e0b 50%, #ef4444 100%)',
                borderRadius: RADIUS.pill,
                boxShadow: `0 0 20px ${barColor}`,
                transition: 'width 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
              }}
            />

            {/* 刻度线 */}
            {[1, 2, 3, 4, 5, 6, 7].map((n) => (
              <div
                key={n}
                style={{
                  position: 'absolute',
                  left: `${(n / 7) * 100}%`,
                  top: 0,
                  bottom: 0,
                  width: 4,
                  background: BORDER.color,
                }}
              />
            ))}
          </div>

          {/* 轮次数字 */}
          <div style={{ display: 'flex', justifyContent: 'space-around', marginTop: 12 }}>
            {[1, 2, 3, 4, 5, 6, 7].map((n) => (
              <div
                key={n}
                style={{
                  textAlign: 'center',
                  fontSize: 16,
                  fontWeight: n === roundAnim ? FONT.heavy : FONT.bold,
                  color: n <= roundAnim ? COLOR.white : COLOR.muted,
                  transform: n === roundAnim ? 'scale(1.2)' : 'none',
                  transition: 'all 0.2s',
                }}
              >
                第 {n} 轮 (+{n})
              </div>
            ))}
          </div>
        </div>

        {/* 胜负双卡片说明 */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            gap: 36,
            marginTop: 40,
            transform: `scale(${cardsEnter})`,
            opacity: cardsEnter,
          }}
        >
          {/* 淘汰规则 */}
          <div
            style={{
              ...cardPanel({
                bg: 'linear-gradient(135deg, rgba(239,68,68,0.15) 0%, rgba(15,23,42,0.8) 100%)',
                border: `3px solid ${COLOR.danger}`
              }),
              flex: 1,
              maxWidth: 420,
              padding: '24px 32px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <span style={{ fontSize: 32 }}>💥</span>
              <span style={{ fontSize: 24, fontWeight: FONT.heavy, color: '#fca5a5' }}>
                累计罚分 {'>'} 7 分淘汰
              </span>
            </div>
            <div style={{ fontSize: 16, color: COLOR.muted, lineHeight: 1.6, fontWeight: FONT.medium }}>
              后期一轮失误（如第 4~7 轮）可能直接累计超 7 分惨遭淘汰！谨慎出单，心理博弈拉满！
            </div>
          </div>

          {/* 获胜规则 */}
          <div
            style={{
              ...cardPanel({
                bg: 'linear-gradient(135deg, rgba(250,204,21,0.15) 0%, rgba(15,23,42,0.8) 100%)',
                border: `3px solid ${COLOR.gold}`
              }),
              flex: 1,
              maxWidth: 420,
              padding: '24px 32px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <span style={{ fontSize: 32 }}>🏆</span>
              <span style={{ fontSize: 24, fontWeight: FONT.heavy, color: COLOR.goldLight }}>
                存活且罚分最少者获胜
              </span>
            </div>
            <div style={{ fontSize: 16, color: COLOR.muted, lineHeight: 1.6, fontWeight: FONT.medium }}>
              最多进行 7 轮，或直至场上决出胜负。保持低罚分、善用暗牌信息差诱导对手踩坑！
            </div>
          </div>
        </div>
      </AbsoluteFill>
    </JungleBackground>
  );
};
