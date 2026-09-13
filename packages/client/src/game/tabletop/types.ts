import type { ReactNode } from 'react';
import type { TabletopTheme } from '../../shared-ui/TabletopOvalShell.tsx';

export interface TabletopPlayer {
  readonly id: string;
  readonly name: string;
  /** 席位第二行的自由文本（如「侍女庇护」「已自告」）。可与 handCount 并存，不重复手牌数。 */
  readonly status: string;
  readonly active?: boolean;
  /** 与 active 同义；两者都给出时以 isCurrentTurn 为准。 */
  readonly isCurrentTurn?: boolean;
  readonly eliminated?: boolean;
  /** 正在发言：驱动外壳的发言波纹。 */
  readonly isSpeaking?: boolean;
  /** 持牌数：驱动外壳的手牌徽章。 */
  readonly handCount?: number;
  readonly score?: number;
  readonly roleTag?: string;
  /** 覆盖席位徽章文本；未提供时回落到 status。 */
  readonly badge?: string;
  readonly avatarUrl?: string;
}

export interface TabletopAction {
  readonly id: string;
  readonly label: string;
  readonly disabled?: boolean;
  readonly onAction: () => void;
}

export interface TabletopShellProps {
  readonly title: string;
  readonly phase: string;
  readonly gameId?: string;
  readonly spectator?: boolean;
  /** 游戏专属 felt 主题（未指定时按标题兜底：悬疑夜晚→mystery、法庭→court、扑克→poker、其它→party） */
  readonly theme?: TabletopTheme;
  readonly players: readonly TabletopPlayer[];
  readonly actions?: ReactNode;
  readonly drawer?: ReactNode;
  readonly rulesButton?: ReactNode;
  readonly hideSeats?: boolean;
  readonly stageFit?: 'safe' | 'arena';
  readonly phaseKey?: string;
  readonly children: ReactNode;
}

export type GameDrawerKind = 'rules' | 'log' | 'private';
