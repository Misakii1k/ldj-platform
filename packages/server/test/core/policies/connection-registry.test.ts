import { describe, expect, it } from 'vitest';

import {
  ConnectionRegistry,
  createVerifiedMemberIdentity,
  type VerifiedMemberIdentity,
} from '../../../src/core/policies/connection-registry.js';

const verified = (memberId: string) => createVerifiedMemberIdentity(memberId);

describe('ConnectionRegistry', () => {
  it('rejects a structurally forged identity that was not issued after verification', () => {
    const registry = new ConnectionRegistry();
    const forged = { memberId: 'player-1' } as unknown as VerifiedMemberIdentity;

    expect(() => registry.bind({ identity: forged, connectionId: 'connection-attacker' })).toThrow(
      'verified member identity',
    );
    expect(registry.activeConnectionFor('player-1')).toBeNull();
  });

  it('gives a newly authenticated connection exclusive authority and identifies the replaced connection', () => {
    const registry = new ConnectionRegistry();

    expect(
      registry.bind({ identity: verified('player-1'), connectionId: 'connection-old' }),
    ).toEqual({ replacedConnectionId: null });
    expect(
      registry.bind({ identity: verified('player-1'), connectionId: 'connection-new' }),
    ).toEqual({ replacedConnectionId: 'connection-old' });

    expect(registry.hasAuthority('player-1', 'connection-old')).toBe(false);
    expect(registry.hasAuthority('player-1', 'connection-new')).toBe(true);
    expect(registry.activeConnectionFor('player-1')).toBe('connection-new');
    expect(registry.activeMemberFor('connection-old')).toBeNull();
    expect(registry.activeMemberFor('connection-new')).toBe('player-1');
  });

  it('does not let an obsolete disconnect remove the replacement session', () => {
    const registry = new ConnectionRegistry();
    registry.bind({ identity: verified('player-1'), connectionId: 'connection-old' });
    registry.bind({ identity: verified('player-1'), connectionId: 'connection-new' });

    expect(registry.release('connection-old')).toBe(false);
    expect(registry.hasAuthority('player-1', 'connection-new')).toBe(true);
    expect(registry.release('connection-new')).toBe(true);
    expect(registry.activeConnectionFor('player-1')).toBeNull();
    expect(registry.activeMemberFor('connection-new')).toBeNull();
  });

  it('moves a reused connection away from its previous member', () => {
    const registry = new ConnectionRegistry();
    registry.bind({ identity: verified('player-1'), connectionId: 'connection-1' });

    registry.bind({ identity: verified('player-2'), connectionId: 'connection-1' });

    expect(registry.activeConnectionFor('player-1')).toBeNull();
    expect(registry.hasAuthority('player-2', 'connection-1')).toBe(true);
  });
});
