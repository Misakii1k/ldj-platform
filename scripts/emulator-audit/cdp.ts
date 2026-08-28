/**
 * CDP 助手：连接模拟器 WebView（adb forward tcp:9222），提供 eval / localStorage 注入 / 刷新。
 * 用法：npx tsx scripts/emulator-audit/cdp.ts "<js 表达式>"
 * 或导入：const { withPage, evalJs } = await import('./cdp.ts')
 */
const PAGE_LIST_URL = 'http://127.0.0.1:9222/json/list';

export interface CdpConn {
  send(method: string, params?: Record<string, unknown>): Promise<Record<string, unknown>>;
  close(): void;
}

export async function connect(): Promise<{ conn: CdpConn; send: CdpConn['send'] }> {
  const list = await (await fetch(PAGE_LIST_URL)).json() as { webSocketDebuggerUrl: string; type: string }[];
  const page = list.find((t) => t.type === 'page');
  if (!page) throw new Error('未找到 WebView page 目标；先运行 adb forward tcp:9222 localabstract:webview_devtools_remote_<pid>');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise<void>((resolve, reject) => {
    ws.addEventListener('open', () => resolve(), { once: true });
    ws.addEventListener('error', () => reject(new Error('CDP WS 连接失败')), { once: true });
  });
  let seq = 0;
  const pending = new Map<number, { resolve: (v: Record<string, unknown>) => void; reject: (e: Error) => void }>();
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(String(ev.data)) as { id?: number; result?: Record<string, unknown>; error?: { message: string } };
    if (msg.id !== undefined && pending.has(msg.id)) {
      const p = pending.get(msg.id)!;
      pending.delete(msg.id);
      if (msg.error) p.reject(new Error(`CDP ${msg.error.message}`));
      else p.resolve(msg.result ?? {});
    }
  });
  const send = (method: string, params: Record<string, unknown> = {}): Promise<Record<string, unknown>> =>
    new Promise((resolve, reject) => {
      const id = ++seq;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  return { conn: { send, close: () => ws.close() }, send };
}

export async function evalJs(expression: string): Promise<string> {
  const { conn, send } = await connect();
  try {
    await send('Runtime.enable');
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    const result = r.result as { value?: unknown; type?: string; description?: string } | undefined;
    if (r.exceptionDetails) return `EXCEPTION: ${JSON.stringify(r.exceptionDetails).slice(0, 500)}`;
    if (result?.type === 'undefined') return 'undefined';
    return String(result?.value ?? result?.description ?? JSON.stringify(result));
  } finally {
    conn.close();
  }
}

// CLI：npx tsx scripts/emulator-audit/cdp.ts "1+1"
if (process.argv[1]?.replace(/\\/g, '/').endsWith('cdp.ts')) {
  const expr = process.argv[2] ?? 'document.title';
  console.log(await evalJs(expr));
}
