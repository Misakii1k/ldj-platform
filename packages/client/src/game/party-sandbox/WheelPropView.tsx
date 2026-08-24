import { useState } from 'react';
import type { WheelProp } from './types.ts';
import { GameIcon } from '../../shared-ui/GameIcon.tsx';

interface WheelPropViewProps {
  prop: WheelProp;
  onSpin: () => void;
  onEditSegments: (segments: Array<{ label: string; color?: string }>) => void;
  disabled?: boolean;
}

const PALETTE = [
  '#ef4444',
  '#f59e0b',
  '#10b981',
  '#06b6d4',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
  '#14b8a6',
  '#f97316',
  '#6366f1',
];

export function WheelPropView({
  prop,
  onSpin,
  onEditSegments,
  disabled,
}: WheelPropViewProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [customText, setCustomText] = useState(
    prop.segments.map((s) => s.label).join('\n')
  );

  const handleSaveSegments = () => {
    const lines = customText
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    if (lines.length < 2) {
      alert('转盘至少需要 2 个选项！');
      return;
    }

    const newSegments = lines.map((label, idx) => ({
      label,
      color: PALETTE[idx % PALETTE.length],
    }));

    onEditSegments(newSegments);
    setIsEditing(false);
  };

  const segments = prop.segments.length >= 2 ? prop.segments : [
    { label: '选项 A', color: '#ef4444' },
    { label: '选项 B', color: '#3b82f6' },
  ];
  const count = segments.length;
  const sliceAngle = 360 / count;
  const radius = 90;
  const center = 100;

  // 生成 SVG 扇形路径
  const makeSectorPath = (index: number) => {
    const startAngle = (index * sliceAngle - 90) * (Math.PI / 180);
    const endAngle = ((index + 1) * sliceAngle - 90) * (Math.PI / 180);

    const x1 = center + radius * Math.cos(startAngle);
    const y1 = center + radius * Math.sin(startAngle);
    const x2 = center + radius * Math.cos(endAngle);
    const y2 = center + radius * Math.sin(endAngle);

    const largeArc = sliceAngle > 180 ? 1 : 0;
    return `M ${center} ${center} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z`;
  };

  return (
    <div className="sandbox-wheel-prop">
      <div className="sandbox-wheel-prop__header">
        <span className="sandbox-wheel-prop__title">🎡 {prop.title}</span>
        <button
          type="button"
          className="sandbox-wheel-edit-btn"
          onClick={() => setIsEditing(!isEditing)}
        >
          {isEditing ? '返回' : '编辑选项'}
        </button>
      </div>

      {isEditing ? (
        <div className="sandbox-wheel-editor">
          <label className="sandbox-wheel-editor__label">
            每行输入一个选项（支持玩家姓名、惩罚令或指令）：
          </label>
          <textarea
            className="sandbox-wheel-editor__textarea"
            rows={5}
            value={customText}
            onChange={(e) => setCustomText(e.target.value)}
            placeholder="喝半杯&#10;真心话&#10;大冒险&#10;指定他人喝"
          />
          <div className="sandbox-wheel-editor__actions">
            <button
              type="button"
              className="sandbox-btn sandbox-btn--cancel"
              onClick={() => setIsEditing(false)}
            >
              取消
            </button>
            <button
              type="button"
              className="sandbox-btn sandbox-btn--primary"
              onClick={handleSaveSegments}
            >
              保存选项
            </button>
          </div>
        </div>
      ) : (
        <div className="sandbox-wheel-display">
          {/* SVG 拟物转盘 */}
          <div className="sandbox-wheel-stage">
            {/* 金属指针 */}
            <div className="sandbox-wheel-top-pointer">
              <svg width="28" height="32" viewBox="0 0 28 32">
                <polygon
                  points="14,30 2,4 26,4"
                  fill="#ea580c"
                  stroke="#29241f"
                  strokeWidth="2.5"
                  strokeLinejoin="round"
                />
                <circle cx="14" cy="8" r="3" fill="#fef08a" />
              </svg>
            </div>

            {/* 旋转盘体 */}
            <div
              className="sandbox-wheel-disc-wrapper"
              style={{
                transform: `rotate(${prop.rotationAngle}deg)`,
                transition: 'transform 3.8s cubic-bezier(0.12, 0.9, 0.18, 1)',
              }}
            >
              <svg width="200" height="200" viewBox="0 0 200 200" className="sandbox-wheel-svg">
                {/* 投影外圈 */}
                <circle
                  cx={center}
                  cy={center}
                  r={radius + 4}
                  fill="#ffffff"
                  stroke="#29241f"
                  strokeWidth="3.5"
                />

                {/* 各扇区 */}
                {segments.map((seg, idx) => {
                  const color = seg.color || PALETTE[idx % PALETTE.length];
                  const midAngle = (idx + 0.5) * sliceAngle;
                  const textRad = (midAngle - 90) * (Math.PI / 180);
                  const textDist = radius * 0.65;
                  const tx = center + textDist * Math.cos(textRad);
                  const ty = center + textDist * Math.sin(textRad);

                  return (
                    <g key={idx}>
                      <path
                        d={makeSectorPath(idx)}
                        fill={color}
                        stroke="#29241f"
                        strokeWidth="2"
                      />
                      {/* 沿扇区中心旋转的文本 */}
                      <text
                        x={tx}
                        y={ty}
                        fill="#ffffff"
                        fontSize={count > 8 ? '8.5' : count > 5 ? '10' : '11.5'}
                        fontWeight="900"
                        textAnchor="middle"
                        dominantBaseline="central"
                        transform={`rotate(${midAngle + (midAngle > 90 && midAngle < 270 ? 180 : 0)}, ${tx}, ${ty})`}
                        style={{
                          textShadow: '0 1px 3px rgba(0,0,0,0.6)',
                          letterSpacing: '0.2px',
                        }}
                      >
                        {seg.label.length > 5 ? seg.label.slice(0, 4) + '…' : seg.label}
                      </text>
                    </g>
                  );
                })}

                {/* 轴心金币徽章 */}
                <circle
                  cx={center}
                  cy={center}
                  r="18"
                  fill="#fcd34d"
                  stroke="#29241f"
                  strokeWidth="2.5"
                />
                <circle
                  cx={center}
                  cy={center}
                  r="13"
                  fill="#f59e0b"
                  stroke="#29241f"
                  strokeWidth="1.5"
                />
                <text
                  x={center}
                  y={center}
                  fill="#ffffff"
                  fontSize="8"
                  fontWeight="900"
                  textAnchor="middle"
                  dominantBaseline="central"
                >
                  SPIN
                </text>
              </svg>
            </div>
          </div>

          {/* 命中所选结果 */}
          <div className="sandbox-wheel-result-banner">
            {prop.lastResult ? (
              <div className="sandbox-wheel-result-active">
                <span className="sandbox-wheel-result-tag">🎯 指针停在：</span>
                <strong className="sandbox-wheel-result-text">
                  {prop.lastResult}
                </strong>
              </div>
            ) : (
              <span className="sandbox-wheel-result-placeholder">
                点击下方按钮旋转指名大转盘！
              </span>
            )}
          </div>

          {/* 操作按钮 */}
          <button
            type="button"
            className="sandbox-btn sandbox-btn--primary sandbox-wheel-spin-btn"
            onClick={onSpin}
            disabled={disabled}
          >
            <GameIcon name="rocket" size={16} />
            <span>开始旋转大转盘！</span>
          </button>
        </div>
      )}
    </div>
  );
}
