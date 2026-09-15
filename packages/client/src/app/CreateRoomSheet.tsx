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
  const { send, setMe, state, reset } = useConnection();
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
  const isConnecting = state.connState === 'connecting';
  const isReconnecting = state.connState === 'reconnecting';

  const isPasswordValid = password.length === 0 || (password.length >= 4 && password.length <= 32);
  const isPasswordInvalid = password.length > 0 && password.length < 4;

  const canSubmit =
    !submitting &&
    connectionReady &&
    nickname.trim().length >= 1 &&
    nickname.trim().length <= 16 &&
    isPasswordValid;

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
      description={`本游戏支持 ${game.minPlayers}–${game.maxPlayers} 人。创建后将 5 位房间码分享给身边的朋友即可加入。`}
      onClose={onClose}
      initialFocusRef={nicknameRef}
      footer={
        <button
          type="submit"
          form="create-room-form"
          className="room-sheet__submit"
          disabled={!canSubmit}
          title={!connectionReady ? '正在与局域网主机建立连接，请稍候…' : isPasswordInvalid ? '房间密码需至少 4 位（留空则公开）' : undefined}
        >
          {submitting
            ? '正在创建…'
            : isConnecting
            ? '正在连接主机…'
            : isReconnecting
            ? '正在重连主机…'
            : '创建并进入房间'}
          <span aria-hidden="true">→</span>
        </button>
      }
    >
      <form id="create-room-form" className="room-sheet__form" onSubmit={handleSubmit}>
        {!connectionReady && (
          <div className="room-sheet__conn-hint" role="status">
            <span className="room-sheet__conn-hint-dot" aria-hidden="true" />
            <span style={{ flex: 1 }}>
              {isConnecting ? '正在建立局域网主机连接，就绪后即可创建…' : '与主机连接中断，正在自动重连中…'}
            </span>
            {isReconnecting && (
              <button
                type="button"
                className="room-sheet__quick-rename-btn"
                style={{ padding: '3px 8px', fontSize: '0.75rem', height: 'auto', minHeight: 24 }}
                onClick={() => reset()}
              >
                重试
              </button>
            )}
          </div>
        )}

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
              placeholder="输入你的昵称"
              maxLength={16}
              autoComplete="nickname"
              aria-invalid={Boolean(error)}
              aria-describedby={error ? 'create-room-error' : undefined}
              required
            />
          </label>
        </div>
        <label className="room-sheet__field" htmlFor="create-password">
          <span>房间密码 <em>(可选，需 4–32 位)</em></span>
          <input
            id="create-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="留空则允许公开加入"
            minLength={4}
            maxLength={32}
            autoComplete="new-password"
            aria-invalid={isPasswordInvalid}
            aria-describedby={isPasswordInvalid ? 'create-password-error' : undefined}
          />
          {isPasswordInvalid && (
            <small id="create-password-error" className="room-sheet__field-error" role="alert">
              房间密码需至少 4 位（留空则允许公开加入）
            </small>
          )}
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
