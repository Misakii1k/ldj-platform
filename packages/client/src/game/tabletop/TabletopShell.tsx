import { TabletopOvalShell, type PlayerSeat, type TabletopTheme } from '../../shared-ui/TabletopOvalShell.tsx';
import type { TabletopShellProps } from './types.ts';

export function TabletopShell({ title, phase, phaseKey, gameId, spectator, players, actions, drawer, rulesButton, theme, hideSeats, stageFit = 'arena', children }: TabletopShellProps) {
  // 主题优先使用调用方显式指定；缺失时按游戏标题兜底（游戏专属 felt 主题由各游页面直接给出）
  let resolvedTheme: TabletopTheme = theme ?? 'party';
  if (theme === undefined) {
    const t = title.toLowerCase();
    if (t.includes('werewolf') || t.includes('狼人杀') || t.includes('night') || t.includes('证词') || t.includes('thief') || t.includes('小偷')) {
      resolvedTheme = 'mystery';
    } else if (t.includes('judge') || t.includes('裁判') || t.includes('echo')) {
      resolvedTheme = 'court';
    } else if (t.includes('loveletter') || t.includes('情书') || t.includes('landlord') || t.includes('uno')) {
      resolvedTheme = 'poker';
    }
  }

  // 席位字段原样透传：外壳的发言波纹 / 手牌徽章 / 得分 / 角色标签此前因只传 status 而永远不显示。
  const seats: PlayerSeat[] = (players ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    isCurrentTurn: p.isCurrentTurn ?? p.active,
    isSpeaking: p.isSpeaking,
    isEliminated: p.eliminated,
    handCount: p.handCount,
    score: p.score,
    roleTag: p.roleTag,
    badge: p.badge ?? p.status,
    avatarUrl: p.avatarUrl,
  }));

  return (
    <TabletopOvalShell
      title={title}
      subtitle={`阶段：${phase ?? '对局中'}${spectator ? ' · (观战模式)' : ''}`}
      gameId={gameId}
      theme={resolvedTheme}
      players={seats}
      hideSeats={hideSeats}
      stageFit={stageFit}
      phaseKey={phaseKey ?? phase}
      topRightControls={rulesButton}
      centerArena={
        <div className="tabletop-shell-stage">
          {children}
        </div>
      }
      bottomBar={
        actions || drawer ? (
          <div className="tabletop-action-stack">
            {actions && <div className="tabletop-action-stack__actions">{actions}</div>}
            {drawer && <div className="tabletop-action-stack__drawer">{drawer}</div>}
          </div>
        ) : undefined
      }
    />
  );
}

