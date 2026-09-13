/**
 * 紧凑布局判定（窄屏手机 / 横屏矮视口）。
 *
 * 狼人杀 v2 与真人主持模式需要同一套断点来决定「马蹄席位环」还是「左右翼席位条」，
 * 因此断点集中在这里，避免各页面复制 matchMedia 逻辑后逐渐不一致。
 */
import { useEffect, useState } from 'react';

export const COMPACT_LAYOUT_QUERY = '(max-width: 767px), (orientation: landscape) and (max-height: 520px)';

export function useCompactLayout(): boolean {
  const [compact, setCompact] = useState(() => (
    typeof window === 'undefined' ? false : window.matchMedia(COMPACT_LAYOUT_QUERY).matches
  ));

  useEffect(() => {
    const mediaQuery = window.matchMedia(COMPACT_LAYOUT_QUERY);
    const update = () => setCompact(mediaQuery.matches);
    update();
    mediaQuery.addEventListener('change', update);
    return () => mediaQuery.removeEventListener('change', update);
  }, []);

  return compact;
}
