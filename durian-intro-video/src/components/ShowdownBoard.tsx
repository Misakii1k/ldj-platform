import React from 'react';
import { FruitIcon, FRUIT_NAMES, type DurianFruit } from './FruitGraphic';

export interface FruitComparison {
  fruit: DurianFruit;
  tableCount: number;
  stockCount: number;
}

interface ShowdownBoardProps {
  challengerName: string;
  accusedName: string;
  comparisons: FruitComparison[];
  round: number;
  isSuccess: boolean;
  loserName: string;
  penaltyPoints: number;
  stampProgress?: number; // 0 to 1
  style?: React.CSSProperties;
}

export const ShowdownBoard: React.FC<ShowdownBoardProps> = ({
  challengerName,
  accusedName,
  comparisons,
  round,
  isSuccess,
  loserName,
  penaltyPoints,
  stampProgress = 1,
  style = {},
}) => {
  return (
    <div
      style={{
        background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.95), rgba(30, 41, 59, 0.95))',
        border: isSuccess ? '3px solid #ef4444' : '3px solid #10b981',
        borderRadius: 24,
        padding: 24,
        boxShadow: isSuccess
          ? '0 20px 60px rgba(239,68,68,0.4), 0 0 30px rgba(0,0,0,0.8)'
          : '0 20px 60px rgba(16,185,129,0.4), 0 0 30px rgba(0,0,0,0.8)',
        backdropFilter: 'blur(16px)',
        color: '#fff',
        maxWidth: 1080,
        width: '100%',
        boxSizing: 'border-box',
        ...style,
      }}
    >
      {/* 顶部横幅 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid rgba(255,255,255,0.15)',
          paddingBottom: 16,
          marginBottom: 20,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div
            style={{
              fontSize: 36,
              background: isSuccess ? '#ef4444' : '#10b981',
              borderRadius: 14,
              padding: '6px 12px',
            }}
          >
            {isSuccess ? '💥' : '🛡️'}
          </div>
          <div>
            <div style={{ fontSize: 24, fontWeight: 900, letterSpacing: 1 }}>
              {isSuccess ? '质疑成功！水果真实超卖' : '质疑失败！库存完全充足'}
            </div>
            <div style={{ fontSize: 14, color: '#94a3b8', marginTop: 4 }}>
              质疑者：<strong style={{ color: '#38bdf8' }}>{challengerName}</strong> · 被质疑上家：
              <strong style={{ color: '#f59e0b' }}>{accusedName}</strong>
            </div>
          </div>
        </div>

        {/* 罚分徽章 */}
        <div
          style={{
            background: 'linear-gradient(135deg, #ef4444, #b91c1c)',
            padding: '8px 20px',
            borderRadius: 16,
            textAlign: 'center',
            boxShadow: '0 4px 16px rgba(239,68,68,0.5)',
          }}
        >
          <div style={{ fontSize: 11, color: '#fecaca', fontWeight: 700 }}>第 {round} 轮惩罚</div>
          <div style={{ fontSize: 20, fontWeight: 900, color: '#fff' }}>
            {loserName} +{penaltyPoints} 分
          </div>
        </div>
      </div>

      {/* 5 种水果 PK 卡片 */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(5, 1fr)',
          gap: 14,
        }}
      >
        {comparisons.map((item) => {
          const isOversold = item.tableCount > item.stockCount;
          const diff = item.tableCount - item.stockCount;

          return (
            <div
              key={item.fruit}
              style={{
                background: isOversold
                  ? 'linear-gradient(180deg, rgba(239,68,68,0.2) 0%, rgba(15,23,42,0.6) 100%)'
                  : 'linear-gradient(180deg, rgba(16,185,129,0.12) 0%, rgba(15,23,42,0.6) 100%)',
                border: isOversold ? '2px solid #ef4444' : '1.5px solid rgba(255,255,255,0.1)',
                borderRadius: 16,
                padding: '14px 10px',
                textAlign: 'center',
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              {/* 水果标题 */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 12 }}>
                <FruitIcon fruit={item.fruit} size={28} />
                <span style={{ fontSize: 15, fontWeight: 800 }}>{FRUIT_NAMES[item.fruit]}</span>
              </div>

              {/* 需求 VS 库存 */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-around',
                  background: 'rgba(0,0,0,0.3)',
                  borderRadius: 10,
                  padding: '8px 4px',
                  marginBottom: 12,
                }}
              >
                <div>
                  <div style={{ fontSize: 10, color: '#cbd5e1' }}>桌面需求</div>
                  <div
                    style={{
                      fontSize: 22,
                      fontWeight: 900,
                      color: isOversold ? '#f87171' : '#fff',
                    }}
                  >
                    {item.tableCount}
                  </div>
                </div>

                <div style={{ fontSize: 12, color: '#64748b', fontWeight: 800 }}>VS</div>

                <div>
                  <div style={{ fontSize: 10, color: '#cbd5e1' }}>暗牌库存</div>
                  <div
                    style={{
                      fontSize: 22,
                      fontWeight: 900,
                      color: isOversold ? '#94a3b8' : '#34d399',
                    }}
                  >
                    {item.stockCount}
                  </div>
                </div>
              </div>

              {/* 状态印章 */}
              <div
                style={{
                  padding: '4px 8px',
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 800,
                  background: isOversold ? '#ef4444' : '#10b981',
                  color: '#fff',
                  transform: `scale(${stampProgress})`,
                  boxShadow: isOversold ? '0 2px 8px rgba(239,68,68,0.5)' : '0 2px 8px rgba(16,185,129,0.5)',
                }}
              >
                {isOversold ? `💥 超卖 +${diff}` : `✓ 充足 余 ${item.stockCount - item.tableCount}`}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
