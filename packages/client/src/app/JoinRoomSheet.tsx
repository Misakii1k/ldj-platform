import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useConnection } from '../connection/useConnection.ts';
import { describeError } from '../shared-ui/errors.ts';
import { useToast } from '../shared-ui/ToastContext.tsx';
import { SheetDialog } from './SheetDialog.tsx';
import { makeMeFromRoomAck, parseRoomAck } from './roomAck.ts';

interface JoinRoomSheetProps {
  onClose: () => void;
}

interface LanRoom {
  roomCode: string;
  gameId: string;
  gameName: string;
  status: 'LOBBY' | 'IN_GAME';
  playerCount: number;
  maxPlayers: number;
  spectatorCount: number;
  requiresPassword: boolean;
  updatedAt: number;
}

const ROOM_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{5}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseLanRooms(value: unknown): LanRoom[] {
  if (!isRecord(value) || !Array.isArray(value.rooms)) return [];
  return value.rooms.flatMap((room): LanRoom[] => {
    if (!isRecord(room)) return [];
    const {
      roomCode,
      gameId,
      gameName,
      status,
      playerCount,
      maxPlayers,
      spectatorCount,
      requiresPassword,
      updatedAt,
    } = room;
    if (
      typeof roomCode !== 'string' ||
      typeof gameId !== 'string' ||
      typeof gameName !== 'string' ||
      (status !== 'LOBBY' && status !== 'IN_GAME') ||
      typeof playerCount !== 'number' ||
      typeof maxPlayers !== 'number' ||
      typeof spectatorCount !== 'number' ||
      typeof requiresPassword !== 'boolean' ||
      typeof updatedAt !== 'number'
    ) {
      return [];
    }
    return [{
      roomCode,
      gameId,
      gameName,
      status,
      playerCount,
      maxPlayers,
      spectatorCount,
      requiresPassword,
      updatedAt,
    }];
  });
}

function roomStatusLabel(status: LanRoom['status']): string {
  return status === 'LOBBY' ? '大厅筹备中' : '激战进行中';
}

