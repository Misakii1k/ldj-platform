export const VISIBILITY_POLICIES = [
  'public',
  'owner_only',
  'others_only',
  'participants',
  'after_reveal',
] as const;

export type VisibilityPolicy = (typeof VISIBILITY_POLICIES)[number];

export interface ObservationContext {
  role: 'participant' | 'spectator';
  playerId?: string;
  revealed: boolean;
}

export function canObserve(
  policy: VisibilityPolicy,
  recipient: ObservationContext,
  ownerId?: string,
): boolean {
  if (policy === 'public') return true;
  if (policy === 'after_reveal') return recipient.revealed;
  if (policy === 'participants') return recipient.role === 'participant';
  if (recipient.role !== 'participant' || ownerId === undefined) return false;
  if (policy === 'owner_only') return recipient.playerId === ownerId;
  return recipient.playerId !== undefined && recipient.playerId !== ownerId;
}
