import type { RefObject } from 'react';
import { BookOpen, History, MessageSquare, Settings } from 'lucide-react';

export interface WitsMenuControlsProps {
  readonly settingsRef: RefObject<HTMLButtonElement | null>;
  readonly rulesRef: RefObject<HTMLButtonElement | null>;
  readonly historyRef: RefObject<HTMLButtonElement | null>;
  readonly onOpenSettings: () => void;
  readonly onOpenRules: () => void;
  readonly onOpenHistory: () => void;
  readonly historyCount: number;
}

/**
 * 牌桌右上角固定工具入口。
 *
 * 必须保持无内部状态：TabletopOvalShell 会把同一批节点同时挂到顶栏和菜单抽屉的
 * 「专属工具」区，出现两份实例；抽屉开合状态一律由页面持有。
 */
export function WitsMenuControls({
  settingsRef,
  rulesRef,
  historyRef,
  onOpenSettings,
  onOpenRules,
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
        title="音效、动效、主题与字号"
      >
        <Settings className="tabletop-sound-btn__icon" size={16} strokeWidth={2.6} aria-hidden="true" />
        <span className="tabletop-sound-btn__label">设置</span>
      </button>

      <button
        ref={rulesRef}
        type="button"
        className="tabletop-sound-btn"
        onClick={onOpenRules}
        title="查看游戏规则"
      >
        <BookOpen className="tabletop-sound-btn__icon" size={16} strokeWidth={2.6} aria-hidden="true" />
        <span className="tabletop-sound-btn__label">规则</span>
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
