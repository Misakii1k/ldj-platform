import { ackEnvelopeSchema } from '@lan-party/shared';
import { describe, expect, it } from 'vitest';

import { parseAckCredential } from './ack-credential';

function ackWithResult(result: unknown) {
  return ackEnvelopeSchema.parse({
    v: 1,
    type: 'ack',
    requestId: 'request-credential',
    serverNow: 1,
    roomSeq: 7,
    payload: { accepted: true, result },
  });
}

describe('ack credential result', () => {
  it('accepts the single strict top-level credential shape', () => {
    expect(
      parseAckCredential(
        ackWithResult({
          playerId: 'player-a',
          resumeToken: 'a'.repeat(32),
        }),
      ),
    ).toEqual({
      playerId: 'player-a',
      resumeToken: 'a'.repeat(32),
    });
  });

  it('rejects nested, incomplete, and extended result shapes', () => {
    const valid = { playerId: 'player-a', resumeToken: 'a'.repeat(32) };
    expect(parseAckCredential(ackWithResult({ credential: valid }))).toBeUndefined();
    expect(parseAckCredential(ackWithResult({ playerId: 'player-a' }))).toBeUndefined();
    expect(parseAckCredential(ackWithResult({ ...valid, role: 'player' }))).toBeUndefined();
  });
});
