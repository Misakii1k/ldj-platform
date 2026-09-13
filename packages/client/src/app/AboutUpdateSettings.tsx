import {
  AlertCircle,
  CheckCircle2,
  Download,
  PackageCheck,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { isNativeApp } from './nativePlatform.ts';
import { LOCAL_APP_VERSION } from './update/updateService.ts';
import { useUpdateState } from './update/useUpdateState.ts';
import './about-update.css';

export function AboutUpdateSettings() {
  const native = isNativeApp();
  const {
    availableUpdate,
    status,
    errorMessage,
    downloadProgress,
    check,
    download,
    install,
    dismiss,
  } = useUpdateState();

  const isChecking = status === 'checking';
  const isDownloading = status === 'downloading';
  const isDownloaded = status === 'downloaded';

  const formatBytes = (bytes?: number) => {
    if (!bytes || bytes <= 0) return null;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="about-update-panel" role="region" aria-label="关于与更新设置">
      {/* 品牌与当前版本展示 */}
      <div className="about-brand-card">
        <img
          src="/icon-192.png"
          alt="聚乐桌游"
          className="about-brand-icon"
          width={48}
          height={48}
        />
        <div className="about-brand-info">
          <div className="about-brand-name">聚乐桌游</div>
          <div className="about-version-badge-row">
            <span className="about-version-pill">v{LOCAL_APP_VERSION}</span>
            <span className="about-platform-pill">
              {native ? 'Android 客户端' : 'Web 网页端'}
            </span>
          </div>
        </div>
      </div>

      {/* 状态反馈：已是最新或检查失败 */}
      {status === 'up_to_date' && (
        <div className="about-status-banner is-ok">
          <CheckCircle2 size={18} strokeWidth={2.4} aria-hidden="true" />
          <span>当前已是最新版本 (v{LOCAL_APP_VERSION})</span>
        </div>
      )}

      {status === 'error' && errorMessage && (
        <div className="about-status-banner is-error">
          <AlertCircle size={18} strokeWidth={2.4} aria-hidden="true" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* 发现可用更新卡片 */}
      {availableUpdate && (
        <div className="about-update-card">
          <div className="about-update-header">
            <div className="about-update-title-wrap">
              <span className="about-update-badge">NEW</span>
              <span className="about-update-version">v{availableUpdate.version}</span>
            </div>
            <Sparkles size={18} className="text-amber-500" aria-hidden="true" />
          </div>

          <div className="about-update-meta-row">
            <span className="about-update-meta-tag">
              来源：{availableUpdate.source === 'cloud' ? '云端极速通道' : 'GitHub 官方发布'}
            </span>
            {formatBytes(availableUpdate.fileSize) && (
              <span className="about-update-meta-tag">
                体积：{formatBytes(availableUpdate.fileSize)}
              </span>
            )}
            {availableUpdate.releaseDate && (
              <span className="about-update-meta-tag">
                发布日期：{availableUpdate.releaseDate}
              </span>
            )}
          </div>

          {availableUpdate.releaseNotes && (
            <div className="about-release-notes-box">
              <div className="about-release-notes-title">更新说明</div>
              <div className="about-release-notes-content">
                {availableUpdate.releaseNotes}
              </div>
            </div>
          )}

          {/* Android 下载进度条 */}
          {native && isDownloading && downloadProgress && (
            <div className="about-progress-box">
              <div className="about-progress-labels">
                <span>正在安全下载更新包...</span>
                <span>{downloadProgress.percent}%</span>
              </div>
              <div className="about-progress-track">
                <div
                  className="about-progress-fill"
                  style={{ width: `${downloadProgress.percent}%` }}
                />
              </div>
              {downloadProgress.total > 0 && (
                <div className="text-xs text-stone-600">
                  {formatBytes(downloadProgress.received)} / {formatBytes(downloadProgress.total)}
                </div>
              )}
            </div>
          )}

          {/* 操作按钮组 */}
          <div className="about-btn-row">
            {native ? (
              isDownloaded ? (
                <button
                  type="button"
                  className="about-primary-action-btn"
                  onClick={install}
                >
                  <PackageCheck size={18} strokeWidth={2.4} aria-hidden="true" />
                  <span>立即调起安装</span>
                </button>
              ) : (
                <button
                  type="button"
                  className="about-primary-action-btn"
                  disabled={isDownloading}
                  onClick={download}
                >
                  <Download size={18} strokeWidth={2.4} aria-hidden="true" />
                  <span>{isDownloading ? '正在下载...' : '下载并升级'}</span>
                </button>
              )
            ) : (
              <button
                type="button"
                className="about-primary-action-btn"
                onClick={download}
              >
                <Download size={18} strokeWidth={2.4} aria-hidden="true" />
                <span>下载最新 Android 安装包 (APK)</span>
              </button>
            )}

            <button
              type="button"
              className="about-secondary-action-btn"
              disabled={isDownloading}
              onClick={dismiss}
            >
              <span>暂不更新</span>
            </button>
          </div>

          {!native && (
            <p className="about-web-hint">
              网页端打开即自动保持最新。如需在手机上运行独立主机服务器，可下载安装原生 Android APK。
            </p>
          )}
        </div>
      )}

      {/* 检查更新操作栏 */}
      <div className="about-check-action-box">
        <button
          type="button"
          className="about-check-btn"
          disabled={isChecking || isDownloading}
          onClick={() => void check()}
        >
          <RefreshCw
            size={18}
            strokeWidth={2.4}
            className={isChecking ? 'animate-spin' : ''}
            aria-hidden="true"
          />
          <span>{isChecking ? '正在检查云端最新版本...' : '检查更新'}</span>
        </button>
      </div>
    </div>
  );
}
