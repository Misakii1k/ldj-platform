import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useConnection } from '../connection/useConnection.ts';
import { buildApiUrl } from '../connection/serverAddress.ts';
import { describeError } from '../shared-ui/errors.ts';
import { useToast } from '../shared-ui/ToastContext.tsx';
import { SheetDialog } from './SheetDialog.tsx';
import { makeMeFromRoomAck, parseRoomAck } from './roomAck.ts';
import { useUserProfile } from '../user/UserProfileContext.tsx';
import { UserAvatar } from '../user/UserAvatar.tsx';

interface JoinRoomSheetProps {
  onClose: () => void;
  /** 邀请深链（/join/房间码）预填的房间码 */
  initialRoomCode?: string;
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

function roomStatusLabel(room: Pick<LanRoom, 'status' | 'playerCount'>): string {
  if (room.playerCount === 0) return '等待玩家';
  return room.status === 'LOBBY' ? '等待玩家' : '对局中';
}

export function JoinRoomSheet({ onClose, initialRoomCode = '' }: JoinRoomSheetProps) {
  const { send, setMe, state } = useConnection();
  const { profile, setNickname: saveUserNickname, openProfileModal } = useUserProfile();
  const { showToast } = useToast();
  const nicknameRef = useRef<HTMLInputElement | null>(null);
  const roomCodeRef = useRef<HTMLInputElement | null>(null);
  const [nickname, setNickname] = useState(profile.nickname);
  const [roomCode, setRoomCode] = useState(initialRoomCode);
  const [password, setPassword] = useState('');
  const [asSpectator, setAsSpectator] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestedName, setSuggestedName] = useState<string | null>(null);
  const [rooms, setRooms] = useState<LanRoom[]>([]);
  const [roomsLoading, setRoomsLoading] = useState(true);
  const [roomsRefreshing, setRoomsRefreshing] = useState(false);
  const [roomsError, setRoomsError] = useState<string | null>(null);

  const refreshRooms = useCallback(async () => {
    setRoomsRefreshing(true);
    try {
      const response = await fetch(buildApiUrl('/api/rooms'), {
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
    saveUserNickname(normalizedNickname);
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
      if (message.includes('昵称') || (err as { payload?: { code?: string } })?.payload?.code === 'NICKNAME_TAKEN') {
        const base = normalizedNickname.replace(/\d+$/, '') || '玩家';
        const candidate = `${base}${Math.floor(Math.random() * 89 + 10)}`;
        setSuggestedName(candidate);
        window.requestAnimationFrame(() => nicknameRef.current?.focus());
      } else {
        setSuggestedName(null);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SheetDialog
      title="加入局域网房间"
      description="选择同一局域网已发现的房间，或直接输入好友给你的 5 位房间码。"
      onClose={onClose}
      initialFocusRef={roomCode ? nicknameRef : roomCodeRef}
      footer={
        <button type="submit" form="join-room-form" className="room-sheet__submit" disabled={!canSubmit}>
          {submitting ? '正在加入…' : '确认加入房间'}
          <span aria-hidden="true">→</span>
        </button>
      }
    >
      <section className="lan-room-discovery" aria-label="局域网房间发现">
        <div className="lan-room-discovery__header">
          <div className="lan-room-discovery__title">
            <span className="lan-room-discovery__indicator" aria-hidden="true" />
            <h3>同一局域网房间</h3>
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
                        {roomStatusLabel(room)}
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
                    {selected ? '已选用' : '填入房间码'}
                  </button>
                </article>
              );
            })}
          </div>
        ) : roomsError ? (
          <p className="lan-room-discovery__hint" role="status">{roomsError}</p>
        ) : (
          <p className="lan-room-discovery__empty" role="status">暂未发现开启的局域网房间，可以输入房间码加入。</p>
        )}
        {roomsError && rooms.length > 0 && <p className="lan-room-discovery__hint" role="status">{roomsError}</p>}
      </section>

      <form id="join-room-form" className="room-sheet__form" onSubmit={handleSubmit}>
        <div className="room-sheet__profile-row">
          <button
            type="button"
            className="room-sheet__avatar-btn"
            onClick={openProfileModal}
            title="点击更换头像"
          >
            <UserAvatar avatar={profile.avatar} nickname={nickname} size={48} />
            <span className="room-sheet__avatar-badge">换头像</span>
          </button>
          <label className="room-sheet__field" htmlFor="join-nickname" style={{ flex: 1 }}>
            <span>玩家昵称</span>
            <input
              ref={nicknameRef}
              id="join-nickname"
              value={nickname}
              onChange={(event) => setNickname(event.target.value)}
              placeholder="输入你的昵称"
              maxLength={16}
              autoComplete="nickname"
              aria-invalid={Boolean(error)}
              aria-describedby={error ? 'join-room-error' : undefined}
              required
            />
          </label>
        </div>
        <label className="room-sheet__field" htmlFor="join-room-code">
          <span>房间码</span>
          <input
            ref={roomCodeRef}
            id="join-room-code"
            value={roomCode}
            onChange={(event) => setRoomCode(event.target.value.toUpperCase())}
            placeholder="输入 5 位房间码"
            maxLength={5}
            autoComplete="off"
            inputMode="text"
            aria-invalid={Boolean(roomCode) && !hasValidRoomCode}
            aria-describedby={error ? 'join-room-error' : 'join-room-code-hint'}
          />
          <small id="join-room-code-hint">点选上方房间自动填入，或直接输入 5 位房间码。</small>
        </label>
        <label className="room-sheet__field" htmlFor="join-password">
          <span>房间密码 <em>(如有)</em></span>
          <input
            id="join-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="未设密码可留空"
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
        {error && (
          <div className="room-sheet__error-box" role="alert">
            <p id="join-room-error" className="room-sheet__error">{error}</p>
            {suggestedName && (
              <button
                type="button"
                className="room-sheet__quick-rename-btn"
                onClick={() => {
                  setNickname(suggestedName);
                  saveUserNickname(suggestedName);
                  setSuggestedName(null);
                  setError(null);
                  window.requestAnimationFrame(() => nicknameRef.current?.focus());
                }}
              >
                一键改用推荐昵称「{suggestedName}」
              </button>
            )}
          </div>
        )}
      </form>
    </SheetDialog>
  );
}