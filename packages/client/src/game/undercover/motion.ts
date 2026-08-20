import type { BlankPlayerView } from './types.ts';

type BlankPhaseIdentity = Pick<BlankPlayerView, 'phase' | 'round'>;

export function buildBlankPhaseKey(view: BlankPhaseIdentity): string {
  return `undercover:${view.round}:${view.phase}`;
}
