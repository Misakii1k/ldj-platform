import { createHash } from 'node:crypto';

function canonicalize(value: unknown, seen: Set<object>): string {
  if (value === null) return 'null';
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('状态摘要只接受有限数值');
    return JSON.stringify(value);
  }
  if (typeof value !== 'object') throw new Error('状态摘要只接受 JSON 可序列化值');
  if (seen.has(value)) throw new Error('状态摘要不接受循环引用');
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      return `[${value.map((entry) => canonicalize(entry, seen)).join(',')}]`;
    }
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalize(record[key], seen)}`)
      .join(',')}}`;
  } finally {
    seen.delete(value);
  }
}

export function canonicalJson(value: unknown): string {
  return canonicalize(value, new Set());
}

export function createStateDigest(state: unknown): string {
  return createHash('sha256').update(canonicalJson(state)).digest('hex');
}

export function isSha256(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}
