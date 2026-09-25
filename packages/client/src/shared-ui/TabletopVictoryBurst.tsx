import { useEffect, useRef, useState } from 'react';
import { ConfettiEffect } from './ConfettiEffect.tsx';
import { TabletopEventOverlay } from './TabletopEventOverlay.tsx';

export interface TabletopVictoryBurstProps {
  /** 是否已进入终局；从 false→true 的瞬间触发一次爆发。 */
  readonly gameOver: boolean;
  /** 当前用户是否获胜；为 null 表示平局 / 无胜者 / 观战。 */
  readonly isWinner: boolean | null;
  /** 浮层主文案，缺省按胜负给默认文案。 */
  readonly label?: string;
  readonly sublabel?: string;
}

/**
 * 终局反馈：彩带（仅胜者视角）+ 一次性的全屏盖印浮层。
 * 各桌面型对局在 game_over 分支渲染即可，不需要自己维护「刚进入终局」的状态。
 */
export function TabletopVictoryBurst({ gameOver, isWinner, label, sublabel }: TabletopVictoryBurstProps) {
  const [burst, setBurst] = useState(false);
  const prevRef = useRef(gameOver);

  useEffect(() => {
    if (!prevRef.current && gameOver) setBurst(true);
    if (!gameOver) setBurst(false);
    prevRef.current = gameOver;
  }, [gameOver]);

  if (!gameOver) return null;

  const resolvedLabel = label ?? (isWinner === null ? '本局结束' : isWinner ? '胜利！' : '本局结束');
  const resolvedSub = sublabel ?? (isWinner === null ? undefined : isWinner ? '你赢下了这一局' : '再接再厉');

  return (
    <>
      <ConfettiEffect active={burst && isWinner === true} />
      <TabletopEventOverlay
        open={burst}
        variant={isWinner ? 'burst' : 'stamp'}
        label={resolvedLabel}
        sublabel={resolvedSub}
        durationMs={1800}
        onComplete={() => setBurst(false)}
      />
    </>
  );
}
