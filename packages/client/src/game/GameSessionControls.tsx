import { useCallback, useEffect, useRef, useState } from 'react';
import { Settings, Maximize, Minimize, ChevronsUp, ChevronsDown, X } from 'lucide-react';
import { useTabletopMenu } from '../shared-ui/useTabletopMenu.ts';
import { TabletopMenuDrawer } from '../shared-ui/TabletopMenuDrawer.tsx';
import { ConfirmDialog } from '../shared-ui/ConfirmDialog.tsx';
import { useFullscreen, isStandalonePWA } from '../native/fullscreen.ts';

/** 收起顶栏时挂在 body 上的类，供各游戏外壳 CSS 隐藏自身顶栏并让舞台自动扩展。 */
const COLLAPSE_CLASS = 'ldj-chrome-collapsed';

export interface GameSessionControlsProps {
  /** 游戏标题，透传给菜单抽屉。 */
  gameTitle?: string;
  /**
   * 该游戏外壳自身是否已有设置/菜单入口（如 TabletopOvalShell 的「菜单」按钮、狼人杀顶栏「设置」）。
   * - true：仅在顶栏被收起（入口被隐藏）时，才在悬浮坞补出「设置」；
   * - false：该游戏没有统一设置入口（缺口游戏），悬浮坞常驻「设置」。
   */
  hasOwnMenu?: boolean;
}

/**
 * 跨游戏通用的悬浮控制坞：全屏 / 沉浸收起顶栏 / 设置。
 *
 * 渲染在 GamePage 的 game-session-root 内，覆盖所有游戏（含无统一设置入口的自定义外壳），
 * 且在顶栏收起后依然常驻，满足「腾出画面空间、需要时再唤出」。
 */
export function GameSessionControls({ gameTitle, hasOwnMenu = true }: GameSessionControlsProps) {
  const menu = useTabletopMenu();
  const fullscreen = useFullscreen();
  const [collapsed, setCollapsed] = useState(false);
  const [iosHint, setIosHint] = useState(false);
  const hintShownRef = useRef(false);

  // 收起状态映射到 body 类：各外壳 CSS 据此隐藏顶栏、扩展舞台。
  useEffect(() => {
    const { body } = document;
    if (collapsed) body.classList.add(COLLAPSE_CLASS);
    else body.classList.remove(COLLAPSE_CLASS);
    return () => body.classList.remove(COLLAPSE_CLASS);
  }, [collapsed]);

  const toggleImmersive = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      // iOS 无法真正全屏：首次收起时给一次「添加到主屏幕」引导。
      if (next && !fullscreen.supported && !isStandalonePWA() && !hintShownRef.current) {
        hintShownRef.current = true;
        setIosHint(true);
      }
      return next;
    });
  }, [fullscreen.supported]);

  const handleFullscreen = useCallback(() => {
    void fullscreen.toggle();
  }, [fullscreen]);

  const showSettings = collapsed || !hasOwnMenu;

  return (
    <>
      <div className="ldj-session-dock" data-collapsed={collapsed ? 'true' : 'false'} aria-label="游戏画面控制">
        {showSettings && (
          <button
            type="button"
            className="ldj-session-dock__btn ldj-session-dock__btn--settings"
            onClick={menu.openMenu}
            title="设置与房间管理"
            aria-label="打开设置与房间菜单"
          >
            <Settings size={18} strokeWidth={2.4} aria-hidden="true" />
          </button>
        )}

        {fullscreen.supported && (
          <button
            type="button"
            className="ldj-session-dock__btn"
            onClick={handleFullscreen}
            title={fullscreen.isFullscreen ? '退出全屏' : '进入全屏'}
            aria-label={fullscreen.isFullscreen ? '退出全屏' : '进入全屏'}
          >
            {fullscreen.isFullscreen
              ? <Minimize size={18} strokeWidth={2.4} aria-hidden="true" />
              : <Maximize size={18} strokeWidth={2.4} aria-hidden="true" />}
          </button>
        )}

        <button
          type="button"
          className="ldj-session-dock__btn"
          onClick={toggleImmersive}
          title={collapsed ? '展开顶栏' : '收起顶栏、腾出画面'}
          aria-label={collapsed ? '展开顶栏' : '收起顶栏'}
          aria-pressed={collapsed}
        >
          {collapsed
            ? <ChevronsDown size={18} strokeWidth={2.4} aria-hidden="true" />
            : <ChevronsUp size={18} strokeWidth={2.4} aria-hidden="true" />}
        </button>
      </div>

      {iosHint && (
        <div className="ldj-ios-fullscreen-hint" role="status">
          <span>
            iOS 全屏提示：点浏览器「分享 → 添加到主屏幕」，从主屏图标启动即可获得接近全屏的沉浸体验。
          </span>
          <button
            type="button"
            className="ldj-ios-fullscreen-hint__close"
            onClick={() => setIosHint(false)}
            aria-label="关闭提示"
          >
            <X size={15} strokeWidth={2.6} aria-hidden="true" />
          </button>
        </div>
      )}

      <TabletopMenuDrawer
        isOpen={menu.isOpen}
        onClose={menu.closeMenu}
        gameTitle={gameTitle}
        muted={menu.muted}
        onToggleSound={menu.toggleSound}
        onStepOut={menu.stepOut}
        onLeaveRoom={menu.requestLeave}
        onDissolveRoom={menu.requestDissolve}
        isHost={menu.isHost}
      />

      {menu.confirmKind && (
        <ConfirmDialog
          title={
            menu.confirmKind === 'dissolve'
              ? '解散房间'
              : menu.isHost
              ? '房主退出 / 解散选项'
              : '暂离或退出房间'
          }
          message={
            menu.confirmKind === 'dissolve'
              ? '确定要解散当前房间吗？对局将立即终止，所有玩家将被移出。'
              : menu.isHost
              ? '您是房主。选择「暂离返回主页」可保持房间在后台运行；选择「彻底退出」将自动转让房主；选择「解散房间」将关闭房间。'
              : '选择「暂离返回主页」将保留席位，可在主页顶部随时一键返回；选择「彻底退出」将释放席位。'
          }
          confirmLabel="暂离返回主页"
          secondaryLabel={
            menu.confirmKind === 'dissolve' ? '确认解散' : menu.isHost ? '解散房间' : '彻底退出'
          }
          onSecondary={
            menu.confirmKind === 'dissolve'
              ? menu.confirmDissolveRoom
              : menu.isHost
              ? menu.confirmDissolveRoom
              : menu.confirmLeaveRoom
          }
          destructive={menu.confirmKind === 'dissolve' || menu.isHost}
          busy={menu.busy}
          onConfirm={menu.confirmKind === 'dissolve' ? menu.cancelConfirm : menu.stepOut}
          onCancel={menu.cancelConfirm}
        />
      )}
    </>
  );
}
