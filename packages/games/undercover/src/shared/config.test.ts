import { describe, expect, it } from 'vitest';

import { parseUndercoverConfig, UndercoverConfigSchema } from './config.js';

describe('UndercoverConfigSchema', () => {
  it('applies the specification defaults', () => {
    expect(parseUndercoverConfig({})).toEqual({
      speakingDurationSeconds: 60,
      votingDurationSeconds: 45,
    });
  });

  it('accepts only supported timer choices', () => {
    expect(
      parseUndercoverConfig({ speakingDurationSeconds: 30, votingDurationSeconds: 60 }),
    ).toEqual({ speakingDurationSeconds: 30, votingDurationSeconds: 60 });
    expect(() => UndercoverConfigSchema.parse({ speakingDurationSeconds: 15 })).toThrow();
  });

  it('rejects unknown fields at the public boundary', () => {
    expect(() => parseUndercoverConfig({ customWord: '不应进入客户端' })).toThrow();
  });
});
