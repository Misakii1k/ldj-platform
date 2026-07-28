import { useRef, useState, type FormEvent } from 'react';
import type { GameCatalogEntry } from '@ldj/shared';
import { useConnection } from '../connection/useConnection.ts';
import { describeError } from '../shared-ui/errors.ts';
import { useToast } from '../shared-ui/ToastContext.tsx';
import { SheetDialog } from './SheetDialog.tsx';
import { makeMeFromRoomAck, parseRoomAck } from './roomAck.ts';

interface CreateRoomSheetProps {
  game: GameCatalogEntry;
  onClose: () => void;
}

export function CreateRoomSheet({ game, onClose }: CreateRoomSheetProps) {
  const { send, setMe, state } = useConnection();
  const { showToast } = useToast();
  const nicknameRef = useRef<HTMLInputElement | null>(null);
  const [nickname, setNickname] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connectionReady = state.connState !== 'connecting' && state.connState !== 'reconnecting';
  const canSubmit =
    !submitting &&
    connectionReady &&
    nickname.trim().length >= 1 &&
    nickname.trim().length <= 16;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;

    const normalizedNickname = nickname.trim();
    setSubmitting(true);
    setError(null);
    try {
      const ack = await send('create_room', {
        nickname: normalizedNickname,
        gameId: game.id,
        ...(password.length > 0 ? { password } : {}),
      });
      const outcome = parseRoomAck(ack.payload);
      if (!outcome) {
        setError('服务器返回异常，请重试');
        return;
      }
      setMe(makeMeFromRoomAck(outcome, normalizedNickname));
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
      title={`创建「${game.displayName}」房间`}
      description={`本局适合 ${game.minPlayers}–${game.maxPlayers} 人，创建后可把房间码发给身边的朋友。`}
      onClose={onClose}
      initialFocusRef={nicknameRef}
    >
      <form className="room-sheet__form" onSubmit={handleSubmit}>
        <label className="room-sheet__field" htmlFor="create-nickname">
          <span>你的昵称</span>
          <input
            ref={nicknameRef}
            id="create-nickname"
            value={nickname}
            onChange={(event) => setNickname(event.target.value)}
            placeholder="例如：小明"
            maxLength={16}
            autoComplete="nickname"
            aria-invalid={Boolean(error)}
            aria-describedby={error ? 'create-room-error' : undefined}
            required
          />
        </label>
        <label className="room-sheet__field" htmlFor="create-password">
          <span>房间密码 <em>可选</em></span>
          <input
            id="create-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="留空则所有人都可加入"
            maxLength={32}
            autoComplete="new-password"
          />
        </label>
        {error && <p id="create-room-error" className="room-sheet__error" role="alert">{error}</p>}
        <button type="submit" className="room-sheet__submit" disabled={!canSubmit}>
          {submitting ? '正在创建…' : '创建房间'}
          <span aria-hidden="true">→</span>
        </button>
      </form>
    </SheetDialog>
  );
}
