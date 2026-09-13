/**
 * APP 身份模式上下文：
 * 原生 APP 首启（或主动切换）时门控选择身份；浏览器环境永不门控。
 * 门控期间不渲染应用内容，确认身份后才进入正常连接流程。
 * 主机模式在未切入本机服务器前渲染 HostConsole（一键开房控制台）。
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { AppMode } from './appMode.ts';
import { getSavedAppMode, saveAppMode } from './appMode.ts';
import { getManualServerBase, getRuntimeServerBase, setRuntimeServerBase, subscribeServerBaseChange } from '../connection/serverAddress.ts';
import { isNativeApp } from './nativePlatform.ts';
import { isLocalhostOrigin } from './hostServer.ts';
import { AppModeGate } from './AppModeGate.tsx';
import { HostConsole } from './HostConsole.tsx';

interface AppModeApi {
  /** 是否显示身份门控 */
  gating: boolean;
  /** 当前生效身份；浏览器环境为 null 或当前设定的模式 */
  activeMode: AppMode | null;
  /** 是否为电脑端本地主机 */
  isPcHost: boolean;
  /** 当前是否显示主机控制台 */
  showHostConsole: boolean;
  /** 打开主机控制台 */
  openHostConsole(): void;
  /** 关闭主机控制台并进入大厅 */
  closeHostConsole(mode?: 'table' | 'player'): void;
  /** 确认身份（玩家/桌面需先完成主机配置） */
  confirmMode(mode: AppMode): void;
  /** 返回身份选择（保留已保存配置） */
  backToModeSelection(): void;
}

const AppModeContext = createContext<AppModeApi | null>(null);

/** 首次进入时是否可直接使用已保存的身份与主机 */
function resolveInitialMode(): { gating: boolean; mode: AppMode | null } {
  if (!isNativeApp()) {
    return { gating: false, mode: getSavedAppMode() };
  }
  const saved = getSavedAppMode();
  if (saved === null) return { gating: true, mode: null };
  if (saved === 'host') return { gating: false, mode: saved };
  return getManualServerBase() !== null
    ? { gating: false, mode: saved }
    : { gating: true, mode: null };
}

export function AppModeProvider({ children }: { children: ReactNode }) {
  const [initial] = useState(resolveInitialMode);
  const [activeMode, setActiveMode] = useState<AppMode | null>(initial.mode);
  // 运行时覆盖是否已指向本机服务器（主机模式「进入大厅」后为 true）
  const [runtimeActive, setRuntimeActive] = useState(() => getRuntimeServerBase() !== null);
  const isPcHost = useMemo(() => !isNativeApp() && isLocalhostOrigin(), []);

  // 电脑端作为主机时：初次访问默认先展示主机控制台大屏；一旦进入过大厅则不重复打断
  const [showHostConsole, setShowHostConsole] = useState(() => {
    if (isNativeApp() || !isLocalhostOrigin()) return false;
    try {
      return sessionStorage.getItem('ldj_pc_host_entered') !== 'true';
    } catch {
      return true;
    }
  });

  useEffect(() => subscribeServerBaseChange(() => {
    setRuntimeActive(getRuntimeServerBase() !== null);
  }), []);

  const confirmMode = useCallback((mode: AppMode) => {
    saveAppMode(mode);
    setActiveMode(mode);
  }, []);

  const backToModeSelection = useCallback(() => {
    // 清除运行时覆盖：切回门控后不应再隐式连本机服务器
    setRuntimeServerBase(null);
    setActiveMode(null);
  }, []);

  const openHostConsole = useCallback(() => {
    setShowHostConsole(true);
  }, []);

  const closeHostConsole = useCallback((mode?: 'table' | 'player') => {
    try {
      sessionStorage.setItem('ldj_pc_host_entered', 'true');
    } catch {
      // ignore
    }
    if (mode) {
      saveAppMode(mode);
      setActiveMode(mode);
    }
    setShowHostConsole(false);
  }, []);

  const api = useMemo<AppModeApi>(() => ({
    gating: isNativeApp() && activeMode === null,
    activeMode,
    isPcHost,
    showHostConsole,
    openHostConsole,
    closeHostConsole,
    confirmMode,
    backToModeSelection,
  }), [activeMode, isPcHost, showHostConsole, openHostConsole, closeHostConsole, confirmMode, backToModeSelection]);

  let content: ReactNode = children;
  if (api.gating) {
    content = <AppModeGate />;
  } else if (isNativeApp() && activeMode === 'host' && !runtimeActive) {
    content = <HostConsole />;
  } else if (isPcHost && showHostConsole) {
    const hasEntered = (() => {
      try {
        return sessionStorage.getItem('ldj_pc_host_entered') === 'true';
      } catch {
        return false;
      }
    })();
    content = (
      <HostConsole
        canClose={hasEntered}
        onExit={(mode) => closeHostConsole(mode)}
      />
    );
  }

  return (
    <AppModeContext.Provider value={api}>
      {content}
    </AppModeContext.Provider>
  );
}

export function useAppMode(): AppModeApi {
  const ctx = useContext(AppModeContext);
  if (ctx === null) throw new Error('useAppMode 必须在 AppModeProvider 内使用');
  return ctx;
}
