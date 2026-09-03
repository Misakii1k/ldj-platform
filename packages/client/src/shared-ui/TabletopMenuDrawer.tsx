import React, { useEffect } from 'react';
import { GameIcon } from './GameIcon.tsx';

export interface TabletopMenuDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  gameTitle?: string;
  orientation: 'portrait' | 'landscape';
  onToggleOrientation: () => void;
  viewMode: 'player' | 'table';
  onToggleViewMode: () => void;
  muted: boolean;
  onToggleSound: () => void;
  onShowRules?: () => void;
  onStepOut?: () => void;
  onLeaveRoom?: () => void;
  onDissolveRoom?: () => void;
  isHost?: boolean;
  customActions?: React.ReactNode;
}

export function TabletopMenuDrawer({
  isOpen,
  onClose,
  gameTitle,
  orientation,
  onToggleOrientation,
  viewMode,
  onToggleViewMode,
  muted,
  onToggleSound,
  onShowRules,
  onStepOut,
  onLeaveRoom,
  onDissolveRoom,
  isHost = false,
  customActions,
}: TabletopMenuDrawerProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isOpen && e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="tabletop-drawer-backdrop" onClick={onClose} role="presentation">
      <div
        className="tabletop-drawer-panel"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="游戏快捷菜单"
      >
        <div className="tabletop-drawer-header">
          <div className="tabletop-drawer-title-group">
            <span className="tabletop-drawer-kicker">
              <span className="home-brand__tile" style={{ width: '18px', height: '18px', fontSize: '0.62rem', borderRadius: '4px', display: 'inline-grid', verticalAlign: '-0.15em', marginRight: '5px' }} aria-hidden="true">聚</span>
              聚乐桌 · 快捷设置
            </span>
            <h3 className="tabletop-drawer-title">{gameTitle || '对局菜单'}</h3>
          </div>
          <button
            type="button"
            className="tabletop-drawer-close-btn"
            onClick={onClose}
            aria-label="关闭菜单"
          >
            ✕
          </button>
        </div>

        <div className="tabletop-drawer-content">
          {/* 游戏专属扩展动作（如记牌器等） */}
          {customActions && (
            <div className="tabletop-drawer-section">
              <div className="tabletop-drawer-section-title">专属工具</div>
              <div className="tabletop-drawer-grid tabletop-drawer-custom-grid">
                {customActions}
              </div>
            </div>
          )}

          {/* 常用对局设置 */}
          <div className="tabletop-drawer-section">
            <div className="tabletop-drawer-section-title">对局与视口</div>
            <div className="tabletop-drawer-grid">
              {onShowRules && (
                <button
                  type="button"
                  className="tabletop-drawer-item"
                  onClick={() => {
                    onClose();
                    onShowRules();
                  }}
                >
                  <span className="tabletop-drawer-item__tag">规则</span>
                  <div className="tabletop-drawer-item__text">
                    <strong>本局规则</strong>
                    <span>查看完整卡牌与规则说明</span>
                  </div>
                </button>
              )}

              <button
                type="button"
                className="tabletop-drawer-item"
                onClick={onToggleOrientation}
              >
                <span className="tabletop-drawer-item__tag">旋转</span>
                <div className="tabletop-drawer-item__text">
                  <strong>{orientation === 'landscape' ? '切换为竖屏' : '切换为横屏'}</strong>
                  <span>{orientation === 'landscape' ? '适合单手竖持模式' : '适合平放桌面全景宽幅'}</span>
                </div>
              </button>

              <button
                type="button"
                className="tabletop-drawer-item"
                onClick={onToggleViewMode}
              >
                <span className="tabletop-drawer-item__tag">视角</span>
                <div className="tabletop-drawer-item__text">
                  <strong>{viewMode === 'table' ? '切为手牌模式' : '切为大屏模式'}</strong>
                  <span>{viewMode === 'table' ? '当前：公共大屏视角' : '当前：个人手牌视角'}</span>
                </div>
              </button>

              <button
                type="button"
                className="tabletop-drawer-item"
                onClick={onToggleSound}
              >
                <span className="tabletop-drawer-item__icon">
                  <GameIcon name={muted ? 'sound_off' : 'sound_on'} size={20} />
                </span>
                <div className="tabletop-drawer-item__text">
                  <strong>{muted ? '开启游戏音效' : '游戏音效静音'}</strong>
                  <span>{muted ? '当前为静音状态' : '已开启出牌与倒计时音效'}</span>
                </div>
              </button>
            </div>
          </div>

          {/* 对局与房间管理（暂离、退出、解散） */}
          <div className="tabletop-drawer-section tabletop-drawer-section--danger">
            <div className="tabletop-drawer-section-title">对局与房间管理</div>
            <div className="tabletop-drawer-grid">
              {onStepOut && (
                <button
                  type="button"
                  className="tabletop-drawer-item tabletop-drawer-item--stepout"
                  onClick={() => {
                    onClose();
                    onStepOut();
                  }}
                >
                  <span className="tabletop-drawer-item__tag">首页</span>
                  <div className="tabletop-drawer-item__text">
                    <strong>暂离返回首页</strong>
                    <span>房间在后台保持运行，随时可一键返回</span>
                  </div>
                </button>
              )}

              {onLeaveRoom && (
                <button
                  type="button"
                  className="tabletop-drawer-item tabletop-drawer-item--leave"
                  onClick={() => {
                    onClose();
                    onLeaveRoom();
                  }}
                >
                  <span className="tabletop-drawer-item__icon">
                    <GameIcon name="door_exit" size={20} />
                  </span>
                  <div className="tabletop-drawer-item__text">
                    <strong>退出当前房间</strong>
                    <span>离开对局并释放席位返回大厅</span>
                  </div>
                </button>
              )}

              {isHost && onDissolveRoom && (
                <button
                  type="button"
                  className="tabletop-drawer-item tabletop-drawer-item--danger"
                  onClick={() => {
                    onClose();
                    onDissolveRoom();
                  }}
                >
                  <span className="tabletop-drawer-item__icon">
                    <GameIcon name="bomb" size={20} />
                  </span>
                  <div className="tabletop-drawer-item__text">
                    <strong style={{ color: '#dc2626' }}>解散房间 / 终止对局</strong>
                    <span>彻底关闭房间并移出所有玩家</span>
                  </div>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
