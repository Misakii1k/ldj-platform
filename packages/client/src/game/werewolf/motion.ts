import type { WerewolfPresentationModel } from './presentation.ts';

type WerewolfPhaseIdentity = Pick<WerewolfPresentationModel, 'dayLabel' | 'phase'>;

export function buildWerewolfPhaseKey(model: WerewolfPhaseIdentity): string {
  return `werewolf:${model.dayLabel}:${model.phase}`;
}
