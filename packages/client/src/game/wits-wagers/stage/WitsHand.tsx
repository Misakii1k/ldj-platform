export type WitsHandPose = 'hidden' | 'idle' | 'write' | 'push' | 'place' | 'grab';

export interface WitsHandProps {
  readonly pose: WitsHandPose;
  /** 手部落点（屏幕坐标），由编排器按锚点实测后给出 */
  readonly x?: number;
  readonly y?: number;
}

/**
 * 风格化手。单色剪影、无肤色细节，跨设备观感一致。
 *
 * 必须渲染在毡面（preserve-3d）子树之外：position:fixed 一旦有 transform 祖先
 * 就会退化成相对定位，落点全错。
 */
export function WitsHand({ pose, x, y }: WitsHandProps) {
  if (pose === 'hidden') return null;

  const style: React.CSSProperties = {};
  if (x !== undefined && y !== undefined) {
    style.left = `${x}px`;
    style.top = `${y}px`;
    style.transform = 'translate(-50%, -12%)';
  }

  return (
    <div className="ww-hand" data-pose={pose} style={style} aria-hidden="true">
      <svg viewBox="0 0 120 150" width="120" height="150" focusable="false">
        <defs>
          <linearGradient id="ww-hand-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3c4c63" />
            <stop offset="100%" stopColor="#222c3c" />
          </linearGradient>
        </defs>

        {/* 握笔时手里多一支笔 */}
        {pose === 'write' && (
          <g className="ww-hand__pen">
            <rect x="60" y="2" width="7" height="52" rx="3" fill="#c9992a" transform="rotate(18 63 28)" />
            <path d="M72 56 L79 60 L74 66 Z" fill="#292722" />
          </g>
        )}

        {/* 手掌与手指：pose 差异只体现在指节的收拢程度 */}
        <g fill="url(#ww-hand-fill)">
          {/* 小臂 */}
          <path d="M30 150 L30 104 Q60 92 90 104 L90 150 Z" />
          {/* 手掌 */}
          <path d="M28 108 Q26 78 42 68 Q60 60 78 68 Q94 78 92 108 Q60 120 28 108 Z" />
          {/* 拇指 */}
          <path
            className="ww-hand__thumb"
            d={
              pose === 'grab' || pose === 'place'
                ? 'M30 96 Q14 88 16 74 Q20 64 30 70 Q38 76 38 92 Z'
                : 'M30 98 Q12 94 12 80 Q14 70 24 74 Q34 80 36 94 Z'
            }
          />
          {/* 食指到小指：write/place 时并拢前伸，grab 时收拢 */}
          {[
            { x: 40, h: pose === 'grab' ? 22 : 40 },
            { x: 53, h: pose === 'grab' ? 24 : 46 },
            { x: 66, h: pose === 'grab' ? 22 : 42 },
            { x: 79, h: pose === 'grab' ? 18 : 34 },
          ].map((finger) => (
            <rect
              key={finger.x}
              className="ww-hand__finger"
              x={finger.x}
              y={72 - finger.h}
              width="11"
              height={finger.h + 12}
              rx="5.5"
            />
          ))}
        </g>
      </svg>
    </div>
  );
}
