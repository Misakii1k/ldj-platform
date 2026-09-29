import type { RefObject } from 'react';
import { GameDrawer } from '../../tabletop/GameDrawer.tsx';
import { useMotion } from '../../../motion/MotionContext.tsx';
import type { MotionPreference } from '../../../motion/motionPolicy.ts';
import {
  MAX_FONT_SCALE,
  MIN_FONT_SCALE,
  type WitsTheme,
  type WitsWagersSettings,
} from '../settings/witsSettings.ts';

export interface WitsSettingsDrawerProps {
  readonly settings: WitsWagersSettings;
  readonly onChange: (patch: Partial<WitsWagersSettings>) => void;
  readonly triggerRef: RefObject<HTMLElement | null>;
  readonly onClose: () => void;
}

const THEME_OPTIONS: ReadonlyArray<{ id: WitsTheme; name: string; desc: string }> = [
  { id: 'felt-green', name: '经典绿毡', desc: '标准赌桌绿，数字对比最清晰' },
  { id: 'walnut', name: '胡桃木桌', desc: '暖棕木纹，柔和护眼' },
  { id: 'midnight', name: '午夜蓝', desc: '深色低亮，夜间与投屏友好' },
];

const MOTION_OPTIONS: ReadonlyArray<{ id: MotionPreference; name: string; desc: string }> = [
  { id: 'auto', name: '自动', desc: '按设备性能与系统偏好自动调节' },
  { id: 'full', name: '完整演出', desc: '筹码飞行、翻牌、收付全部播放' },
  { id: 'reduced', name: '精简', desc: '保留淡入淡出与翻牌，去掉筹码飞行' },
  { id: 'off', name: '关闭', desc: '直接显示结果，无任何过渡' },
];

export function WitsSettingsDrawer({
  settings,
  onChange,
  triggerRef,
  onClose,
}: WitsSettingsDrawerProps) {
  const motion = useMotion();

  return (
    <GameDrawer
      kind="private"
      title="一智千金 · 设置"
      triggerRef={triggerRef}
      onClose={onClose}
      className="wits-settings-drawer"
    >
      <section className="wits-settings__section">
        <h3 className="wits-settings__section-title">音量</h3>
        <p className="wits-settings__hint">
          静音开关在牌桌菜单里（右上角「菜单」→ 游戏音效），这里只调音量大小。
        </p>

        <div className="wits-settings__row wits-settings__row--stack">
          <label className="wits-settings__label" htmlFor="wits-volume">
            <strong>音效音量</strong>
            <span>{Math.round(settings.soundVolume * 100)}%</span>
          </label>
          <input
            id="wits-volume"
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={settings.soundVolume}
            onChange={(e) => onChange({ soundVolume: Number(e.target.value) })}
          />
        </div>
      </section>

      <section className="wits-settings__section">
        <h3 className="wits-settings__section-title">动效强度</h3>
        <p className="wits-settings__hint">
          这里改的是全局动效档位，对所有游戏生效。当前实际档位：
          <strong>{motion.level}</strong>
          {motion.isAuto ? `（自动判定依据：${motion.reason}）` : ''}
        </p>
        <div className="wits-settings__options">
          {MOTION_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              className="wits-settings__option"
              aria-pressed={motion.preference === option.id}
              onClick={() => motion.setPreference(option.id)}
            >
              <strong>{option.name}</strong>
              <small>{option.desc}</small>
            </button>
          ))}
        </div>
      </section>

      <section className="wits-settings__section">
        <h3 className="wits-settings__section-title">桌面主题</h3>
        <div className="wits-settings__options">
          {THEME_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              className="wits-settings__option"
              aria-pressed={settings.theme === option.id}
              onClick={() => onChange({ theme: option.id })}
            >
              <strong>{option.name}</strong>
              <small>{option.desc}</small>
            </button>
          ))}
        </div>
      </section>

      <section className="wits-settings__section">
        <h3 className="wits-settings__section-title">操作与可读性</h3>

        <div className="wits-settings__row">
          <div className="wits-settings__label">
            <strong>下注确认提示</strong>
            <span>保存投注前再确认一次，避免误触</span>
          </div>
          <button
            type="button"
            className="wits-settings__toggle"
            onClick={() => onChange({ confirmBets: !settings.confirmBets })}
            aria-pressed={settings.confirmBets}
          >
            {settings.confirmBets ? '已开启' : '已关闭'}
          </button>
        </div>

        <div className="wits-settings__row wits-settings__row--stack">
          <label className="wits-settings__label" htmlFor="wits-font-scale">
            <strong>字号</strong>
            <span>{Math.round(settings.fontScale * 100)}%</span>
          </label>
          <input
            id="wits-font-scale"
            type="range"
            min={MIN_FONT_SCALE}
            max={MAX_FONT_SCALE}
            step={0.05}
            value={settings.fontScale}
            onChange={(e) => onChange({ fontScale: Number(e.target.value) })}
          />
        </div>

        <div className="wits-settings__row">
          <div className="wits-settings__label">
            <strong>紧凑模式</strong>
            <span>压缩留白，小屏一屏放下更多槽位</span>
          </div>
          <button
            type="button"
            className="wits-settings__toggle"
            onClick={() => onChange({ compact: !settings.compact })}
            aria-pressed={settings.compact}
          >
            {settings.compact ? '已开启' : '已关闭'}
          </button>
        </div>
      </section>
    </GameDrawer>
  );
}
