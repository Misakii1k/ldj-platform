import { describe, expect, it } from 'vitest';

import candidateWordBank from '../../data/word-bank.candidate.json' with { type: 'json' };

const ROOT_KEYS = ['originalityNotice', 'pairs', 'status', 'version'];
const PAIR_KEYS = ['category', 'civilianWord', 'difficulty', 'undercoverWord'];
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const DIFFICULTIES = new Set(['easy', 'medium', 'hard']);

type UnknownRecord = Record<string, unknown>;

function sortedKeys(value: UnknownRecord): string[] {
  return Object.keys(value).sort();
}

function assertNoPrototypePollutionKeys(value: unknown): void {
  if (Array.isArray(value)) {
    value.forEach(assertNoPrototypePollutionKeys);
    return;
  }
  if (value === null || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    expect(FORBIDDEN_KEYS.has(key), `forbidden key: ${key}`).toBe(false);
    assertNoPrototypePollutionKeys(child);
  }
}

function normalizeWord(value: string): string {
  return value.trim().normalize('NFC');
}

describe('candidate Undercover word bank', () => {
  it('remains an explicitly unapproved candidate with a review notice', () => {
    expect(sortedKeys(candidateWordBank)).toEqual(ROOT_KEYS);
    expect(candidateWordBank.version).toMatch(/^r1-candidate-/u);
    expect(candidateWordBank.status).toBe('candidate');
    expect(candidateWordBank.originalityNotice).toContain('独立编写');
    expect(candidateWordBank.originalityNotice).toContain('人工复核');
    expect(candidateWordBank.originalityNotice).toContain('尚未冻结');
  });

  it('contains at least 100 strictly formatted, non-empty pairs', () => {
    expect(candidateWordBank.pairs.length).toBeGreaterThanOrEqual(100);
    for (const pair of candidateWordBank.pairs) {
      expect(sortedKeys(pair)).toEqual(PAIR_KEYS);
      expect(pair.civilianWord).toBe(normalizeWord(pair.civilianWord));
      expect(pair.undercoverWord).toBe(normalizeWord(pair.undercoverWord));
      expect(Array.from(pair.civilianWord)).not.toHaveLength(0);
      expect(Array.from(pair.undercoverWord)).not.toHaveLength(0);
      expect(pair.civilianWord).not.toBe(pair.undercoverWord);
      expect(pair.category.trim()).not.toBe('');
      expect(DIFFICULTIES.has(pair.difficulty)).toBe(true);
    }
  });

  it('contains no exact or reverse-direction duplicate pair', () => {
    const seen = new Set<string>();
    for (const pair of candidateWordBank.pairs) {
      const words = [normalizeWord(pair.civilianWord), normalizeWord(pair.undercoverWord)].sort();
      const undirectedKey = JSON.stringify(words);
      expect(seen.has(undirectedKey), `duplicate pair: ${words.join(' / ')}`).toBe(false);
      seen.add(undirectedKey);
    }
  });

  it('contains no prototype-pollution key at any nesting depth', () => {
    assertNoPrototypePollutionKeys(candidateWordBank);
  });
});
