import { describe, expect, it } from 'vitest';

import { selectPublicAddress } from '../../src/gateway/network.js';

describe('selectPublicAddress', () => {
  it('prefers an explicit public URL', () => {
    expect(
      selectPublicAddress(3000, 'http://party.local:3000', ['http://192.168.1.9:3000']),
    ).toBe('http://party.local:3000');
  });

  it('uses a LAN candidate before localhost', () => {
    expect(selectPublicAddress(3000, undefined, ['http://192.168.1.9:3000'])).toBe(
      'http://192.168.1.9:3000',
    );
    expect(selectPublicAddress(4321, undefined, [])).toBe('http://127.0.0.1:4321');
  });
});
