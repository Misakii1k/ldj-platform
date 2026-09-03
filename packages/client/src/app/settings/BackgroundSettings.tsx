import { useBackground, type BgMode } from '../../shared-ui/BackgroundContext.tsx';

const BACKGROUND_OPTIONS: readonly { id: BgMode; label: string; desc: string; performance: string }[] = [
  { id: 'party', label: '温馨派对插画', desc: '默认经典桌面桌游气氛手绘场景', performance: '平衡画质与性能' },
  { id: 'particles', label: '霓虹流光与粒子', desc: '扑克微粒浮动与夜幕霓虹光晕', performance: '适合性能较好的设备' },
  { id: 'video', label: '深邃极光/视频', desc: '沉浸式流光烟雾与动态视觉氛围', performance: '效果丰富，耗电较高' },
  { id: 'minimal', label: '极简纯色', desc: '清爽纯色背景，适应各类旧设备', performance: '低耗省电' },
];

export function BackgroundSettings() {
  const { bgMode, setBgMode } = useBackground();

  return (
    <div className="settings-category">
      <header className="settings-category__header">
        <span className="settings-category__eyebrow">背景主题</span>
        <h2>改变桌面的视觉氛围</h2>
        <p>选择后立即生效并保存在当前浏览器中。</p>
      </header>
      <div className="bg-mode-selector">
        {BACKGROUND_OPTIONS.map((item) => (
          <label key={item.id} className={`bg-mode-card ${bgMode === item.id ? 'is-selected' : ''}`}>
            <input type="radio" name="bgMode" value={item.id} checked={bgMode === item.id} onChange={() => setBgMode(item.id)} />
            <span className="bg-mode-card__info"><strong>{item.label}</strong><small>{item.desc}</small><em>{item.performance}</em></span>
            {bgMode === item.id && <b className="settings-choice-mark" aria-hidden="true">✓</b>}
          </label>
        ))}
      </div>
    </div>
  );
}
