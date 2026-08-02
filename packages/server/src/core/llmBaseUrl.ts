export function normalizeLlmBaseUrl(value: string): string {
  const trimmed = value.trim();
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
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
