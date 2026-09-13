/**
 * 桌面快捷菜单与房间管理动作（共享）。
 *
 * 牌桌外壳（TabletopOvalShell）与法官控制台等独立工作台页面都需要同一套
 * 「菜单开关 / 音效开关 / 暂离 / 退出房间 / 解散房间 + 确认弹窗」，
 * 逻辑集中在这里，避免两处各自复制并逐渐不一致。
 */
import { useCallback, useState } from 'react';
import { useConnection } from '../connection/useConnection.ts';
import { webAudio } from './WebAudioManager.ts';

export type TabletopConfirmKind = 'leave' | 'dissolve';

export interface TabletopMenuApi {
  /** 快捷菜单抽屉开关 */
  readonly isOpen: boolean;
  readonly openMenu: () => void;
  readonly closeMenu: () => void;
  /** 音效静音状态与切换 */
  readonly muted: boolean;
  readonly toggleSound: () => void;
  /** 待确认的房间管理动作 */
  readonly confirmKind: TabletopConfirmKind | null;
  /** 当前用户是否房主（决定是否显示「解散房间」） */
  readonly isHost: boolean;
  /** 房间管理请求进行中 */
  readonly busy: boolean;
  readonly requestLeave: () => void;
  readonly requestDissolve: () => void;
  readonly cancelConfirm: () => void;
  /** 暂离返回主页：房间保持后台运行 */
  readonly stepOut: () => void;
  /** 确认彻底退出房间 */
  readonly confirmLeaveRoom: () => void;
  /** 确认解散房间 */
  readonly confirmDissolveRoom: () => void;
}

export interface TabletopMenuOptions {
  /** 自定义退出行为（默认发送 leave_room） */
  readonly onLeaveRoom?: () => void;
}

export function useTabletopMenu(options: TabletopMenuOptions = {}): TabletopMenuApi {
  const { onLeaveRoom } = options;
  const { state, me, send, clearMe, setViewingHome } = useConnection();
  const [isOpen, setIsOpen] = useState(false);
  const [confirmKind, setConfirmKind] = useState<TabletopConfirmKind | null>(null);
  const [busy, setBusy] = useState(false);
  const [muted, setMuted] = useState(() => webAudio.isMuted());

  const isHost = me !== null && state.room !== null && state.room.members.some(
    (member) => member.playerId === me.playerId && member.isHost,
  );

  const openMenu = useCallback(() => setIsOpen(true), []);
  const closeMenu = useCallback(() => setIsOpen(false), []);
  const requestLeave = useCallback(() => setConfirmKind('leave'), []);
  const requestDissolve = useCallback(() => setConfirmKind('dissolve'), []);
  const cancelConfirm = useCallback(() => setConfirmKind(null), []);

  const toggleSound = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      webAudio.setMuted(next);
      return next;
    });
  }, []);

  /** 暂离返回主页（保持后台运行） */
  const stepOut = useCallback(() => {
    setConfirmKind(null);
    setViewingHome(true);
  }, [setViewingHome]);

  const confirmLeaveRoom = useCallback(() => {
    if (busy) return;
    setBusy(true);
    void (async () => {
      try {
        if (onLeaveRoom) {
          onLeaveRoom();
        } else {
          await send('leave_room', {});
        }
      } catch {
        // 忽略离开房间的网络异常：本地会话无论如何都要清理
      } finally {
        clearMe();
        setBusy(false);
        setConfirmKind(null);
      }
    })();
  }, [busy, clearMe, onLeaveRoom, send]);

  const confirmDissolveRoom = useCallback(() => {
    if (busy) return;
    setBusy(true);
    void (async () => {
      try {
        await send('room_command', { command: 'close_room' });
      } catch {
        // 忽略解散失败的网络异常：本地会话无论如何都要清理
      } finally {
        clearMe();
        setBusy(false);
        setConfirmKind(null);
      }
    })();
  }, [busy, clearMe, send]);

  return {
    isOpen,
    openMenu,
    closeMenu,
    muted,
    toggleSound,
    confirmKind,
    isHost,
    busy,
    requestLeave,
    requestDissolve,
    cancelConfirm,
    stepOut,
    confirmLeaveRoom,
    confirmDissolveRoom,
  };
}
