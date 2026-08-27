const SCHEME_PATTERN = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//;

export function normalizeLlmBaseUrl(value: string): string {
  const trimmed = value.trim();
  let parsed: URL;
  try {
    parsed = new URL(SCHEME_PATTERN.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    throw new Error('INVALID_LLM_BASE_URL');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('INVALID_LLM_BASE_URL');
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error('INVALID_LLM_BASE_URL');
  }
  parsed.pathname = parsed.pathname.replace(/\/+$/, '');
  return parsed.toString().replace(/\/$/, '');
}

/** 末段是 v<N> 版本段的地址（如 /v1、/v4）已含版本，拼接端点时不再插入 /v1。 */
export function hasVersionedPath(normalizedBaseUrl: string): boolean {
  const lastSegment = normalizedBaseUrl.slice(normalizedBaseUrl.lastIndexOf('/') + 1);
  return /^v\d+$/i.test(lastSegment);
}
