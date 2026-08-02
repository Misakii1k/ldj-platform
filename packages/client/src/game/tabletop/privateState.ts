export type PrivatePanelEvent =
  | { readonly type: 'reveal'; readonly allowed: boolean; readonly synced: boolean }
  | { readonly type: 'hide' | 'blur' | 'disconnect' | 'sync' };

export function reducePrivatePanelState(revealed: boolean, event: PrivatePanelEvent): boolean {
  if (event.type === 'reveal') return event.allowed && event.synced;
  if (event.type === 'sync') return revealed;
  return false;
}
