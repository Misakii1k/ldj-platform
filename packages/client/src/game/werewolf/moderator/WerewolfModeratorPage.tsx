import { useGameVisibility } from '../../tabletop/useGameVisibility.ts';
/**
 * 狼人杀「真人主持」模式入口：按身份分流到法官控制台 / 玩家端 / 观战端。
 *
 * 法官端与玩家端各自负责自己的页面骨架（控制台用工作台布局，玩家端用共享牌桌外壳），
 * 这里只做身份判定与数据传递。
 */
import type { WerewolfModeratorView } from '@ldj/shared';
import { useConnection } from '../../../connection/useConnection.ts';
import { useUserProfile } from '../../../user/UserProfileContext.tsx';
import { ModeratorHostConsole } from './ModeratorHostConsole.tsx';
import { PlayerCardView } from './PlayerCardView.tsx';
import { WerewolfThemeProvider } from '../WerewolfThemeProvider.tsx';
import './werewolf-moderator.css';

interface WerewolfModeratorPageProps {
  readonly view: WerewolfModeratorView;
}

export function WerewolfModeratorPage({ view }: WerewolfModeratorPageProps) {
  useGameVisibility();
  const { state, me } = useConnection();
  const { profile } = useUserProfile();

  const members = state.room?.members ?? [];
  const myUserId = me?.playerId ?? '';
  const sessionId = state.game?.sessionId ?? '';
  const spectator = state.game?.role === 'spectator';

  return (
    <WerewolfThemeProvider
      timelinePeriod={view.timeline?.period}
      phase={view.gameEnded ? 'game_over' : undefined}
    >
      {view.isModerator ? (
        <ModeratorHostConsole
          view={view}
          members={members}
          myAvatar={profile.avatar}
        />
      ) : (
        <PlayerCardView
          key={`${sessionId}:${myUserId}`}
          view={view}
          members={members}
          sessionId={sessionId}
          myUserId={myUserId}
          myAvatar={profile.avatar}
          spectator={spectator}
        />
      )}
    </WerewolfThemeProvider>
  );
}
