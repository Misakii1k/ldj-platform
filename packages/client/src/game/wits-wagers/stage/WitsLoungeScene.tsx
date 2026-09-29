/**
 * 深夜赌场贵宾厅场景层（01-CONTRACT.md §4 共同点）。
 *
 * 纯展示、无交互、无状态：房间暗墙 + 顶部居中吊灯 + 向下的暖色光锥 + 椭圆毡桌
 * （木沿 + 黄铜细圈）+ 桌面印字 + 烟雾，共五层，`pointer-events: none`。
 *
 * 尺寸与位置照像素参照 `docs/ui-preview/wits-wagers/directions/A2-casino-lounge.html`
 * 的 `.decor` 一段；正式代码把方向稿的 `data-size` 切换换成媒体查询（见 wits-lounge.css）。
 */
export interface WitsLoungeSceneProps {
  /**
   * 手机布局：桌面缩小、去掉桌面印字（照方向稿 `[data-size="mobile"]` 规则）。
   * 桌面 / 手机两套尺寸都在 CSS 媒体查询里，这个 prop 只负责印字这类结构差异。
   */
  readonly compact?: boolean;
}

export function WitsLoungeScene({ compact = false }: WitsLoungeSceneProps) {
  return (
    <div className="ww-lounge" aria-hidden="true" data-compact={compact ? 'true' : undefined}>
      <div className="ww-lounge__room" />
      <div className="ww-lounge__cone" />
      <div className="ww-lounge__smoke" />
      <div className="ww-lounge__table" />
      <div className="ww-lounge__lamp" />
    </div>
  );
}
