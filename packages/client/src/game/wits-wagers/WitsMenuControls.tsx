import type { RefObject } from 'react';
import { History, MessageSquare, Settings } from 'lucide-react';

export interface WitsMenuControlsProps {
  readonly settingsRef: RefObject<HTMLButtonElement | null>;
  readonly historyRef: RefObject<HTMLButtonElement | null>;
  readonly onOpenSettings: () => void;
  readonly onOpenHistory: () => void;
  readonly historyCount: number;
}

/**
 * 牌桌自定义工具入口。
 *
 * 两点约束：
 * 1. 必须无内部状态——TabletopOvalShell 会把同一批节点同时挂到顶栏和菜单抽屉的
 *    「专属工具」区，出现两份实例，开合状态一律由页面持有。
 * 2. 只放抽屉本身没有的项。规则用抽屉自带的「本局规则」（onShowRules），
 *    音效用它自带的开关，这里再放一份就是重复入口。
 */
export function WitsMenuControls({
  settingsRef,
  historyRef,
  onOpenSettings,
  onOpenHistory,
  historyCount,
}: WitsMenuControlsProps) {
  return (
    <>
      <button
        ref={settingsRef}
        type="button"
        className="tabletop-sound-btn"
        onClick={onOpenSettings}
        title="动效、主题与字号"
      >
        <Settings className="tabletop-sound-btn__icon" size={16} strokeWidth={2.6} aria-hidden="true" />
        <span className="tabletop-sound-btn__label">设置</span>
      </button>

      <button
        ref={historyRef}
        type="button"
        className="tabletop-sound-btn"
        onClick={onOpenHistory}
        disabled={historyCount === 0}
        title={historyCount === 0 ? '还没有已结算的轮次' : '回看往轮题目与收付'}
      >
        <History className="tabletop-sound-btn__icon" size={16} strokeWidth={2.6} aria-hidden="true" />
        <span className="tabletop-sound-btn__label">
          历史{historyCount > 0 ? ` ${historyCount}` : ''}
        </span>
      </button>

      <button
        type="button"
        className="tabletop-sound-btn"
        onClick={() => window.dispatchEvent(new Event('ldj:open-chat'))}
        title="打开对局聊天"
      >
        <MessageSquare className="tabletop-sound-btn__icon" size={16} strokeWidth={2.6} aria-hidden="true" />
        <span className="tabletop-sound-btn__label">聊天</span>
      </button>
    </>
  );
}
