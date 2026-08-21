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
import { AppModeGate } from './AppModeGate.tsx';
import { HostConsole } from './HostConsole.tsx';

interface AppModeApi {
  /** 是否显示身份门控 */
  gating: boolean;
  /** 当前生效身份；浏览器环境为 null */
  activeMode: AppMode | null;
  /** 确认身份（玩家/桌面需先完成主机配置） */
  confirmMode(mode: AppMode): void;
  /** 返回身份选择（保留已保存配置） */
  backToModeSelection(): void;
}

const AppModeContext = createContext<AppModeApi | null>(null);

/** 首次进入时是否可直接使用已保存的身份与主机 */
function resolveInitialMode(): { gating: boolean; mode: AppMode | null } {
  if (!isNativeApp()) return { gating: false, mode: null };
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

  const api = useMemo<AppModeApi>(() => ({
    gating: isNativeApp() && activeMode === null,
    activeMode,
    confirmMode,
    backToModeSelection,
  }), [activeMode, confirmMode, backToModeSelection]);

  let content: ReactNode = children;
  if (api.gating) {
    content = <AppModeGate />;
  } else if (isNativeApp() && activeMode === 'host' && !runtimeActive) {
    content = <HostConsole />;
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
