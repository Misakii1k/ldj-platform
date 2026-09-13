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
import { DurianCardGraphic } from '../components/DurianCardGraphic';
import { FruitIcon, type DurianFruit } from '../components/FruitGraphic';
import { ShowdownBoard } from '../components/ShowdownBoard';
import { SHADOW, RADIUS, COLOR, FONT, cardPanel, glassPanel, pillTag } from '../lib/theme';
import { fadeInOut } from '../lib/transitions';

export const DemoGameplayScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const opacity = fadeInOut(frame, durationInFrames, 15, 15);
  const titleEnter = spring({ frame, fps, config: { damping: 14 } });

  // 阶段定义
  // 0~60: P1 出单 🍓2
  // 60~120: P2 出单 🍌2
  // 120~180: P3(你) 出单 🍓1
  // 180~240: P4 出单 🍓1 (草莓达4)
  // 240~360: P1 误判按铃质疑 P4 -> 翻牌大结算

  const phase =
    frame < 60
      ? 1
      : frame < 120
        ? 2
        : frame < 180
          ? 3
          : frame < 240
            ? 4
            : 5;

  const currentTurnPlayer =
    phase === 1 ? 'p1' : phase === 2 ? 'p2' : phase === 3 ? 'p3' : phase === 4 ? 'p4' : 'p1';

  const isShowdown = phase === 5;
  const isRevealed = isShowdown;

  // 玩家状态
  const players: PlayerInfo[] = [
    {
      id: 'p1',
      name: '玩家 A (小狮子)',
      avatarEmoji: '🦁',
      color: '#f59e0b',
      isCurrentTurn: currentTurnPlayer === 'p1',
      penalty: phase === 5 && frame >= 300 ? 1 : 0,
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
      isCurrentTurn: currentTurnPlayer === 'p2',
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
      cardHiddenToMe: !isRevealed,
      isCurrentTurn: currentTurnPlayer === 'p3',
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
      isCurrentTurn: currentTurnPlayer === 'p4',
      card: {
        kind: 'fruit',
        left: { fruit: 'grape', quantity: 3 },
        right: { fruit: 'apple', quantity: 1 },
      },
    },
  ];

  // 桌面需求统计
  const strawberryCount = phase === 1 ? 2 : phase === 2 ? 2 : phase === 3 ? 3 : 4;
  const bananaCount = phase >= 2 ? 2 : 0;

  const tableDemands: { fruit: DurianFruit; count: number }[] = [
    { fruit: 'strawberry', count: strawberryCount },
    { fruit: 'banana', count: bananaCount },
    { fruit: 'durian', count: 0 },
    { fruit: 'grape', count: 0 },
    { fruit: 'apple', count: 0 },
  ];

  return (
    <JungleBackground>
      <AbsoluteFill style={{ padding: '35px 70px', boxSizing: 'border-box', opacity, fontFamily: FONT.family }}>
        {/* 顶部标题 */}
        <div
          style={{
            textAlign: 'center',
            transform: `translateY(${interpolate(titleEnter, [0, 1], [-30, 0])}px)`,
            opacity: titleEnter,
          }}
        >
          <div
            style={{
              ...pillTag({ bg: 'rgba(234,179,8,0.2)', borderColor: COLOR.warning }),
              display: 'inline-block',
              color: COLOR.goldLight,
              marginBottom: 8,
            }}
          >
            DEMO 实战演练
          </div>
          <h2
            style={{
              fontSize: 40,
              fontWeight: FONT.heavy,
              color: COLOR.white,
              margin: 0,
              textShadow: '0 4px 20px rgba(0,0,0,0.6)',
            }}
          >
            真实 4 人对局示范 · <span style={{ color: COLOR.gold, textShadow: '0 4px 0 #2d261e' }}>心理博弈与盲区误判</span>
          </h2>
        </div>

        {/* 4 位玩家头顶牌行 */}
        <div
          style={{
            ...cardPanel({ bg: 'rgba(255,251,240,0.95)' }),
            display: 'flex',
            justifyContent: 'center',
            gap: 40,
            padding: '16px 32px',
            margin: '20px auto 0',
            width: 'fit-content'
          }}
        >
          {players.map((player) => (
            <PlayerAvatar
              key={player.id}
              player={player}
              cardScale={0.88}
              highlightCard={player.isCurrentTurn}
            />
          ))}
        </div>

        {/* 舞台中央：结算或出牌推进 */}
        {!isShowdown ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 40,
              marginTop: 25,
            }}
          >
            {/* 当前出牌展示 */}
            <div
              style={{
                ...glassPanel(),
                padding: '24px 32px',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: 16, fontWeight: FONT.bold, color: COLOR.goldLight, marginBottom: 12 }}>
                {phase === 1 && '🦁 玩家 A 摸牌出单：'}
                {phase === 2 && '🐼 玩家 B 摸牌出单：'}
                {phase === 3 && '🦊 你 (小狐狸) 摸牌出单：'}
                {phase === 4 && '🐻 玩家 D 摸牌出单：'}
              </div>

              {phase === 1 && (
                <DurianCardGraphic
                  card={{
                    kind: 'fruit',
                    left: { fruit: 'strawberry', quantity: 2 },
                    right: { fruit: 'apple', quantity: 1 },
                  }}
                  checkHalf="left"
                  width={250}
                  height={130}
                />
              )}
              {phase === 2 && (
                <DurianCardGraphic
                  card={{
                    kind: 'fruit',
                    left: { fruit: 'banana', quantity: 2 },
                    right: { fruit: 'grape', quantity: 1 },
                  }}
                  checkHalf="left"
                  width={250}
                  height={130}
                />
              )}
              {phase === 3 && (
                <DurianCardGraphic
                  card={{
                    kind: 'fruit',
                    left: { fruit: 'strawberry', quantity: 1 },
                    right: { fruit: 'grape', quantity: 1 },
                  }}
                  checkHalf="left"
                  width={250}
                  height={130}
                />
              )}
              {phase === 4 && (
                <DurianCardGraphic
                  card={{
                    kind: 'fruit',
                    left: { fruit: 'strawberry', quantity: 1 },
                    right: { fruit: 'apple', quantity: 2 },
                  }}
                  checkHalf="left"
                  width={250}
                  height={130}
                />
              )}
            </div>

            {/* 桌面采购需求看板 */}
            <div
              style={{
                ...glassPanel({ bg: 'linear-gradient(135deg, rgba(15,23,42,0.95), rgba(30,41,59,0.95))' }),
                padding: '24px 32px',
                minWidth: 320,
              }}
            >
              <div style={{ fontSize: 18, fontWeight: FONT.heavy, color: COLOR.goldLight, marginBottom: 12 }}>
                📋 桌面实时累计需求
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                {tableDemands.map((item) => (
                  <div
                    key={item.fruit}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      background: item.count > 0 ? 'rgba(239,68,68,0.15)' : 'rgba(255,255,255,0.05)',
                      border: item.count > 0 ? `2px solid ${COLOR.danger}` : `2px solid transparent`,
                      borderRadius: RADIUS.sm,
                      padding: '8px 16px',
                      boxShadow: item.count > 0 ? SHADOW.sm : 'none',
                    }}
                  >
                    <FruitIcon fruit={item.fruit} size={24} />
                    <span
                      style={{
                        fontSize: 18,
                        fontWeight: FONT.heavy,
                        color: item.count > 0 ? COLOR.danger : COLOR.muted,
                      }}
                    >
                      {item.count}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          /* 结算大看板 */
          <div style={{ marginTop: 20, display: 'flex', justifyContent: 'center' }}>
            <div style={{ ...glassPanel(), padding: '16px 24px' }}>
              <ShowdownBoard
                challengerName="玩家 A (小狮子)"
                accusedName="玩家 D (小棕熊)"
                round={1}
                isSuccess={false}
                loserName="玩家 A"
                penaltyPoints={1}
                comparisons={[
                  { fruit: 'strawberry', tableCount: 4, stockCount: 4 },
                  { fruit: 'banana', tableCount: 2, stockCount: 3 },
                  { fruit: 'durian', tableCount: 0, stockCount: 0 },
                  { fruit: 'grape', tableCount: 0, stockCount: 4 },
                  { fruit: 'apple', tableCount: 0, stockCount: 2 },
                ]}
              />
            </div>
          </div>
        )}

        {/* 底部叙事解说条 */}
        <div
          style={{
            ...glassPanel({ border: `3px solid ${COLOR.warning}` }),
            marginTop: 20,
            padding: '16px 24px',
            textAlign: 'center',
            fontSize: 18,
            color: COLOR.goldLight,
            fontWeight: FONT.bold,
            width: 'fit-content',
            margin: '25px auto 0',
          }}
        >
          {phase === 1 && '① 轮到玩家 A，抽卡选择【草莓 ×2】生效，草莓需求累加至 2。'}
          {phase === 2 && '② 轮到玩家 B，抽卡选择【香蕉 ×2】生效，香蕉需求累加至 2。'}
          {phase === 3 && '③ 轮到你 (小狐狸)，你不知道自己有草莓，选择【草莓 ×1】生效，草莓需求达到 3！'}
          {phase === 4 && '④ 轮到玩家 D，继续加单【草莓 ×1】，草莓需求达到 4！危险迫近！'}
          {phase === 5 &&
            '⑤ 玩家 A 盲区误判（以为草莓总数只有2个）按铃质疑玩家 D！翻牌后草莓总库存恰好为 4（A有2+你也有2），未超卖！玩家 A 质疑失败受罚！'}
        </div>
      </AbsoluteFill>
    </JungleBackground>
  );
};