export function JoinRoomSheet({ onClose }: JoinRoomSheetProps) {
  const { send, setMe, state } = useConnection();
  const { showToast } = useToast();
  const nicknameRef = useRef<HTMLInputElement | null>(null);
  const roomCodeRef = useRef<HTMLInputElement | null>(null);
  const [nickname, setNickname] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [password, setPassword] = useState('');
  const [asSpectator, setAsSpectator] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rooms, setRooms] = useState<LanRoom[]>([]);
  const [roomsLoading, setRoomsLoading] = useState(true);
  const [roomsRefreshing, setRoomsRefreshing] = useState(false);
  const [roomsError, setRoomsError] = useState<string | null>(null);

  const refreshRooms = useCallback(async () => {
    setRoomsRefreshing(true);
    try {
      const response = await fetch('/api/rooms', {
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload: unknown = await response.json();
      setRooms(parseLanRooms(payload));
      setRoomsError(null);
    } catch {
      setRoomsError('暂时无法发现房间，你仍可以手动输入房间码加入。');
    } finally {
      setRoomsLoading(false);
      setRoomsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void refreshRooms();
  }, [refreshRooms]);

  const connectionReady = state.connState !== 'connecting' && state.connState !== 'reconnecting';
  const normalizedRoomCode = roomCode.trim().toUpperCase();
  const hasValidRoomCode = ROOM_CODE_PATTERN.test(normalizedRoomCode);
  const canSubmit =
    !submitting &&
    connectionReady &&
    nickname.trim().length >= 1 &&
    nickname.trim().length <= 16 &&
    hasValidRoomCode;

  function selectRoom(room: LanRoom) {
    setRoomCode(room.roomCode);
    setError(null);
    window.requestAnimationFrame(() => roomCodeRef.current?.focus());
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;

    const normalizedNickname = nickname.trim();
    setSubmitting(true);
    setError(null);
    try {
      const ack = await send('join_room', {
        nickname: normalizedNickname,
        roomCode: normalizedRoomCode,
        asSpectator,
        ...(password.length > 0 ? { password } : {}),
      });
      const outcome = parseRoomAck(ack.payload);
      if (!outcome) {
        setError('服务器返回异常，请重试');
        return;
      }
      setMe(makeMeFromRoomAck(outcome, normalizedNickname, asSpectator ? 'spectator' : 'player'));
      onClose();
    } catch (err) {
      const message = describeError(err);
      setError(message);
      showToast(message, 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SheetDialog
      title="加入局域网房间"
      description="同一 Wi-Fi 下会自动发现可加入的房间；也可以手动输入 5 位房间码。"
      onClose={onClose}
      initialFocusRef={nicknameRef}
    >
      <section className="lan-room-discovery" aria-labelledby="lan-room-discovery-title">
        <div className="lan-room-discovery__header">
          <div>
            <p className="lan-room-discovery__eyebrow">LOCAL TABLES</p>
            <h3 id="lan-room-discovery-title">发现同一 Wi-Fi 下的房间</h3>
            <p>点击下方卡片，房间码将自动填入。</p>
          </div>
          <button
            type="button"
            className="lan-room-discovery__refresh"
            onClick={() => void refreshRooms()}
            disabled={roomsRefreshing}
            aria-label="刷新局域网房间列表"
          >
            <span aria-hidden="true">↻</span>
            {roomsRefreshing ? '刷新中' : '刷新'}
          </button>
        </div>

        {roomsLoading ? (
          <p className="lan-room-discovery__empty" role="status" aria-live="polite">正在寻找同一局域网的房间…</p>
        ) : rooms.length > 0 ? (
          <div className="lan-room-list">
            {rooms.map((room) => {
              const selected = normalizedRoomCode === room.roomCode;
              return (
                <article key={room.roomCode} className={`lan-room-card ${selected ? 'is-selected' : ''}`}>
                  <div className="lan-room-card__mark" aria-hidden="true">{room.gameName.slice(0, 1)}</div>
                  <div className="lan-room-card__main">
                    <div className="lan-room-card__title-row">
                      <h4>{room.gameName}</h4>
                      <span className={`lan-room-card__status lan-room-card__status--${room.status.toLowerCase()}`}>
                        {roomStatusLabel(room.status)}
                      </span>
                    </div>
                    <p>{room.playerCount}/{room.maxPlayers} 位玩家 · {room.spectatorCount} 位观战者{room.requiresPassword ? ' · 需要密码' : ''}</p>
                  </div>
                  <button
                    type="button"
                    className="lan-room-card__select"
                    onClick={() => selectRoom(room)}
                    aria-pressed={selected}
                  >
                    {selected ? '已选择' : '加入此房间'}
                  </button>
                </article>
              );
            })}
          </div>
        ) : (
          <p className="lan-room-discovery__empty" role="status">暂未发现开启的局域网房间，你可以输入房间码加入或自行建房。</p>
        )}
        {roomsError && <p className="lan-room-discovery__hint" role="status">{roomsError}</p>}
      </section>

      <form className="room-sheet__form" onSubmit={handleSubmit}>
        <label className="room-sheet__field" htmlFor="join-nickname">
          <span>玩家昵称</span>
          <input
            ref={nicknameRef}
            id="join-nickname"
            value={nickname}
            onChange={(event) => setNickname(event.target.value)}
            placeholder="例如：大头爸爸"
            maxLength={16}
            autoComplete="nickname"
            aria-invalid={Boolean(error)}
            aria-describedby={error ? 'join-room-error' : undefined}
            required
          />
        </label>
        <label className="room-sheet__field" htmlFor="join-room-code">
          <span>房间码 <em>(可点上方快速填入)</em></span>
          <input
            ref={roomCodeRef}
            id="join-room-code"
            value={roomCode}
            onChange={(event) => setRoomCode(event.target.value.toUpperCase())}
            placeholder="选择上方房间，或手动输入 AB2CD"
            maxLength={5}
            autoComplete="off"
            inputMode="text"
            aria-invalid={Boolean(roomCode) && !hasValidRoomCode}
            aria-describedby={error ? 'join-room-error' : 'join-room-code-hint'}
          />
          <small id="join-room-code-hint">选中上方列表即可自动填入，也可手动输入 5 位房间码。</small>
        </label>
        <label className="room-sheet__field" htmlFor="join-password">
          <span>房间密码 <em>(如有)</em></span>
          <input
            id="join-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="受保护的房间需输入密码"
            maxLength={32}
            autoComplete="current-password"
          />
        </label>
        <label className="room-sheet__checkbox">
          <input
            type="checkbox"
            checked={asSpectator}
            onChange={(event) => setAsSpectator(event.target.checked)}
          />
          <span>
            <strong>以观战者身份加入</strong>
            <small>不占用对局席位，可实时旁观进程与参与聊天</small>
          </span>
        </label>
        {error && <p id="join-room-error" className="room-sheet__error" role="alert">{error}</p>}
        <button type="submit" className="room-sheet__submit" disabled={!canSubmit}>
          {submitting ? '正在加入…' : '加入房间'}
          <span aria-hidden="true">→</span>
        </button>
      </form>
    </SheetDialog>
  );
}