import { useMemo, useState } from 'react';

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
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return normalized === '' ? models : models.filter((item) => item.toLocaleLowerCase().includes(normalized));
  }, [models, query]);

  return (
    <div className="ai-model-picker">
      <div className="settings-field-header">
        <label htmlFor={manual ? 'settings-model-manual' : 'settings-model-search'}>模型名称</label>
        <div className="ai-inline-actions">
          <button type="button" className="ai-text-action" onClick={() => setManual(!manual)} disabled={disabled || (manual && models.length === 0)}>{manual ? '从目录选择' : '手动输入'}</button>
          <button type="button" className="settings-fetch-btn" onClick={onRefresh} disabled={disabled || fetching}>{fetching ? '刷新中…' : '刷新目录'}</button>
        </div>
      </div>
      {manual ? (
        <input id="settings-model-manual" value={model} onChange={(event) => onModelChange(event.target.value)} maxLength={128} required disabled={disabled} placeholder="输入模型 ID" />
      ) : (
        <>
          <input id="settings-model-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} disabled={disabled} placeholder="搜索模型目录" />
          <ul className="ai-model-results" aria-label="可用模型">
            {filtered.map((item) => (
              <li key={item}><button type="button" aria-pressed={model === item} className={model === item ? 'is-selected' : ''} onClick={() => onModelChange(item)}>{item}</button></li>
            ))}
            {filtered.length === 0 && <li><p>没有匹配模型，可切换为手动输入。</p></li>}
          </ul>
        </>
      )}
    </div>
  );
}
