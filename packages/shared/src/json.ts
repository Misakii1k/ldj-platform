import { z } from 'zod';

export type JsonPrimitive = boolean | number | string | null;
export type JsonArray = JsonValue[];
export type JsonObject = { [key: string]: JsonValue };
export type JsonValue = JsonPrimitive | JsonArray | JsonObject;

const MAX_JSON_DEPTH = 10;
const MAX_JSON_ENTRIES = 256;
const MAX_JSON_BYTES = 16 * 1024;
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function rejectDangerousRawKeys(
  value: unknown,
  ctx: z.RefinementCtx,
  path: PropertyKey[] = [],
  depth = 0,
): void {
  if (depth > MAX_JSON_DEPTH || value === null || typeof value !== 'object') return;

  if (Array.isArray(value)) {
    value.forEach((entry, index) => rejectDangerousRawKeys(entry, ctx, [...path, index], depth + 1));
    return;
  }

  for (const key of Object.keys(value)) {
    if (FORBIDDEN_KEYS.has(key)) {
      ctx.addIssue({ code: 'custom', message: `Forbidden object key: ${key}`, path: [...path, key] });
      continue;
    }
    rejectDangerousRawKeys((value as Record<string, unknown>)[key], ctx, [...path, key], depth + 1);
  }
}

function utf8ByteLength(value: string): number {
  let bytes = 0;
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    bytes += codePoint <= 0x7f ? 1 : codePoint <= 0x7ff ? 2 : codePoint <= 0xffff ? 3 : 4;
  }
  return bytes;
}

export const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string().max(2_000),
    z.number().finite(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema).max(MAX_JSON_ENTRIES),
    z.record(z.string().min(1).max(64), jsonValueSchema),
  ]),
);

const jsonObjectSchema: z.ZodType<JsonObject> = z.record(
  z.string().min(1).max(64),
  jsonValueSchema,
);

function validateJsonTree(
  value: JsonValue,
  ctx: z.RefinementCtx,
  path: PropertyKey[] = [],
  depth = 0,
): void {
  if (depth > MAX_JSON_DEPTH) {
    ctx.addIssue({ code: 'custom', message: `JSON exceeds maximum depth ${MAX_JSON_DEPTH}`, path });
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((entry, index) => validateJsonTree(entry, ctx, [...path, index], depth + 1));
    return;
  }

  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value);
    if (entries.length > MAX_JSON_ENTRIES) {
      ctx.addIssue({
        code: 'custom',
        message: `JSON object exceeds ${MAX_JSON_ENTRIES} entries`,
        path,
      });
    }
    for (const [key, entry] of entries) {
      if (FORBIDDEN_KEYS.has(key)) {
        ctx.addIssue({ code: 'custom', message: `Forbidden object key: ${key}`, path: [...path, key] });
      } else {
        validateJsonTree(entry, ctx, [...path, key], depth + 1);
      }
    }
  }
}

function withJsonSafety<T extends JsonValue>(schema: z.ZodType<T>): z.ZodType<T> {
  return z
    .unknown()
    .superRefine((value, ctx) => rejectDangerousRawKeys(value, ctx))
    .pipe(schema)
    .superRefine((value, ctx) => {
    validateJsonTree(value, ctx);
    if (utf8ByteLength(JSON.stringify(value)) > MAX_JSON_BYTES) {
      ctx.addIssue({ code: 'custom', message: `JSON object exceeds ${MAX_JSON_BYTES} bytes` });
    }
  });
}

export const safeJsonValueSchema = withJsonSafety(jsonValueSchema);
export const safeJsonObjectSchema = withJsonSafety(jsonObjectSchema);

export const emptyPayloadSchema = z.object({}).strict();
