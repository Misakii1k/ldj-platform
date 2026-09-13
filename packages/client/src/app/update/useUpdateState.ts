import { useCallback, useEffect, useState } from 'react';
import { isNativeApp } from '../nativePlatform.ts';
import {
  checkForAppUpdates,
  clearCachedUpdate,
  downloadNativeUpdate,
  downloadWebUpdate,
  getCachedUpdate,
  installNativeUpdate,
} from './updateService.ts';
import type { AvailableUpdate, DownloadProgress, UpdateCheckStatus } from './updateTypes.ts';

type UpdateListener = (update: AvailableUpdate | null) => void;
const listeners = new Set<UpdateListener>();

let globalUpdate: AvailableUpdate | null = getCachedUpdate();

function notifyListeners(update: AvailableUpdate | null) {
  globalUpdate = update;
  listeners.forEach((l) => l(update));
}

/** 触发一次全局后台静默检查（冷启动调用） */
export async function triggerSilentStartupCheck(): Promise<AvailableUpdate | null> {
  try {
    const update = await checkForAppUpdates();
    notifyListeners(update);
    return update;
  } catch {
    return null;
  }
}

export function useUpdateState() {
  const [availableUpdate, setAvailableUpdate] = useState<AvailableUpdate | null>(globalUpdate);
  const [status, setStatus] = useState<UpdateCheckStatus>(globalUpdate ? 'has_update' : 'idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null);
  const [downloadedApkPath, setDownloadedApkPath] = useState<string | null>(null);

  useEffect(() => {
    const listener: UpdateListener = (update) => {
      setAvailableUpdate(update);
      if (update) {
        setStatus('has_update');
      }
    };
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  const check = useCallback(async () => {
    setStatus('checking');
    setErrorMessage(null);
    try {
      const update = await checkForAppUpdates();
      notifyListeners(update);
      if (update) {
        setStatus('has_update');
      } else {
        setStatus('up_to_date');
      }
      return update;
    } catch (err) {
      const msg = err instanceof Error ? err.message : '检查更新失败，请稍后重试';
      setErrorMessage(msg);
      setStatus('error');
      return null;
    }
  }, []);

  const download = useCallback(async () => {
    if (!availableUpdate) return;

    if (!isNativeApp()) {
      // 网页端直接唤起浏览器下载
      downloadWebUpdate(availableUpdate);
      return;
    }

    // Android 原生环境：执行流式下载与验签
    setStatus('downloading');
    setErrorMessage(null);
    setDownloadProgress({ percent: 0, received: 0, total: availableUpdate.fileSize || 0 });

    try {
      const apkPath = await downloadNativeUpdate(availableUpdate, (prog) => {
        setDownloadProgress(prog);
      });
      setDownloadedApkPath(apkPath);
      setStatus('downloaded');

      // 下载并验签通过后，直接调起安装器
      await installNativeUpdate(apkPath, availableUpdate.versionCode);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '下载安装包失败';
      setErrorMessage(msg);
      setStatus('error');
    }
  }, [availableUpdate]);

  const install = useCallback(async () => {
    if (!downloadedApkPath || !availableUpdate) return;
    try {
      await installNativeUpdate(downloadedApkPath, availableUpdate.versionCode);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '调起安装器失败';
      setErrorMessage(msg);
      setStatus('error');
    }
  }, [downloadedApkPath, availableUpdate]);

  const dismiss = useCallback(() => {
    clearCachedUpdate();
    notifyListeners(null);
    setStatus('idle');
    setErrorMessage(null);
  }, []);

  return {
    availableUpdate,
    status,
    errorMessage,
    downloadProgress,
    hasNewUpdate: Boolean(availableUpdate),
    check,
    download,
    install,
    dismiss,
  };
}
