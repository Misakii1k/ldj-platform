import { z } from 'zod';

export function containsOnlyUnicodeScalars(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      if (index + 1 >= value.length) return false;
      const nextCodeUnit = value.charCodeAt(index + 1);
      if (nextCodeUnit < 0xdc00 || nextCodeUnit > 0xdfff) return false;
      index += 1;
    } else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      return false;
    }
  }
  return true;
}

function scalarCount(value: string): number {
  return Array.from(value).length;
}

function createNormalizedInputSchema(options: {
  readonly label: string;
  readonly minScalars: number;
  readonly maxScalars: number;
  readonly maxCodeUnits: number;
}) {
  return z
    .string()
    .max(options.maxCodeUnits)
    .refine(containsOnlyUnicodeScalars, `${options.label} must contain valid Unicode scalar values`)
    .transform((value) => value.trim().normalize('NFC'))
    .refine(
      (value) => {
        const length = scalarCount(value);
        return length >= options.minScalars && length <= options.maxScalars;
      },
      `${options.label} must contain ${String(options.minScalars)} to ${String(options.maxScalars)} Unicode characters`,
    );
}

function createCanonicalOutputSchema(options: {
  readonly label: string;
  readonly minScalars: number;
  readonly maxScalars: number;
  readonly maxCodeUnits: number;
}) {
  return z
    .string()
    .max(options.maxCodeUnits)
    .superRefine((value, ctx) => {
      if (!containsOnlyUnicodeScalars(value)) {
        ctx.addIssue({
          code: 'custom',
          message: `${options.label} must contain valid Unicode scalar values`,
        });
        return;
      }

      if (value !== value.trim().normalize('NFC')) {
        ctx.addIssue({ code: 'custom', message: `${options.label} must already be trimmed NFC text` });
      }

      const length = scalarCount(value);
      if (length < options.minScalars || length > options.maxScalars) {
        ctx.addIssue({
          code: 'custom',
          message: `${options.label} must contain ${String(options.minScalars)} to ${String(options.maxScalars)} Unicode characters`,
        });
      }
    });
}

export const clientNicknameSchema = createNormalizedInputSchema({
  label: 'nickname',
  minScalars: 1,
  maxScalars: 16,
  maxCodeUnits: 64,
});

export const canonicalNicknameSchema = createCanonicalOutputSchema({
  label: 'nickname',
  minScalars: 1,
  maxScalars: 16,
  maxCodeUnits: 32,
});

export const clientChatTextSchema = createNormalizedInputSchema({
  label: 'chat text',
  minScalars: 1,
  maxScalars: 300,
  maxCodeUnits: 1_000,
});

export const canonicalChatTextSchema = createCanonicalOutputSchema({
  label: 'chat text',
  minScalars: 1,
  maxScalars: 300,
  maxCodeUnits: 600,
});
