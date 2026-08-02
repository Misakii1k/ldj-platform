import type { ReactNode } from 'react';

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
  readonly spectator?: boolean;
  readonly players: readonly TabletopPlayer[];
  readonly actions?: ReactNode;
  readonly drawer?: ReactNode;
  readonly children: ReactNode;
}

export type GameDrawerKind = 'rules' | 'log' | 'private';
