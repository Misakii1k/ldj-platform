import React from 'react';
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import { JungleBackground } from './TitleScene';
import { DurianCardGraphic } from '../components/DurianCardGraphic';
import { FruitIcon, FRUIT_NAMES, type DurianFruit } from '../components/FruitGraphic';
import { RADIUS, FONT, cardPanel, glassPanel, pillTag } from '../lib/theme';
import { fadeInOut } from '../lib/transitions';

export const PlacementRuleScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const titleEnter = spring({ frame, fps, config: { damping: 14 } });
  const cardFlyIn = spring({ frame: frame - 15, fps, config: { damping: 12, stiffness: 80 } });
  const chooseAction = spring({ frame: frame - 60, fps, config: { damping: 14 } });
  const boardUpdate = spring({ frame: frame - 90, fps, config: { damping: 14 } });

  const opacity = fadeInOut(frame, durationInFrames, 15, 15);
  const isLeftActive = frame >= 60;

  const tableDemands: { fruit: DurianFruit; count: number }[] = [
    { fruit: 'durian', count: 0 },
    { fruit: 'strawberry', count: frame >= 90 ? 2 : 0 },
    { fruit: 'banana', count: 0 },
    { fruit: 'grape', count: 0 },
    { fruit: 'apple', count: 0 },
  ];

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
            RULE ② 回合行动
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
            摸牌出单 · <span style={{ color: '#facc15' }}>二选一生效加入采购看板</span>
          </h2>
        </div>

        {/* 交互演示区域 */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 70,
            marginTop: 40,
          }}
        >
          {/* 左侧：抽到的双拼牌 */}
          <div
            style={{
              ...cardPanel(),
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              padding: '24px',
              transform: `scale(${cardFlyIn})`,
              opacity: cardFlyIn,
            }}
          >
            <div
              style={{
                fontSize: 16,
                fontWeight: 800,
                color: '#10b981',
                marginBottom: 12,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <span>🎴 抽到的水果双拼卡</span>
            </div>

            <DurianCardGraphic
              card={{
                kind: 'fruit',
                left: { fruit: 'strawberry', quantity: 2 },
                right: { fruit: 'banana', quantity: 1 },
              }}
              checkHalf={isLeftActive ? 'left' : undefined}
              isLarge
              width={340}
              height={210}
              highlightHalf={isLeftActive ? 'left' : null}
            />

            <div
              style={{
                ...pillTag(),
                marginTop: 14,
                fontSize: 15,
                color: '#fef08a',
                fontWeight: 700,
                background: 'rgba(0,0,0,0.5)',
                padding: '4px 14px',
              }}
            >
              {isLeftActive ? '选择：✓ 生效草莓 ×2 ｜ ✗ 作废香蕉 ×1' : '请点击选择要生效的半边'}
            </div>
          </div>

          {/* 中间推牌箭头 */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 8,
              transform: `scale(${chooseAction})`,
              opacity: chooseAction,
            }}
          >
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M5 12H19M19 12L12 5M19 12L12 19" stroke="#facc15" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ filter: 'drop-shadow(0px 3px 0px #2d261e)' }}/>
            </svg>
            <span
              style={{
                ...pillTag(),
                fontSize: 14,
                fontWeight: 800,
                color: '#10b981',
                background: 'rgba(16,185,129,0.2)',
                padding: '4px 10px',
                border: '2.5px solid #10b981',
              }}
            >
              推入中央板
            </span>
          </div>

          {/* 右侧：中央采购看板 (真实游戏内 UI 风格) */}
          <div
            style={{
              ...glassPanel(),
              transform: `scale(${boardUpdate})`,
              opacity: boardUpdate,
              padding: '24px 30px',
              minWidth: 380,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderBottom: '2.5px solid rgba(255,255,255,0.15)',
                paddingBottom: 12,
                marginBottom: 16,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 20 }}>📋</span>
                <span style={{ fontSize: 18, fontWeight: 900, color: '#fef08a' }}>桌面累计需求 (✓)</span>
              </div>
              <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 700 }}>持续累加</span>
            </div>

            {/* 水果需求条目 */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {tableDemands.map((item) => (
                <div
                  key={item.fruit}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    background:
                      item.count > 0 ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.05)',
                    border:
                      item.count > 0
                        ? '2.5px solid #ef4444'
                        : '2.5px solid rgba(255,255,255,0.08)',
                    borderRadius: RADIUS.sm,
                    padding: '8px 16px',
                    transition: 'all 0.3s',
                    boxShadow: item.count > 0 ? '0 3px 0 #ef4444' : 'none',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <FruitIcon fruit={item.fruit} size={28} />
                    <span style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>
                      {FRUIT_NAMES[item.fruit]}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span
                      style={{
                        fontSize: 22,
                        fontWeight: 900,
                        color: item.count > 0 ? '#f87171' : '#cbd5e1',
                      }}
                    >
                      {item.count}
                    </span>
                    {item.count > 0 && (
                      <span
                        style={{
                          ...pillTag(),
                          fontSize: 12,
                          fontWeight: 800,
                          color: '#22c55e',
                          background: 'rgba(34,197,94,0.2)',
                          padding: '1px 6px',
                        }}
                      >
                        +2
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 底部提示 */}
        <div
          style={{
            ...glassPanel(),
            marginTop: 35,
            padding: '12px 24px',
            textAlign: 'center',
            fontSize: 18,
            fontWeight: 700,
            color: '#cbd5e1',
            width: 'max-content',
            margin: '35px auto 0',
          }}
        >
          ⚠️ 随着回合推进，桌上水果需求不断攀升，超卖风险越来越高！
        </div>
      </AbsoluteFill>
    </JungleBackground>
  );
};
