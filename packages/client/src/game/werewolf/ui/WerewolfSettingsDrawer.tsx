import React, { useEffect, useRef, useState } from 'react';
import { useWerewolfTheme } from '../WerewolfThemeProvider.tsx';
import { NARRATION_SETTINGS_EVENT, readNarrationSettings } from './narrationSettings.ts';
import './werewolf-settings.css';
import { webAudio } from '../../../shared-ui/WebAudioManager.ts';
import { useTabletopMenu } from '../../../shared-ui/useTabletopMenu.ts';
import { ConfirmDialog } from '../../../shared-ui/ConfirmDialog.tsx';
import { Volume2, VolumeX, BookOpen, Home, LogOut, Flame, Palette } from 'lucide-react';

interface WerewolfSettingsDrawerProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly onShowRules?: () => void;
  readonly isHost?: boolean;
}

export function WerewolfSettingsDrawer({
  isOpen,
  onClose,
  onShowRules,
  isHost = false,
}: WerewolfSettingsDrawerProps) {
  const { pair, setPair } = useWerewolfTheme();
  const menu = useTabletopMenu();

  // 音效与音量状态
  const [sfxMuted, setSfxMuted] = useState(() => webAudio.isMuted());
  const [sfxVolume, setSfxVolume] = useState(() => webAudio.getVolume());

  const [narrationEnabled, setNarrationEnabled] = useState(() => readNarrationSettings().enabled ?? isHost);
  const [narrationVolume, setNarrationVolume] = useState(() => readNarrationSettings().volume);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const settings = readNarrationSettings();
    setNarrationEnabled(settings.enabled ?? isHost);
    setNarrationVolume(settings.volume);
    const previousFocus = document.activeElement;
    const panel = panelRef.current;
    panel?.querySelector<HTMLButtonElement>('button')?.focus();
    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || !panel) return;
      const controls = Array.from(panel.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), [tabindex="0"]'));
      const first = controls[0];
      const last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    panel?.addEventListener('keydown', trapFocus);
    return () => {
      panel?.removeEventListener('keydown', trapFocus);
      if (previousFocus instanceof HTMLElement) previousFocus.focus();
    };
  }, [isOpen, isHost]);

  const handleToggleSfx = () => {
    const next = !sfxMuted;
    setSfxMuted(next);
    webAudio.setMuted(next);
  };

  const handleSfxVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = Number(e.target.value);
    setSfxVolume(v);
    webAudio.setVolume(v);
  };

  const handleToggleNarration = () => {
    const next = !narrationEnabled;
    setNarrationEnabled(next);
    try {
      localStorage.setItem('ldj_werewolf_narration_enabled', String(next));
    } catch { /* Storage may be unavailable in private browsing. */ }
    window.dispatchEvent(new Event(NARRATION_SETTINGS_EVENT));
  };

  const handleNarrationVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = Number(e.target.value);
    setNarrationVolume(v);
    try {
      localStorage.setItem('ldj_werewolf_narration_volume', String(v));
    } catch { /* Storage may be unavailable in private browsing. */ }
    window.dispatchEvent(new Event(NARRATION_SETTINGS_EVENT));
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isOpen && e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);



  return (
    <>
      {isOpen && <div className="ww-settings-backdrop" onClick={onClose} role="presentation">
        <div
          ref={panelRef}
          className="ww-settings-panel"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-label="狼人杀对局设置"
        >
          <div className="ww-settings-header">
            <div className="ww-settings-title-group">
              <span className="ww-settings-kicker">聚乐桌游 · 狼人杀</span>
              <h3 className="ww-settings-title">对局设置与控制</h3>
            </div>
            <button
              type="button"
              className="ww-settings-close-btn"
              onClick={onClose}
              aria-label="关闭设置"
            >
              ✕
            </button>
          </div>

          <div className="ww-settings-content">
            {/* 主题选择组（两组卡片而非散切皮肤） */}
            <div className="ww-settings-section">
              <span className="ww-settings-section-title">
                <Palette size={16} aria-hidden="true" style={{ display: 'inline', marginRight: 4, verticalAlign: '-2px' }} />
                视觉主题套装
              </span>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '6px' }}>
                <button
                  type="button"
                  aria-pressed={pair === 'forest'}
                  onClick={() => setPair('forest')}
                  style={{
                    padding: '10px',
                    borderRadius: '8px',
                    border: pair === 'forest' ? '2px solid var(--active, #245844)' : '1px solid var(--edge, #748575)',
                    background: pair === 'forest' ? 'var(--card, #fffdf7)' : 'var(--desk, #f4efe5)',
                    color: 'var(--text, #203c30)',
                    cursor: 'pointer',
                    textAlign: 'left',
                    boxShadow: pair === 'forest' ? '0 0 0 1px var(--active, #245844)' : 'none',
                  }}
                >
                  <strong style={{ display: 'block', fontSize: '13px' }}>林中星轨</strong>
                  <small style={{ display: 'block', color: 'var(--secondary, #465c4e)', marginTop: '2px', fontSize: '11px' }}>
                    日: 日光木刻 · 夜: 月蚀星轨
                  </small>
                </button>

                <button
                  type="button"
                  aria-pressed={pair === 'theatre'}
                  onClick={() => setPair('theatre')}
                  style={{
                    padding: '10px',
                    borderRadius: '8px',
                    border: pair === 'theatre' ? '2px solid var(--active, #753747)' : '1px solid var(--edge, #a57b87)',
                    background: pair === 'theatre' ? 'var(--card, #fffaf2)' : 'var(--desk, #f7efe5)',
                    color: 'var(--text, #4b2430)',
                    cursor: 'pointer',
                    textAlign: 'left',
                    boxShadow: pair === 'theatre' ? '0 0 0 1px var(--active, #753747)' : 'none',
                  }}
                >
                  <strong style={{ display: 'block', fontSize: '13px' }}>双面剧场</strong>
                  <small style={{ display: 'block', color: 'var(--secondary, #714654)', marginTop: '2px', fontSize: '11px' }}>
                    日: 白昼剧场 · 夜: 赤幕剧场
                  </small>
                </button>
              </div>
            </div>

            {/* 音量与播报设置 */}
            <div className="ww-settings-section">
              <span className="ww-settings-section-title">音频与播报</span>

              {/* 法官语音开关 */}
              <div className="ww-settings-item" style={{ cursor: 'default' }}>
                <span className="ww-settings-item__icon" aria-hidden="true">
                  {narrationEnabled ? <Volume2 size={20} /> : <VolumeX size={20} />}
                </span>
                <div className="ww-settings-item__text" style={{ flex: 1 }}>
                  <strong>法官原声旁白</strong>
                  <span>{narrationEnabled ? '已开启语音指引' : '已静音旁白（仅字幕）'}</span>
                </div>
                <button
                  type="button"
                  className="ww-settings-toggle"
                  onClick={handleToggleNarration}
                  aria-label="法官原声旁白"
                  aria-pressed={narrationEnabled}
                  
                >
                  {narrationEnabled ? '静音' : '开启'}
                </button>
              </div>

              {narrationEnabled && (
                <div style={{ padding: '0 12px 8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <small style={{ minWidth: '60px', color: 'var(--secondary)' }}>旁白音量</small>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={narrationVolume}
                    onChange={handleNarrationVolumeChange}
                    style={{ flex: 1, cursor: 'pointer' }}
                    aria-label="法官旁白音量"
                  />
                  <small style={{ minWidth: '35px', textAlign: 'right', color: 'var(--secondary)' }}>
                    {Math.round(narrationVolume * 100)}%
                  </small>
                </div>
              )}

              {/* 界面音效开关 */}
              <div className="ww-settings-item" style={{ cursor: 'default' }}>
                <span className="ww-settings-item__icon" aria-hidden="true">
                  {sfxMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
                </span>
                <div className="ww-settings-item__text" style={{ flex: 1 }}>
                  <strong>界面操作音效</strong>
                  <span>{sfxMuted ? '已静音' : '已开启'}</span>
                </div>
                <button
                  type="button"
                  className="ww-settings-toggle"
                  onClick={handleToggleSfx}
                  aria-label="界面操作音效"
                  aria-pressed={!sfxMuted}
                  
                >
                  {sfxMuted ? '开启' : '静音'}
                </button>
              </div>

              {!sfxMuted && (
                <div style={{ padding: '0 12px 8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <small style={{ minWidth: '60px', color: 'var(--secondary)' }}>音效音量</small>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={sfxVolume}
                    onChange={handleSfxVolumeChange}
                    style={{ flex: 1, cursor: 'pointer' }}
                    aria-label="界面操作音效音量"
                  />
                  <small style={{ minWidth: '35px', textAlign: 'right', color: 'var(--secondary)' }}>
                    {Math.round(sfxVolume * 100)}%
                  </small>
                </div>
              )}
            </div>

            {/* 规则 */}
            {onShowRules && (
              <div className="ww-settings-section">
                <button
                  type="button"
                  className="ww-settings-item"
                  onClick={() => {
                    onClose();
                    onShowRules();
                  }}
                >
                  <span className="ww-settings-item__icon" aria-hidden="true">
                    <BookOpen size={20} />
                  </span>
                  <div className="ww-settings-item__text">
                    <strong>查看本局规则与配置</strong>
                    <span>板子角色池、刀人/自救规则与获胜条件</span>
                  </div>
                </button>
              </div>
            )}

            {/* 房间操作 */}
            <div className="ww-settings-section">
              <span className="ww-settings-section-title">房间状态</span>

              <button
                type="button"
                className="ww-settings-item"
                onClick={() => {
                  onClose();
                  menu.stepOut();
                }}
              >
                <span className="ww-settings-item__icon" aria-hidden="true">
                  <Home size={20} />
                </span>
                <div className="ww-settings-item__text">
                  <strong>暂离对局</strong>
                  <span>返回主页，牌局在后台继续进行，可随时返回</span>
                </div>
              </button>

              <button
                type="button"
                className="ww-settings-item ww-settings-item--danger"
                onClick={() => {
                  onClose();
                  menu.requestLeave();
                }}
              >
                <span className="ww-settings-item__icon" aria-hidden="true">
                  <LogOut size={20} />
                </span>
                <div className="ww-settings-item__text">
                  <strong>退出房间</strong>
                  <span>离开牌桌并清空本地席位缓存</span>
                </div>
              </button>

              {isHost && (
                <button
                  type="button"
                  className="ww-settings-item ww-settings-item--danger"
                  onClick={() => {
                    onClose();
                    menu.requestDissolve();
                  }}
                >
                  <span className="ww-settings-item__icon" aria-hidden="true">
                    <Flame size={20} />
                  </span>
                  <div className="ww-settings-item__text">
                    <strong>解散房间（房主专享）</strong>
                    <span>结束当前房间与对局并解散全员</span>
                  </div>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>}

      {/* 确认退出弹窗 */}
      {menu.confirmKind === 'leave' && (
        <ConfirmDialog
          title="确认退出房间？"
          message="退出后将释放席位并断开连接。若在对局中，出局判定由房间规则处理。"
          confirmLabel="确认退出"
          destructive
          busy={menu.busy}
          onConfirm={menu.confirmLeaveRoom}
          onCancel={menu.cancelConfirm}
        />
      )}

      {/* 确认解散弹窗 */}
      {menu.confirmKind === 'dissolve' && (
        <ConfirmDialog
          title="确认解散房间？"
          message="此操作不可撤销，房间内所有玩家将被移出并回到大厅。"
          confirmLabel="确认解散"
          destructive
          busy={menu.busy}
          onConfirm={menu.confirmDissolveRoom}
          onCancel={menu.cancelConfirm}
        />
      )}
    </>
  );
}
