import { PrivatePanel } from '../../tabletop/PrivatePanel.tsx';
import type { WerewolfSelfModel } from '../presentation.ts';

interface PrivateRolePanelProps {
  readonly self: WerewolfSelfModel | null;
  readonly synced: boolean;
}

export function PrivateRolePanel({ self, synced }: PrivateRolePanelProps) {
  return (
    <section className="private-role-panel" aria-label="私密身份">
      <h2 className="private-role-panel__title">身份匣</h2>
      {self === null ? (
        <p className="private-role-panel__empty">你正在观战，没有身份信息。</p>
      ) : (
        <PrivatePanel allowed synced={synced}>
          <div className="private-role-panel__card">
            <span>你的身份</span>
            <strong>{self.roleLabel}</strong>
            <small>{self.roleHint}</small>
            {!self.alive && <em>你已出局，仅保留观战视角。</em>}
          </div>
        </PrivatePanel>
      )}
    </section>
  );
}
