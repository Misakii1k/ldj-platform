import { useRef, useState, useEffect, type FormEvent } from 'react';
import type { GameCatalogEntry } from '@ldj/shared';
import { useConnection } from '../connection/useConnection.ts';
import { describeError } from '../shared-ui/errors.ts';
import { useToast } from '../shared-ui/ToastContext.tsx';
import { SheetDialog } from './SheetDialog.tsx';
import { GameSetupPanel } from '../shared-ui/GameSetupPanel.tsx';
import { buildModuleConfig, buildSetupConfig, type SetupConfig } from '../shared-ui/setupState.ts';
import { makeMeFromRoomAck, parseRoomAck } from './roomAck.ts';

import { useUserProfile } from '../user/UserProfileContext.tsx';
import { UserAvatar } from '../user/UserAvatar.tsx';

interface CreateRoomSheetProps {
  game: GameCatalogEntry;
  onClose: () => void;
}

export function CreateRoomSheet({ game, onClose }: CreateRoomSheetProps) {
  const { send, setMe, state } = useConnection();
  const { profile, setNickname: saveUserNickname, openProfileModal } = useUserProfile();
  const { showToast } = useToast();
  const nicknameRef = useRef<HTMLInputElement | null>(null);
  const [nickname, setNickname] = useState(profile.nickname);

  useEffect(() => {
    setNickname(profile.nickname);
  }, [profile.nickname]);

  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 开局配置统一由目录 setup 规格驱动（1-3：狼人杀扩展角色等选项收敛到共享面板，不再手写特判）
  const [setupConfig, setSetupConfig] = useState<SetupConfig>(() => buildSetupConfig(game.setup));
  const hasConfig = game.setup.options.length > 0 || game.setup.rulesets.length > 1;

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
    saveUserNickname(normalizedNickname);
    setSubmitting(true);
    setError(null);
    try {
      const ack = await send('create_room', {
        nickname: normalizedNickname,
        gameId: game.id,
        ...(password.length > 0 ? { password } : {}),
        gameConfig: buildModuleConfig(game.setup, setupConfig),
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
      footer={
        <button type="submit" form="create-room-form" className="room-sheet__submit" disabled={!canSubmit}>
          {submitting ? '正在创建…' : '创建并进入房间'}
          <span aria-hidden="true">→</span>
        </button>
      }
    >
      <form id="create-room-form" className="room-sheet__form" onSubmit={handleSubmit}>
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
          <label className="room-sheet__field" htmlFor="create-nickname" style={{ flex: 1 }}>
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
        </div>
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
        {hasConfig && (
          <GameSetupPanel setup={game.setup} value={setupConfig} variant="compact" onChange={setSetupConfig} />
        )}
        {game.botSupport === 'none' && (
          <p className="room-sheet__note">本玩法暂不支持机器人，需要好友全部真人入座。</p>
        )}
        {error && <p id="create-room-error" className="room-sheet__error" role="alert">{error}</p>}
      </form>
    </SheetDialog>
  );
}
