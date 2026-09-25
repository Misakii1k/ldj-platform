import { WEREWOLF_ROLE_DETAILS, type WerewolfSelfModel, type WerewolfPresentationModel } from '../presentation.ts';
import { SecretRoleCard } from './SecretRoleCard.tsx';
import { WerewolfRoleSpotlight } from './WerewolfRoleSpotlight.tsx';

interface PrivateRolePanelProps {
  readonly self: WerewolfSelfModel | null;
  readonly synced: boolean;
  readonly model?: WerewolfPresentationModel;
}
export function PrivateRolePanel({ self, synced, model }: PrivateRolePanelProps) {
  if (!self) return <aside className="werewolf-compact-role" aria-label="观战中">观战视角 · 只读</aside>;
  return <aside className="werewolf-compact-role">
    <SecretRoleCard name={self.roleLabel} camp={self.role === 'wolf' ? '狼人阵营' : '好人阵营'} artwork={self.artworkUrl}>
      <p><strong>技能</strong> · {WEREWOLF_ROLE_DETAILS[self.role].skill}</p>
      <p><strong>本局提示</strong> · {self.roleHint}</p>
      {!synced && <p role="status">正在重连，以下信息以恢复同步后为准。</p>}
      {model && <WerewolfRoleSpotlight model={{ ...model, phase: 'night', mood: 'night' }} privateView />}
    </SecretRoleCard>
  </aside>;
}
