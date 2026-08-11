import { TabletopOvalShell, type PlayerSeat } from '../../shared-ui/TabletopOvalShell.tsx';
import type { TabletopShellProps } from './types.ts';

export function TabletopShell({ title, phase, spectator, players, actions, drawer, children }: TabletopShellProps) {
  // 根据游戏标题判断主题风格
  let theme: 'poker' | 'mystery' | 'party' | 'court' = 'party';
  const t = title.toLowerCase();
  if (t.includes('werewolf') || t.includes('狼人杀') || t.includes('night') || t.includes('证词') || t.includes('thief') || t.includes('小偷')) {
    theme = 'mystery';
  } else if (t.includes('judge') || t.includes('裁判') || t.includes('echo')) {
    theme = 'court';
  } else if (t.includes('loveletter') || t.includes('情书') || t.includes('landlord') || t.includes('uno')) {
    theme = 'poker';
  }

  const seats: PlayerSeat[] = players.map((p) => ({
    id: p.id,
    name: p.name,
    isCurrentTurn: p.active,
    isEliminated: p.eliminated,
    badge: p.status,
  }));

  return (
    <TabletopOvalShell
      title={title}
      subtitle={`阶段：${phase}${spectator ? ' · (观战模式)' : ''}`}
      theme={theme}
      players={seats}
      centerArena={
        <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          {children}
        </div>
      }
      bottomBar={
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
          {actions}
          {drawer}
        </div>
      }
    />
  );
}

