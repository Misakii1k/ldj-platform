import type {
  WerewolfModeratorAction,
  WerewolfModeratorConfig,
  WerewolfModeratorPlayerSummary,
  WerewolfModeratorStatistics,
  WerewolfModeratorView,
  WerewolfRole,
  WerewolfRoleInfo,
  WerewolfTeam,
} from '@ldj/shared';

export type {
  WerewolfModeratorAction,
  WerewolfModeratorConfig,
  WerewolfModeratorPlayerSummary,
  WerewolfModeratorStatistics,
  WerewolfModeratorView,
  WerewolfRole,
  WerewolfRoleInfo,
  WerewolfTeam,
};

export interface ModeratorHistoryEntry {
  readonly action: 'eliminate' | 'revive';
  readonly targetPlayerId: string;
  readonly timestamp: number;
}

export interface ModeratorState {
  readonly schemaVersion: 1;
  readonly moderatorPlayerId: string;
  readonly playerOrder: readonly string[];
  readonly assignedRoles: Readonly<Record<string, WerewolfRole>>;
  readonly eliminatedPlayerIds: readonly string[];
  readonly gameEnded: boolean;
  readonly winner: 'werewolf' | 'good' | null;
  readonly history: readonly ModeratorHistoryEntry[];
}

export type ModeratorEvent =
  | { readonly type: 'player_eliminated'; readonly targetPlayerId: string }
  | { readonly type: 'player_revived'; readonly targetPlayerId: string }
  | { readonly type: 'game_ended'; readonly winner: 'werewolf' | 'good' | null };

export interface ModeratorResult {
  readonly winner: 'werewolf' | 'good' | null;
  readonly endedAt: number;
}
