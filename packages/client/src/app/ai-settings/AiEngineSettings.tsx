import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { THINKING_DEPTH_OPTIONS, type LlmProfileSummary, type LlmProviderType, type LlmSettingsView, type ThinkingDepth } from '@ldj/shared';
import { useToast } from '../../shared-ui/ToastContext.tsx';
import { buildApiUrl } from '../../connection/serverAddress.ts';
import { buildModelRequestBody, createConfigFingerprint, diagnosticErrorMessage, markDiagnosticStale, modelCatalogErrorMessage, thinkingDepthDescription, type AiDiagnosticErrorCode, type AiDiagnosticState, type AiSettingsForm } from './aiSettingsState.ts';
import { AiEngineStatus } from './AiEngineStatus.tsx';
import { AiProfilePicker } from './AiProfilePicker.tsx';
import { AiQuickConnect } from './AiQuickConnect.tsx';
import { AiModelPicker } from './AiModelPicker.tsx';
import type { ApiProfile } from './types.ts';

const BUILT_IN_PROFILES: ApiProfile[] = [
  { id: 'deepseek-preset', name: 'DeepSeek 官方', provider: 'openai', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat', thinkingDepth: 'off', timeoutMs: 20000, builtIn: true },
  { id: 'anthropic-preset', name: 'Anthropic Claude', provider: 'anthropic', baseUrl: 'https://api.anthropic.com', model: 'claude-3-5-sonnet-20241022', thinkingDepth: 'off', timeoutMs: 30000, builtIn: true },
  { id: 'ollama-preset', name: 'Ollama 本地端点', provider: 'openai', baseUrl: 'http://127.0.0.1:11434/v1', model: 'qwen2.5', thinkingDepth: 'off', timeoutMs: 30000, builtIn: true },
];
const BUILT_IN_IDS = new Set(BUILT_IN_PROFILES.map((profile) => profile.id));

function profileFromServer(profile: LlmProfileSummary): ApiProfile {
  return { ...profile, builtIn: BUILT_IN_IDS.has(profile.id) };
}

function profilesForServer(profiles: readonly ApiProfile[]): LlmProfileSummary[] {
  return profiles.map(({ id, name, provider, baseUrl, model, thinkingDepth, timeoutMs, hasApiKey, apiKey }) => ({ id, name, provider, baseUrl, model, thinkingDepth, timeoutMs, hasApiKey: Boolean(hasApiKey || apiKey) }));
}

function isProfile(value: unknown): value is LlmProfileSummary {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return typeof item.id === 'string' && typeof item.name === 'string' && (item.provider === 'openai' || item.provider === 'anthropic') && typeof item.baseUrl === 'string' && typeof item.model === 'string' && THINKING_DEPTH_OPTIONS.some((option) => option.value === item.thinkingDepth) && Number.isInteger(item.timeoutMs) && typeof item.hasApiKey === 'boolean';
}

function isSettingsView(value: unknown): value is LlmSettingsView {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return (item.provider === 'openai' || item.provider === 'anthropic') && (typeof item.baseUrl === 'string' || item.baseUrl === null) && typeof item.model === 'string' && THINKING_DEPTH_OPTIONS.some((option) => option.value === item.thinkingDepth) && Number.isInteger(item.timeoutMs) && typeof item.hasApiKey === 'boolean' && typeof item.fromEnv === 'boolean' && Array.isArray(item.profiles) && item.profiles.every(isProfile) && (typeof item.activeProfileId === 'string' || item.activeProfileId === null);
}

async function responseMessage(response: Response, fallback: string): Promise<string> {
  try {
    const body: unknown = await response.json();
    if (typeof body === 'object' && body !== null && typeof (body as { message?: unknown }).message === 'string') return (body as { message: string }).message;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') return fallback;
  }
  return fallback;
}

export function AiEngineSettings() {
  const { showToast } = useToast();
  const keyRef = useRef<HTMLInputElement | null>(null);
  const modelsController = useRef<AbortController | null>(null);
  const diagnosticController = useRef<AbortController | null>(null);
  const [provider, setProvider] = useState<LlmProviderType>('openai');
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('');
  const [thinkingDepth, setThinkingDepth] = useState<ThinkingDepth>('off');
  const [timeoutMs, setTimeoutMs] = useState('20000');
  const [hasApiKey, setHasApiKey] = useState(false);
  const [clearApiKey, setClearApiKey] = useState(false);
  const [fromEnv, setFromEnv] = useState(false);
  const [profiles, setProfiles] = useState<ApiProfile[]>(BUILT_IN_PROFILES);
  const [selectedProfileId, setSelectedProfileId] = useState('');
  const [creatingProfile, setCreatingProfile] = useState(false);
  const [newProfileName, setNewProfileName] = useState('');
  const [models, setModels] = useState<string[]>([]);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [adminToken, setAdminToken] = useState('');
  const [needsAdminToken, setNeedsAdminToken] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [fetchingModels, setFetchingModels] = useState(false);
  const [diagnostic, setDiagnostic] = useState<AiDiagnosticState>({ status: 'idle' });
  const [error, setError] = useState<string | null>(null);

  const numericTimeout = Number(timeoutMs);
  const timeoutInvalid = !Number.isInteger(numericTimeout) || numericTimeout < 1000 || numericTimeout > 120000;
  const form = useMemo<AiSettingsForm>(() => ({ provider, baseUrl, apiKey, clearApiKey, model, thinkingDepth, timeoutMs: numericTimeout }), [provider, baseUrl, apiKey, clearApiKey, model, thinkingDepth, numericTimeout]);
  const fingerprint = useMemo(() => createConfigFingerprint(form), [form]);

  useEffect(() => {
    diagnosticController.current?.abort();
    setDiagnostic((current) => markDiagnosticStale(current, fingerprint));
  }, [fingerprint]);

  useEffect(() => {
    modelsController.current?.abort();
  }, [provider, baseUrl, apiKey, clearApiKey]);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch(buildApiUrl('/api/settings/llm'), { headers: { Accept: 'application/json' }, cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw new Error(await responseMessage(response, `HTTP ${response.status}`));
        const payload: unknown = await response.json();
        if (!isSettingsView(payload)) throw new Error('返回的设置数据格式不正确');
        setProvider(payload.provider);
        setBaseUrl(payload.baseUrl ?? '');
        setModel(payload.model);
        setThinkingDepth(payload.thinkingDepth);
        setTimeoutMs(String(payload.timeoutMs));
        setHasApiKey(payload.hasApiKey);
        setFromEnv(payload.fromEnv);
        setProfiles(payload.profiles.length ? payload.profiles.map(profileFromServer) : BUILT_IN_PROFILES);
        setSelectedProfileId(payload.activeProfileId ?? '');
      } catch (err) {
        if ((err as Error).name !== 'AbortError') setError((err as Error).message || '加载设置失败');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => {
      controller.abort();
      modelsController.current?.abort();
      diagnosticController.current?.abort();
    };
  }, []);

  function authHeaders(): Record<string, string> {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (adminToken.trim()) headers['x-admin-token'] = adminToken.trim();
    return headers;
  }

  function applyProfile(profile: ApiProfile) {
    modelsController.current?.abort();
    diagnosticController.current?.abort();
    setSelectedProfileId(profile.id);
    setProvider(profile.provider);
    setBaseUrl(profile.baseUrl);
    setModel(profile.model);
    setThinkingDepth(profile.thinkingDepth);
    setTimeoutMs(String(profile.timeoutMs));
    setModels([]);
    setApiKey(profile.apiKey ?? '');
    setClearApiKey(false);
    showToast(`已载入预设「${profile.name}」`, 'info');
  }

  function createProfile() {
    const name = newProfileName.trim();
    if (!name) return setError('请输入预设名称');
    const profile: ApiProfile = { id: `custom-${Date.now()}`, name, provider, baseUrl: baseUrl.trim(), model: model.trim(), thinkingDepth, timeoutMs: numericTimeout || 20000, hasApiKey: Boolean(apiKey.trim() || hasApiKey) };
    setProfiles((current) => [...current, profile]);
    setSelectedProfileId(profile.id);
    setCreatingProfile(false);
    setNewProfileName('');
  }

  async function fetchModels() {
    if (!baseUrl.trim()) return setError('请先填写接口 Base URL');
    modelsController.current?.abort();
    const controller = new AbortController();
    modelsController.current = controller;
    setFetchingModels(true);
    setError(null);
    try {
      const response = await fetch(buildApiUrl('/api/settings/llm/models'), { method: 'POST', headers: authHeaders(), body: JSON.stringify(buildModelRequestBody(form)), signal: controller.signal });
      let payload: unknown = null;
      try {
        payload = await response.json();
      } catch (err) {
        if ((err as Error).name === 'AbortError') throw err;
        if (response.ok) throw new Error(modelCatalogErrorMessage('INVALID_RESPONSE'));
      }
      if (modelsController.current !== controller) return;
      if (!response.ok) {
        if (response.status === 403) setNeedsAdminToken(true);
        const code = typeof payload === 'object' && payload !== null ? (payload as { error?: unknown }).error : undefined;
        throw new Error(modelCatalogErrorMessage(code));
      }
      const result = payload as { models?: unknown };
      if (!Array.isArray(result.models) || !result.models.every((item) => typeof item === 'string')) throw new Error(modelCatalogErrorMessage('INVALID_RESPONSE'));
      setModels(result.models);
      showToast(`已获取 ${result.models.length} 个模型`, 'success');
    } catch (err) {
      if (modelsController.current === controller && (err as Error).name !== 'AbortError') setError((err as Error).message || '获取模型目录失败');
    } finally {
      if (modelsController.current === controller) {
        modelsController.current = null;
        setFetchingModels(false);
      }
    }
  }

  async function testConnection() {
    if (timeoutInvalid) {
      setAdvancedOpen(true);
      return setError('超时毫秒必须是 1000 到 120000 之间的整数');
    }
    diagnosticController.current?.abort();
    const controller = new AbortController();
    diagnosticController.current = controller;
    const testedFingerprint = fingerprint;
    setDiagnostic({ status: 'testing', fingerprint: testedFingerprint });
    setError(null);
    try {
      const body: Record<string, unknown> = { provider, baseUrl: baseUrl.trim(), model: model.trim(), thinkingDepth, timeoutMs: numericTimeout };
      if (clearApiKey) body.apiKey = null;
      else if (apiKey.trim()) body.apiKey = apiKey.trim();
      const response = await fetch(buildApiUrl('/api/settings/llm/test'), { method: 'POST', headers: authHeaders(), body: JSON.stringify(body), signal: controller.signal });
      const payload: unknown = await response.json();
      if (diagnosticController.current !== controller) return;
      if (!response.ok) {
        if (response.status === 403) setNeedsAdminToken(true);
        const code = typeof payload === 'object' && payload !== null ? (payload as { error?: unknown }).error : undefined;
        setDiagnostic({ status: 'error', fingerprint: testedFingerprint, code: code as AiDiagnosticErrorCode, message: diagnosticErrorMessage(code) });
        return;
      }
      if (typeof payload !== 'object' || payload === null) throw new Error('INVALID_RESPONSE');
      const result = payload as Record<string, unknown>;
      if (result.status !== 'ok' || (result.provider !== 'openai' && result.provider !== 'anthropic') || typeof result.model !== 'string' || typeof result.elapsedMs !== 'number' || typeof result.usedSavedApiKey !== 'boolean' || typeof result.message !== 'string') throw new Error('INVALID_RESPONSE');
      setDiagnostic({ status: 'success', fingerprint: testedFingerprint, provider: result.provider, model: result.model, elapsedMs: result.elapsedMs, usedSavedApiKey: result.usedSavedApiKey, message: result.message });
    } catch (err) {
      if (diagnosticController.current !== controller || (err as Error).name === 'AbortError') return;
      setDiagnostic({ status: 'error', fingerprint: testedFingerprint, code: 'UPSTREAM_UNAVAILABLE', message: (err as Error).message === 'INVALID_RESPONSE' ? diagnosticErrorMessage('INVALID_RESPONSE') : diagnosticErrorMessage('UPSTREAM_UNAVAILABLE') });
    } finally {
      if (diagnosticController.current === controller) diagnosticController.current = null;
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (timeoutInvalid) {
      setAdvancedOpen(true);
      return setError('超时毫秒必须是 1000 到 120000 之间的整数');
    }
    setSaving(true);
    setError(null);
    try {
      const patch: Record<string, unknown> = { provider, baseUrl: baseUrl.trim(), model: model.trim(), thinkingDepth, timeoutMs: numericTimeout, profilesJson: JSON.stringify(profilesForServer(profiles)), activeProfileId: selectedProfileId || null };
      if (clearApiKey) patch.apiKey = null;
      else if (apiKey.trim()) patch.apiKey = apiKey.trim();
      const response = await fetch(buildApiUrl('/api/settings/llm'), { method: 'PUT', headers: authHeaders(), body: JSON.stringify(patch) });
      if (!response.ok) {
        if (response.status === 403) setNeedsAdminToken(true);
        throw new Error(await responseMessage(response, `保存失败：HTTP ${response.status}`));
      }
      const payload: unknown = await response.json();
      if (!isSettingsView(payload)) throw new Error('返回的设置数据格式不正确');
      setProvider(payload.provider);
      setBaseUrl(payload.baseUrl ?? '');
      setModel(payload.model);
      setThinkingDepth(payload.thinkingDepth);
      setTimeoutMs(String(payload.timeoutMs));
      setHasApiKey(payload.hasApiKey);
      setFromEnv(payload.fromEnv);
      setProfiles(payload.profiles.length ? payload.profiles.map(profileFromServer) : BUILT_IN_PROFILES);
      setSelectedProfileId(payload.activeProfileId ?? '');
      setApiKey('');
      setClearApiKey(false);
      showToast('AI 设置已保存并即时生效', 'success');
    } catch (err) {
      const message = (err as Error).message || '保存设置失败';
      setError(message);
      showToast(message, 'error');
    } finally {
      setSaving(false);
    }
  }

  const disabled = loading || saving;
  return (
    <form className="ai-engine-settings" onSubmit={save} aria-busy={disabled}>
      <header className="settings-category__header">
        <span className="settings-category__eyebrow">AI 引擎</span>
        <h2>连接你的 AI 服务</h2>
        <p>先选择预设并填写密钥，测试成功后即可保存启用；修改无需重启服务。</p>
      </header>
      <AiEngineStatus provider={provider} model={model} hasApiKey={hasApiKey} diagnostic={diagnostic} />
      <AiProfilePicker profiles={profiles} selectedId={selectedProfileId} disabled={disabled} creating={creatingProfile} newName={newProfileName} onApply={applyProfile} onDelete={(profile) => { setProfiles((current) => current.filter((item) => item.id !== profile.id)); if (selectedProfileId === profile.id) setSelectedProfileId(''); }} onCreatingChange={setCreatingProfile} onNewNameChange={setNewProfileName} onCreate={createProfile} />
      <AiQuickConnect apiKey={apiKey} hasApiKey={hasApiKey && !clearApiKey} disabled={disabled} saving={saving} diagnostic={diagnostic} inputRef={keyRef} onApiKeyChange={(value) => { setApiKey(value); if (value) setClearApiKey(false); }} onTest={() => void testConnection()} />
      <article className="ai-current-model" aria-label="当前模型">
        <span>当前模型</span>
        <strong>{model.trim() || '尚未选择模型'}</strong>
        <small>{provider === 'anthropic' ? 'Anthropic 协议' : 'OpenAI 兼容协议'}</small>
      </article>
      <button type="button" className="ai-advanced-toggle" aria-expanded={advancedOpen} aria-controls="ai-advanced-settings" onClick={() => setAdvancedOpen((current) => !current)}>
        <span><strong>高级连接与推理设置</strong><small>接口、模型目录、思考深度、超时和管理员权限</small></span>
        <span aria-hidden="true">{advancedOpen ? '收起' : '展开'}</span>
      </button>
      {advancedOpen && (
        <section id="ai-advanced-settings" className="ai-advanced-content">
          <div className="ai-settings-grid">
            <label className="room-sheet__field" htmlFor="settings-provider"><span>服务商接口协议</span><select id="settings-provider" value={provider} onChange={(event) => { setProvider(event.target.value as LlmProviderType); setModels([]); }} disabled={disabled}><option value="openai">OpenAI / 兼容接口</option><option value="anthropic">Anthropic Claude</option></select></label>
            <label className="room-sheet__field" htmlFor="settings-base-url"><span>接口地址 Base URL</span><input id="settings-base-url" type="url" value={baseUrl} onChange={(event) => { setBaseUrl(event.target.value); setModels([]); }} disabled={disabled} placeholder="https://api.example.com/v1" /><small>{fromEnv ? '当前默认来自环境变量。' : ''}留空保存将回落到启动配置。</small></label>
            <AiModelPicker model={model} models={models} disabled={disabled} fetching={fetchingModels} onModelChange={setModel} onRefresh={() => void fetchModels()} />
            <label className="room-sheet__field" htmlFor="settings-thinking-depth"><span>思考深度</span><select id="settings-thinking-depth" value={thinkingDepth} onChange={(event) => setThinkingDepth(event.target.value as ThinkingDepth)} disabled={disabled}>{THINKING_DEPTH_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select><small>{thinkingDepthDescription(provider)}</small></label>
            <label className="room-sheet__field" htmlFor="settings-timeout"><span>单次决策超时（毫秒）</span><input id="settings-timeout" type="number" min="1000" max="120000" step="1" value={timeoutMs} onChange={(event) => setTimeoutMs(event.target.value)} aria-invalid={timeoutInvalid ? 'true' : undefined} aria-describedby={timeoutInvalid && error ? 'ai-settings-error' : undefined} required disabled={disabled} /></label>
            <label className="room-sheet__field" htmlFor="settings-admin-token"><span>管理员口令</span><input id="settings-admin-token" type="password" value={adminToken} onChange={(event) => setAdminToken(event.target.value)} placeholder={needsAdminToken ? '远程操作需要 ADMIN_TOKEN' : '仅远程受保护时需要'} autoComplete="off" disabled={saving} /><small>仅本次设置会话有效，不会持久化。</small></label>
            {hasApiKey && !clearApiKey && <div className="ai-danger-zone"><div><strong>清除已保存密钥</strong><p>保存后将回落到环境变量或无密钥状态。</p></div><button type="button" onClick={() => { if (window.confirm('确认清除已保存的 API Key？此操作将在保存设置后生效。')) { setClearApiKey(true); setApiKey(''); } }} disabled={disabled}>清除密钥</button></div>}
            {clearApiKey && <div className="ai-danger-zone ai-danger-zone--pending"><div><strong>密钥等待清除</strong><p>点击保存并启用后生效。</p></div><button type="button" onClick={() => setClearApiKey(false)} disabled={disabled}>撤销</button></div>}
          </div>
        </section>
      )}
      {error && <p id="ai-settings-error" className="room-sheet__error" role="alert">{error}</p>}
    </form>
  );
}
