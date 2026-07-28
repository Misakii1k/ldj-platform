/**
 * 结构化日志（SPEC §12.4、SEC-009）。
 * JSON 行输出；对敏感键做脱敏，不记录密码、resumeToken、秘密词、种子或完整快照。
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

/** 命中即脱敏的键名片段（小写比较） */
const SENSITIVE_KEY_PARTS = [
  'password',
  'token',
  'secret',
  'seed',
  'word', // civilianWord / undercoverWord
  'snapshot',
];

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[TRUNCATED]';
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const lower = k.toLowerCase();
      if (SENSITIVE_KEY_PARTS.some((p) => lower.includes(p))) {
        out[k] = '[REDACTED]';
      } else {
        out[k] = redact(v, depth + 1);
      }
    }
    return out;
  }
  return value;
}

export interface Logger {
  debug(event: string, fields?: Record<string, unknown>): void;
  info(event: string, fields?: Record<string, unknown>): void;
  warn(event: string, fields?: Record<string, unknown>): void;
  error(event: string, fields?: Record<string, unknown>): void;
  child(bindings: Record<string, unknown>): Logger;
}

export function createLogger(
  minLevel: LogLevel = 'info',
  bindings: Record<string, unknown> = {},
  sink: (line: string) => void = (line) => console.log(line),
): Logger {
  const emit = (level: LogLevel, event: string, fields?: Record<string, unknown>): void => {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[minLevel]) return;
    const record = {
      ts: new Date().toISOString(),
      level,
      event,
      ...bindings,
      ...(fields ? (redact(fields) as Record<string, unknown>) : {}),
    };
    sink(JSON.stringify(record));
  };
  return {
    debug: (e, f) => emit('debug', e, f),
    info: (e, f) => emit('info', e, f),
    warn: (e, f) => emit('warn', e, f),
    error: (e, f) => emit('error', e, f),
    child: (extra) => createLogger(minLevel, { ...bindings, ...extra }, sink),
  };
}
