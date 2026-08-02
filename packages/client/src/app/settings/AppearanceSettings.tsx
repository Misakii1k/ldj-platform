import { useMotion } from '../../motion/MotionContext.tsx';
import type { MotionLevel, MotionPreference, MotionReason } from '../../motion/motionPolicy.ts';

const MOTION_OPTIONS: readonly { id: MotionPreference; label: string; desc: string }[] = [
  { id: 'auto', label: '自动调节', desc: '根据设备能力和实际流畅度自动降级' },
  { id: 'full', label: '完整动效', desc: '启用全部氛围、视差和交互反馈' },
  { id: 'reduced', label: '轻量动效', desc: '保留操作反馈，降低持续动画开销' },
  { id: 'off', label: '关闭动效', desc: '仅保留必要状态变化' },
];

const MOTION_LEVEL_LABELS: Record<MotionLevel, string> = {
  full: '完整动效',
  reduced: '轻量动效',
  minimal: '极简动效',
  off: '关闭动效',
};

const MOTION_REASON_LABELS: Partial<Record<MotionReason, string>> = {
  'reduced-motion': '系统已开启减少动态效果',
  'save-data': '浏览器已开启节省流量',
  device: '已根据设备能力降低效果',
  runtime: '检测到持续卡顿后自动降级',
};

export function AppearanceSettings() {
  const { preference, setPreference, level, reason } = useMotion();

  return (
    <div className="settings-category">
      <header className="settings-category__header">
        <span className="settings-category__eyebrow">界面效果</span>
        <h2>选择合适的动态体验</h2>
        <p>可交由平台自动平衡流畅度，也可固定使用偏好的动效等级。</p>
      </header>
      <div className="motion-mode-status" role="status">
        <strong>当前实际等级：{MOTION_LEVEL_LABELS[level]}</strong>
        <span>{MOTION_REASON_LABELS[reason] ?? '按当前选择运行'}</span>
      </div>
      <div className="motion-mode-selector">
        {MOTION_OPTIONS.map((item) => (
          <label key={item.id} className={`motion-mode-card ${preference === item.id ? 'is-selected' : ''}`}>
            <input type="radio" name="motionPreference" value={item.id} checked={preference === item.id} onChange={() => setPreference(item.id)} />
            <span><strong>{item.label}</strong><small>{item.desc}</small></span>
            {preference === item.id && <b className="settings-choice-mark" aria-hidden="true">✓</b>}
          </label>
        ))}
      </div>
      <p className="motion-mode-hint">系统“减少动态效果”设置始终优先于完整动效。</p>
    </div>
  );
}
