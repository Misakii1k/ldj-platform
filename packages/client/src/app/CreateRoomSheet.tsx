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

  // 狼人杀专属：扩展角色池开关 + 节奏预设（开启的角色各入池 1 张）
  const isWerewolf = game.id === 'werewolf';
  const [roleGuard, setRoleGuard] = useState(false);
  const [roleHunter, setRoleHunter] = useState(false);
  const [roleIdiot, setRoleIdiot] = useState(false);
  const [pace, setPace] = useState<'fast' | 'standard' | 'relaxed'>('standard');

  const gameConfig = isWerewolf
    ? { roles: { guard: roleGuard, hunter: roleHunter, idiot: roleIdiot }, pace }
    : undefined;

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
        ...(gameConfig !== undefined ? { gameConfig } : {}),
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
      description={`本玩法适合 ${game.minPlayers}–${game.maxPlayers} 人体验，房间创建后直接分享 5 位房间码即可让好友加入！`}
      onClose={onClose}
      initialFocusRef={nicknameRef}
    >
      <form className="room-sheet__form" onSubmit={handleSubmit}>
        <label className="room-sheet__field" htmlFor="create-nickname">
          <span>玩家昵称</span>
          <input
            ref={nicknameRef}
            id="create-nickname"
            value={nickname}
            onChange={(event) => setNickname(event.target.value)}
            placeholder="例如：大头爸爸"
            maxLength={16}
            autoComplete="nickname"
            aria-invalid={Boolean(error)}
            aria-describedby={error ? 'create-room-error' : undefined}
            required
          />
        </label>
        <label className="room-sheet__field" htmlFor="create-password">
          <span>房间密码 <em>(可选)</em></span>
          <input
            id="create-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="留空则允许公开加入"
            maxLength={32}
            autoComplete="new-password"
          />
        </label>
        {isWerewolf && (
          <fieldset className="room-sheet__field room-sheet__roles">
            <legend>扩展角色池 <em>(开启则各入池 1 张)</em></legend>
            <label className="room-sheet__check">
              <input type="checkbox" checked={roleGuard} onChange={(e) => setRoleGuard(e.target.checked)} />
              <span><b>守卫</b>守中狼刀 → 平安夜；不能连续守同一人</span>
            </label>
            <label className="room-sheet__check">
              <input type="checkbox" checked={roleHunter} onChange={(e) => setRoleHunter(e.target.checked)} />
              <span><b>猎人</b>出局可开枪带走一名玩家（被毒死除外）</span>
            </label>
            <label className="room-sheet__check">
              <input type="checkbox" checked={roleIdiot} onChange={(e) => setRoleIdiot(e.target.checked)} />
              <span><b>白痴</b>被放逐时翻牌免死，不再参与投票</span>
            </label>
          </fieldset>
        )}
        {isWerewolf && (
          <fieldset className="room-sheet__field room-sheet__roles">
            <legend>对局节奏</legend>
            <label className="room-sheet__radio">
              <input type="radio" name="ww-pace" checked={pace === 'fast'} onChange={() => setPace('fast')} />
              <span>快速（发言/夜晚时间更短）</span>
            </label>
            <label className="room-sheet__radio">
              <input type="radio" name="ww-pace" checked={pace === 'standard'} onChange={() => setPace('standard')} />
              <span>标准（默认）</span>
            </label>
            <label className="room-sheet__radio">
              <input type="radio" name="ww-pace" checked={pace === 'relaxed'} onChange={() => setPace('relaxed')} />
              <span>休闲（发言/夜晚时间更长）</span>
            </label>
          </fieldset>
        )}
        {error && <p id="create-room-error" className="room-sheet__error" role="alert">{error}</p>}
        <button type="submit" className="room-sheet__submit" disabled={!canSubmit}>
          {submitting ? '正在创建…' : '创建并进入房间'}
          <span aria-hidden="true">→</span>
        </button>
      </form>
    </SheetDialog>
  );
}
