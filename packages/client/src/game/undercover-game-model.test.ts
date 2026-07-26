import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  getUndercoverActionPermissions,
  getUndercoverViewportProfile,
  parseUndercoverGameView,
  reduceSecretVisibility,
  type UndercoverGameView,
} from './undercover-game-model';

const players = {
  a: { seat: 0, alive: true, online: true },
  b: { seat: 1, alive: true, online: true },
  c: { seat: 2, alive: true, online: false },
  d: { seat: 3, alive: false, online: true, exitReason: 'voted_out' as const, revealedRole: 'civilian' as const },
};

function playerView(
  phase: UndercoverGameView['phase'],
): Extract<UndercoverGameView, { viewerKind: 'player' }> {
  const parsed = parseUndercoverGameView({
    schemaVersion: 1,
    phase,
    round: 2,
    players,
    speakingOrder: ['a', 'b', 'c'],
    currentSpeakerId: phase === 'speaking' ? 'a' : null,
    runoffCandidates: phase === 'runoff_voting' ? ['b', 'c'] : [],
    deadlineAt: phase === 'game_over' ? null : 100_000,
    voteProgress: { locked: 0, eligible: 3 },
    voteResult: null,
    result: null,
    viewerKind: 'player',
    self: { playerId: 'a', word: '豆浆' },
  });
  if (parsed.viewerKind !== 'player') throw new Error('fixture must be a player view');
  return parsed;
}

const readyGate = { connection: 'connected' as const, synchronized: true, requestPending: false };

describe('secret visibility safety', () => {
  it('only reveals during an active hold', () => {
    expect(reduceSecretVisibility(false, 'hold_started')).toBe(true);
    expect(reduceSecretVisibility(true, 'hold_ended')).toBe(false);
    expect(reduceSecretVisibility(true, 'environment_changed')).toBe(false);
    expect(reduceSecretVisibility(false, 'environment_changed')).toBe(false);
  });
});

describe('undercover action permissions', () => {
  it('maps the three player actions to their exact phases', () => {
    expect(getUndercoverActionPermissions(playerView('word_reveal'), readyGate)).toMatchObject({
      confirmWord: true,
      finishSpeech: false,
      lockVote: false,
    });
    expect(getUndercoverActionPermissions(playerView('speaking'), readyGate)).toMatchObject({
      confirmWord: false,
      finishSpeech: true,
      lockVote: false,
    });
    expect(getUndercoverActionPermissions(playerView('voting'), readyGate)).toMatchObject({
      confirmWord: false,
      finishSpeech: false,
      lockVote: true,
      selectableTargetIds: ['b', 'c'],
    });
    expect(getUndercoverActionPermissions(playerView('runoff_voting'), readyGate)).toMatchObject({
      lockVote: true,
      selectableTargetIds: ['b', 'c'],
    });
  });

  it('blocks stale, recovering, spectator, eliminated, and already-finished interaction', () => {
    expect(getUndercoverActionPermissions(playerView('voting'), { ...readyGate, synchronized: false }).lockVote).toBe(false);
    expect(getUndercoverActionPermissions(playerView('voting'), { ...readyGate, connection: 'recovering' }).lockVote).toBe(false);
    expect(getUndercoverActionPermissions(playerView('voting'), readyGate, { voteLocked: true }).lockVote).toBe(false);

    const publicView: Record<string, unknown> = { ...playerView('voting') };
    delete publicView.self;
    const spectator = parseUndercoverGameView({ ...publicView, viewerKind: 'spectator' });
    expect(getUndercoverActionPermissions(spectator, readyGate).selectableTargetIds).toEqual([]);

    const eliminated = parseUndercoverGameView({
      ...playerView('speaking'),
      players: { ...players, a: { ...players.a, alive: false, exitReason: 'voted_out' } },
    });
    expect(getUndercoverActionPermissions(eliminated, readyGate).finishSpeech).toBe(false);
  });

  it('rejects unknown DTO fields and prototype-pollution player IDs', () => {
    expect(() => parseUndercoverGameView({ ...playerView('voting'), unexpected: true })).toThrow();
    expect(() => parseUndercoverGameView({ ...playerView('voting'), self: { playerId: '__proto__', word: 'x' } })).toThrow();
  });
});

describe('mobile viewport contract', () => {
  it('selects the compact two-column profile only for low landscape screens', () => {
    expect(getUndercoverViewportProfile(320, 720)).toBe('portrait');
    expect(getUndercoverViewportProfile(932, 430)).toBe('landscape-compact');
    expect(getUndercoverViewportProfile(1024, 768)).toBe('portrait');
  });

  it('keeps safe areas, dynamic viewport height, compact landscape, and large touch targets in CSS', () => {
    const css = readFileSync(new URL('./UndercoverGameScreen.css', import.meta.url), 'utf8');
    expect(css).toContain('min-height: 100svh');
    expect(css).toContain('min-height: 100dvh');
    expect(css).toContain('env(safe-area-inset-top)');
    expect(css).toContain('env(safe-area-inset-right)');
    expect(css).toContain('env(safe-area-inset-bottom)');
    expect(css).toContain('env(safe-area-inset-left)');
    expect(css).toContain('@media (orientation: landscape) and (max-height: 560px)');
    expect(css).toContain('grid-template-columns: minmax(0, 1.32fr) minmax(220px, .68fr)');
    expect(css).toMatch(/min-height: (44|48|54)px/);
    expect(css).toContain('overflow-x: clip');
  });
});
