export type ConnectionState =
  | 'connecting'
  | 'connected'
  | 'recovering'
  | 'restored'
  | 'expired'
  | 'replaced'
  | 'server_recovering';

export interface ConnectionPresentation {
  label: string;
  detail: string;
  tone: 'pending' | 'success' | 'warning' | 'danger';
}

const presentations = {
  connecting: {
    label: '正在连接',
    detail: '正在找到这张游戏桌…',
    tone: 'pending',
  },
  connected: {
    label: '已连接主机',
    detail: '收到主机欢迎消息后即可创建或加入房间。',
    tone: 'success',
  },
  recovering: {
    label: '连接不稳定',
    detail: '正在自动重连，请暂时不要重复操作。',
    tone: 'warning',
  },
  restored: {
    label: '已恢复同步',
    detail: '已追上最新的房间状态。',
    tone: 'success',
  },
  expired: {
    label: '席位已过期',
    detail: '请返回首页重新加入房间。',
    tone: 'danger',
  },
  replaced: {
    label: '席位已被接管',
    detail: '另一台设备已使用你的恢复凭证。',
    tone: 'danger',
  },
  server_recovering: {
    label: '对局恢复中',
    detail: '服务端正在恢复对局，暂不可操作。',
    tone: 'warning',
  },
} as const satisfies Record<ConnectionState, ConnectionPresentation>;

export function getConnectionPresentation(state: ConnectionState): ConnectionPresentation {
  return presentations[state];
}

export function createWebSocketUrl(location: Pick<Location, 'host' | 'protocol'>): string {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${location.host}/ws`;
}

const RETRY_BASE_MS = 500;
const RETRY_CAP_MS = 10_000;
export const RECOVERY_RETRY_DELAY_MS = 2_000;

export function getReconnectDelay(attempt: number, random: () => number = Math.random): number {
  const exponential = Math.min(RETRY_CAP_MS, RETRY_BASE_MS * 2 ** Math.max(0, attempt));
  const jitter = 0.75 + Math.min(1, Math.max(0, random())) * 0.5;
  return Math.round(Math.min(RETRY_CAP_MS, exponential * jitter));
}

export function shouldReconnectAfterClose(sessionWasReplaced: boolean): boolean {
  return !sessionWasReplaced;
}

export function canRetryAfterRecoveryDelay(
  stopped: boolean,
  sessionWasReplaced: boolean,
  socketIsCurrent: boolean,
  socketIsOpen: boolean,
): boolean {
  return !stopped && !sessionWasReplaced && socketIsCurrent && socketIsOpen;
}
