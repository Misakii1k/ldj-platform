import type { ReactNode } from 'react';
import type { TabletopTheme } from '../../shared-ui/TabletopOvalShell.tsx';

export interface TabletopPlayer {
  readonly id: string;
  readonly name: string;
  readonly status: string;
  readonly active?: boolean;
  readonly eliminated?: boolean;
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
