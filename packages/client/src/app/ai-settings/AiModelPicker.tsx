import { useEffect, useMemo, useRef, useState } from 'react';

interface AiModelPickerProps {
  model: string;
  models: readonly string[];
  disabled: boolean;
  fetching: boolean;
  onModelChange: (model: string) => void;
  onRefresh: () => void;
}

export function AiModelPicker({ model, models, disabled, fetching, onModelChange, onRefresh }: AiModelPickerProps) {
  const [manual, setManual] = useState(models.length === 0);
  const [query, setQuery] = useState('');
  const [catalogOpen, setCatalogOpen] = useState(true);
  const rootRef = useRef<HTMLDivElement | null>(null);

  // 每次目录变动后回到目录选择模式并展开列表：
  // 拿到模型 → 直接可挑；目录被清空（切协议/Base URL）→ 回到手动输入
  useEffect(() => {
    if (fetching) return;
    const hasModels = models.length > 0;
    setManual(!hasModels);
    setCatalogOpen(hasModels);
  }, [models, fetching]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return normalized === '' ? models : models.filter((item) => item.toLocaleLowerCase().includes(normalized));
  }, [models, query]);

  return (
    <div className="ai-model-picker" ref={rootRef}>
      <div className="settings-field-header">
        <label htmlFor={manual ? 'settings-model-manual' : 'settings-model-search'}>模型名称</label>
        <div className="ai-inline-actions">
          <button type="button" className="ai-text-action" onClick={() => { const next = !manual; setManual(next); if (!next) setCatalogOpen(true); }} disabled={disabled || (manual && models.length === 0)}>{manual ? '从目录选择' : '手动输入'}</button>
          <button type="button" className="settings-fetch-btn" onClick={onRefresh} disabled={disabled || fetching}>{fetching ? '刷新中…' : '刷新目录'}</button>
        </div>
      </div>
      {manual ? (
        <input id="settings-model-manual" value={model} onChange={(event) => onModelChange(event.target.value)} maxLength={128} required disabled={disabled} placeholder="输入模型 ID" />
      ) : (
        <>
          <input
            id="settings-model-search"
            type="search"
            value={query}
            aria-expanded={catalogOpen}
            aria-controls="ai-model-results"
            onChange={(event) => { setQuery(event.target.value); setCatalogOpen(true); }}
            onFocus={() => setCatalogOpen(true)}
            onKeyDown={(event) => { if (event.key === 'Escape') setCatalogOpen(false); }}
            onBlur={(event) => {
              // 焦点移出选择器整体才收起；点选候选项不会触发（按钮在本容器内）
              if (!rootRef.current?.contains(event.relatedTarget as Node | null)) setCatalogOpen(false);
            }}
            disabled={disabled}
            placeholder="搜索模型目录"
          />
          {catalogOpen && (
            <ul id="ai-model-results" className="ai-model-results" aria-label="可用模型">
              {filtered.map((item) => (
                <li key={item}><button type="button" aria-pressed={model === item} className={model === item ? 'is-selected' : ''} onClick={() => { onModelChange(item); setQuery(item); setCatalogOpen(false); }}>{item}</button></li>
              ))}
              {filtered.length === 0 && <li><p>没有匹配模型，可切换为手动输入。</p></li>}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
