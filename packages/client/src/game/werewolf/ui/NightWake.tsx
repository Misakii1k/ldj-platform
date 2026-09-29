import React from 'react';
import './theatre-stage.css';

/**
 * 入夜 / 夜间行动中央场景（视觉契约 §4.4 / 剧场 W04）。像素参照
 * `docs/ui-preview/werewolf/directions/N-night.html` 五个视角：
 * 身份插画 + 冷月光晕 + kicker「第 N 夜 · 你被唤醒」+ 大字「X 请睁眼」+ 说明行 + 倒计时环；
 * 闭眼等待态整台插画压成黑剪影（亮度 8% + 冷光描边），票根全体压暗，底部无按钮。
 *
 * 隐私红线（契约 §2）：本组件只接收「当前行动身份名」与自己的行动说明，
 * 他人的身份文字绝不通过 props 进入 DOM。
 */

export interface NightWakeProps {
  /** 眉标：「第 N 夜 · 你被唤醒」「第 N 夜 · 请保持闭眼」 */
  readonly kicker: string;
  /** 大字：「狼人请睁眼」「女巫正在行动」 */
  readonly big: string;
  /** 说明行（选目标提示 / 已选反馈 / 「你是村民，今夜无需操作」） */
  readonly line?: React.ReactNode;
  /** 当前行动身份的插画（WEREWOLF_ROLE_ARTWORK）；非你回合也展示该身份剪影 */
  readonly artworkUrl: string | null;
  /** 闭眼等待态：插画压成黑剪影、冷色化 */
  readonly sleeping?: boolean;
  readonly timerSeconds?: number | null;
  readonly timerTotal?: number | null;
  readonly timerNote?: string | null;
  /** 女巫药瓶等附加控件插槽 */
  readonly children?: React.ReactNode;
  /** 入场动画 key（身份变化时重播 art-in） */
  readonly enterKey?: string | number | null;
  /** 当前行动身份 key（e2e 钩子，如 wolf/seer/witch/guard/hunter） */
  readonly roleKey?: string | null;
}

export function NightWake({
  kicker,
  big,
  line = null,
  artworkUrl,
  sleeping = false,
  timerSeconds = null,
  timerTotal = null,
  timerNote = null,
  children = null,
  enterKey = null,
  roleKey = null,
}: NightWakeProps) {
  const [artReady, setArtReady] = React.useState(false);
  const imgRef = React.useRef<HTMLImageElement>(null);
  React.useEffect(() => {
    setArtReady(false);
    // 缓存命中时 load 事件可能先于 effect 触发，用 complete 兜底
    const img = imgRef.current;
    if (img && img.complete && img.naturalWidth > 0) setArtReady(true);
  }, [artworkUrl]);
  const ringPct = timerSeconds !== null && timerTotal && timerTotal > 0
    ? Math.max(0, Math.min(1, timerSeconds / timerTotal))
    : 1;
  const ringLevel = timerSeconds !== null ? (timerSeconds <= 5 ? 'crit' : timerSeconds <= 10 ? 'warn' : '') : '';
  return (
    <div
      className={`ww-wake${sleeping ? ' sleeping' : ''}`}
      key={enterKey}
      data-role={roleKey ?? undefined}
      data-ready={artReady ? 'true' : 'false'}
    >
      <span className="ww-wake__art" aria-hidden={sleeping ? 'true' : undefined}>
        {artworkUrl ? (
          <img ref={imgRef} src={artworkUrl} alt={sleeping ? '' : big} draggable={false} onLoad={() => setArtReady(true)} />
        ) : null}
      </span>
      <span className="ww-wake__kicker">{kicker}</span>
      <strong className="ww-wake__big">{big}</strong>
      {line ? <span className="ww-wake__line">{line}</span> : null}
      {children}
      {timerNote ? (
        <span className="ww-wake__timer-note">{timerNote}</span>
      ) : timerSeconds !== null ? (
        <span className={`ww-timer ww-wake__timer ${ringLevel}`.trim()} role="timer" aria-label={`剩余 ${timerSeconds} 秒`}>
          <svg viewBox="0 0 100 100" aria-hidden="true">
            <circle className="track" cx="50" cy="50" r="42" pathLength={100} strokeWidth={7} strokeDasharray="100" strokeDashoffset={0} />
            <circle className="bar" cx="50" cy="50" r="42" pathLength={100} strokeWidth={7} strokeDasharray="100" strokeDashoffset={(100 - ringPct * 100).toFixed(1)} />
          </svg>
          <span className="num">{timerSeconds}</span>
        </span>
      ) : null}
    </div>
  );
}
