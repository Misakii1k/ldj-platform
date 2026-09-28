export interface SettlementDockPlayer {
  playerId: string;
  nickname: string;
  avatar?: string;
  ready: boolean;
  isMe: boolean;
  isHost: boolean;
}

export interface SettlementDockModelInput {
  players: readonly SettlementDockPlayer[];
  isHost: boolean;
  isSpectator: boolean;
  meReady: boolean;
  allReady: boolean;
  isWerewolf: boolean;
  countdown: number | null;
}

export type SettlementDockPrimaryAction = 'again' | 'start' | 'none';
export type SettlementDockSecondaryAction = 'cancelReady' | 'readyCancel' | 'none';

export interface SettlementDockModel {
  statusLine: string;
  primary: SettlementDockPrimaryAction;
  secondary: SettlementDockSecondaryAction;
  readyCount: number;
  totalCount: number;
}

export function computeSettlementDockModel(input: SettlementDockModelInput): SettlementDockModel {
  const { players, isHost, isSpectator, meReady, allReady, isWerewolf, countdown } = input;
  const readyCount = players.filter((p) => p.ready).length;
  const totalCount = players.length;

  let statusLine = '';
  let primary: SettlementDockPrimaryAction = 'none';
  let secondary: SettlementDockSecondaryAction = 'none';

  const inCountdown = countdown !== null;

  if (inCountdown) {
    statusLine = '全员就绪 · 即将开局';
    if (isHost) {
      primary = 'start';
      secondary = 'cancelReady';
    } else {
      primary = 'none';
      secondary = isSpectator ? 'none' : 'cancelReady';
    }
  } else if (isWerewolf && allReady) {
    statusLine = isHost ? '全员就绪 · 复盘完了就开' : '全员就绪 · 等房主开局';
    if (isHost) {
      primary = 'start';
      secondary = 'none';
    } else {
      primary = 'none';
      secondary = isSpectator ? 'none' : 'cancelReady';
    }
  } else if (isSpectator) {
    statusLine = '观战中 · 等玩家准备';
    primary = 'none';
    secondary = 'none';
  } else if (!meReady) {
    statusLine = '对局结束 · 再来一局？';
    primary = 'again';
    secondary = 'none';
  } else {
    // meReady 且未进入倒计时 / 未进入全员开局
    const waitingOthers = players.filter((p) => !p.ready && !p.isMe);
    if (waitingOthers.length === 1 && waitingOthers[0]) {
      statusLine = `就等 ${waitingOthers[0].nickname} 了`;
    } else {
      statusLine = `还在等 ${waitingOthers.length} 人`;
    }
    primary = 'none';
    secondary = 'readyCancel';
  }

  return {
    statusLine,
    primary,
    secondary,
    readyCount,
    totalCount,
  };
}
