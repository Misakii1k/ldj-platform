import { describe, expect, it } from 'vitest';

import { createRandomId } from './random-id';

describe('browser-safe random identifiers', () => {
  it('uses random bytes without depending on crypto.randomUUID', () => {
    const id = createRandomId('device', (bytes) => {
      bytes.fill(0xab);
      return bytes;
    });
    expect(id).toBe(`device-${'ab'.repeat(16)}`);
  });

  it('creates request identifiers accepted by the protocol character set', () => {
    const id = createRandomId('web', (bytes) => {
      bytes.forEach((_, index) => { bytes[index] = index; });
      return bytes;
    });
    expect(id).toMatch(/^web-[a-f0-9]{32}$/);
  });
});
