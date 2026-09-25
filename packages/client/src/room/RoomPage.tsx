/**
 * 房间页（Task 2）：成员列表、房间码展示、聊天区、房主操作栏。
 * 同步未完成（connState !== 'synced'）时禁用会改变状态的按钮，但聊天草稿保留。
 */
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { useConnection } from '../connection/useConnection.ts';
import { resolveShareBase } from '../connection/serverAddress.ts';
import { useToast } from '../shared-ui/ToastContext.tsx';
import { describeError } from '../shared-ui/errors.ts';
import {
  getGameCatalogEntry,
  GAME_CATALOG,
  type RoomMemberView,
  type RoomSnapshotView,
  calculateWerewolfDistribution,
  canEnableWerewolfSpecial,
} from '@ldj/shared';
import { GameSetupPanel } from '../shared-ui/GameSetupPanel.tsx';
import { ConfirmDialog } from '../shared-ui/ConfirmDialog.tsx';
import { ChatMessageList } from '../shared-ui/ChatMessageList.tsx';
import { GameIcon, type GameIconName } from '../shared-ui/GameIcon.tsx';
import { RoomCodeCard } from './RoomCodeCard.tsx';
import { buildModuleConfig, readRoomGameConfig, type SetupConfig } from '../shared-ui/setupState.ts';
import { UserProfileBadge } from '../user/UserProfileBadge.tsx';
import { UserAvatar } from '../user/UserAvatar.tsx';
import { useUserProfile } from '../user/UserProfileContext.tsx';
import { resolveMemberAvatar } from '../user/avatar.ts';
import { WerewolfCampPreview } from '../game/werewolf/ui/WerewolfCampPreview.tsx';

function statusText(status: string): string {
  switch (status) {
    case 'LOBBY': return '等待玩家';
    case 'IN_GAME': return '对局进行中';
    case 'POST_GAME': return '对局已结算';
    case 'CLOSED': return '房间已解散';
    default: return status;
  }
}

function memberStatusBadge(m: RoomMemberView): { label: string; cls: string } {
  if (m.seatRole === 'spectator') {
    return m.connectionStatus === 'CONNECTED'
      ? { label: '大屏展示', cls: 'table-screen' }
      : { label: '已断开', cls: 'expired' };
  }
  switch (m.connectionStatus) {
    case 'CONNECTED':
      return m.ready ? { label: '已就绪', cls: 'online ready' } : { label: '待准备', cls: 'pending' };
    case 'DISCONNECTED_RESERVED': return { label: '保留席位', cls: 'reserved' };
    case 'EXPIRED': return { label: '已过期', cls: 'expired' };
    case 'KICKED': return { label: '已移出', cls: 'kicked' };
    default: return { label: m.connectionStatus, cls: '' };
  }
}


/** 全员就绪时的自动开局倒计时横幅（服务端 5 秒后 auto_start） */
function AutoStartBanner({ active }: { active: boolean }) {
  const [left, setLeft] = useState(5);
  useEffect(() => {
    if (!active) {
      setLeft(5);
      return;
    }
    const id = setInterval(() => setLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [active]);
  if (!active) return null;
  return (
    <div className="autostart-banner" role="status">
      <span className="autostart-banner__dot" aria-hidden="true" />
      <span>全员就绪 · {left} 秒后自动开局…</span>
    </div>
  );
}

export function RoomPage() {
  const { state, me, send, clearMe, setViewingHome } = useConnection();
  const { profile } = useUserProfile();
  const { showToast } = useToast();
  const room: RoomSnapshotView | null = state.room;
  const [chatDraft, setChatDraft] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showGameSwitcher, setShowGameSwitcher] = useState(false);
  // P1-6：共享确认弹窗状态机（替代原生 confirm 与内联 confirm-row）
  const [confirmState, setConfirmState] = useState<{
    kind: 'kick' | 'transfer' | 'abort' | 'close' | 'leave';
    targetPlayerId?: string;
    name?: string;
  } | null>(null);
  const chatBoxRef = useRef<HTMLDivElement | null>(null);
  const chatInputRef = useRef<HTMLInputElement | null>(null);
  const roomCommandInFlightRef = useRef(false);
  const [gameConfig, setGameConfig] = useState<SetupConfig>({});
  const [chatExpanded, setChatExpanded] = useState(false);

  const synced = state.connState === 'synced';
  const isHost = me !== null && room !== null && room.members.some(
    (m) => m.playerId === me.playerId && m.isHost,
  );
  const myPlayerId = me?.playerId ?? null;
  const myMember = room?.members.find((m) => m.playerId === myPlayerId);
  const isScreen = myMember?.seatRole === 'spectator';

  // P1-9：成员昵称索引（聊天渲染共用）
  const memberNames = useMemo(() => {
    const entries = room?.members.map((m) => [m.playerId, m.nickname] as const) ?? [];
    return new Map(entries);
  }, [room]);

  const playerMembers = useMemo(() => {
    return (room?.members ?? [])
      .filter((m) => m.seatRole === 'player' && m.connectionStatus !== 'KICKED')
      .sort((a, b) => (a.seat ?? 999) - (b.seat ?? 999));
  }, [room?.members]);

  const onlinePlayerMembers = useMemo(() => {
    return playerMembers.filter((m) => m.connectionStatus === 'CONNECTED');
  }, [playerMembers]);

  const spectatorMembers = useMemo(() => {
    return (room?.members ?? [])
      .filter((m) => m.seatRole === 'spectator' && m.connectionStatus !== 'KICKED');
  }, [room?.members]);

  const onlinePlayers = onlinePlayerMembers;

  const selectedGame = getGameCatalogEntry(room?.gameId);

  useEffect(() => {
    if (!selectedGame) return;
    setGameConfig(readRoomGameConfig(selectedGame.setup, room?.config));
  }, [selectedGame, room?.config]);

  // 聊天滚动到底
  useEffect(() => {
    const el = chatBoxRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [state.chat.length]);

  async function doRoomCommand(payload: unknown, label: string): Promise<boolean> {
    if (roomCommandInFlightRef.current) return false;
    roomCommandInFlightRef.current = true;
    setBusy(true);
    setActionError(null);
    try {
      await send('room_command', payload);
      return true;
    } catch (err) {
      setActionError(`${label}失败：${describeError(err)}`);
      return false;
    } finally {
      roomCommandInFlightRef.current = false;
      setBusy(false);
    }
  }

  // 房主切换当前房间的游戏
  function handleSelectGame(gameId: string) {
    setShowGameSwitcher(false);
    void doRoomCommand({ command: 'select_game', gameId }, '切换游戏');
  }

  // P1-6：确认弹窗执行（提交中保持弹窗与对象；成功关闭、失败保留）
  async function runConfirmAction() {
    if (!confirmState) return;
    const { kind } = confirmState;
    let ok = false;
    if (kind === 'kick' && confirmState.targetPlayerId) {
      ok = await doRoomCommand({ command: 'kick_player', targetPlayerId: confirmState.targetPlayerId }, '踢人');
    } else if (kind === 'transfer' && confirmState.targetPlayerId) {
      ok = await doRoomCommand({ command: 'transfer_host', targetPlayerId: confirmState.targetPlayerId }, '转让房主');
    } else if (kind === 'abort') {
      ok = await doRoomCommand({ command: 'abort_game' }, '终止对局');
    } else if (kind === 'close') {
      ok = await doRoomCommand({ command: 'close_room' }, '关闭房间');
    } else if (kind === 'leave') {
      await performLeave();
      setConfirmState(null);
      return;
    }
    if (ok) setConfirmState(null);
  }

  async function performLeave() {
    if (busy) return;
    setBusy(true);
    setActionError(null);
    try {
      await send('leave_room', {});
    } catch (err) {
      setActionError(`离开失败：${describeError(err)}`);
      setBusy(false);
      return;
    }
    clearMe();
  }

  async function performDissolve() {
    if (busy) return;
    setBusy(true);
    setActionError(null);
    try {
      await send('room_command', { command: 'close_room' });
    } catch (err) {
      setActionError(`解散失败：${describeError(err)}`);
      setBusy(false);
      return;
    }
    clearMe();
  }

  function handleStartGame() {
    if (!selectedGame) return;
    void doRoomCommand(
      {
        command: 'start_game',
        gameConfig: buildModuleConfig(selectedGame.setup, gameConfig),
      },
      '开始游戏',
    );
  }

  function handleGameConfigChange(next: SetupConfig) {
    if (!selectedGame) return;
    setGameConfig(next);
    void doRoomCommand(
      {
        command: 'update_config',
        config: {
          gameConfig: buildModuleConfig(selectedGame.setup, next),
        },
      },
      '保存规则',
    );
  }

  function handleToggleReady(ready: boolean) {
    void doRoomCommand({ command: 'ready', ready: !ready }, ready ? '取消准备' : '准备');
  }

  function handleSwitchSeatRole(playerId: string, role: 'player' | 'spectator') {
    void doRoomCommand(
      { command: 'switch_seat_role', role, targetPlayerId: playerId },
      role === 'spectator' ? '设为公共大屏' : '加入游戏席位',
    );
  }

  function handleKick(playerId: string, name: string) {
    setConfirmState({ kind: 'kick', targetPlayerId: playerId, name });
  }

  function handleTransfer(playerId: string, name: string) {
    setConfirmState({ kind: 'transfer', targetPlayerId: playerId, name });
  }

  function handleAddBot(kind: 'rule' | 'llm') {
    void doRoomCommand({ command: 'add_bot', kind }, kind === 'llm' ? '添加 AI 玩家' : '添加机器人');
  }

  function handleRemoveBot(targetPlayerId?: string) {
    void doRoomCommand(
      targetPlayerId === undefined
        ? { command: 'remove_bot' }
        : { command: 'remove_bot', targetPlayerId },
      '移除机器人',
    );
  }


  function handleReturnToLobby() {
    void doRoomCommand({ command: 'return_to_lobby' }, '返回大厅');
  }

  function handleLeaveRoom() {
    if (busy) return;
    if (isHost) {
      setConfirmState({ kind: 'leave' });
    } else {
      void performLeave();
    }
  }

  async function handleSendChat(e: FormEvent) {
    e.preventDefault();
    const text = chatDraft.trim();
    if (!text || !synced || busy) return;
    setBusy(true);
    const draftBackup = chatDraft;
    setChatDraft('');
    try {
      await send('chat_send', { text });
      chatInputRef.current?.focus();
    } catch (err) {
      setChatDraft(draftBackup);
      setActionError(`发送失败：${describeError(err)}`);
      showToast(`发送失败：${describeError(err)}`, 'error');
    } finally {
      setBusy(false);
    }
  }

  if (room === null || selectedGame === undefined) {
    return (
      <main className="room-page game-home-page">
        <div className="game-home-page__content room-layout">
          <div className="loading room-loading">
            正在加载房间信息…
          </div>
        </div>
      </main>
    );
  }

  const roomGame = selectedGame;
  const isWerewolfModerator = roomGame.id === 'werewolf' && gameConfig.rulesetId === 'werewolf_moderator_v1';
  const minimumPlayersToStart = isWerewolfModerator ? 6 : roomGame.minPlayers;
  const maximumPlayers = isWerewolfModerator ? 13 : (roomGame.id === 'werewolf' ? 12 : roomGame.maxPlayers);
  const effectiveOnlinePlayersForReady = isWerewolfModerator
    ? onlinePlayers.filter((p) => !p.isHost)
    : onlinePlayers;
  const notReadyCount = effectiveOnlinePlayersForReady.filter((p) => !p.ready).length;
  // 自己是否还没准备：仅当前作为参局玩家（player）且未准备时才阻断开局；真人法官无需准备
  const meNotReady = isWerewolfModerator && isHost
    ? false
    : myMember?.seatRole === 'player' && myMember.ready === false;

  const cardPlayerCount = isWerewolfModerator ? Math.max(0, onlinePlayers.length - 1) : onlinePlayers.length;
  const werewolfDist = roomGame.id === 'werewolf'
    ? calculateWerewolfDistribution({
        playerCount: cardPlayerCount,
        wolfDelta: typeof gameConfig.wolfDelta === 'number' ? gameConfig.wolfDelta : 0,
        guard: Boolean(gameConfig.guard),
        hunter: Boolean(gameConfig.hunter),
        idiot: Boolean(gameConfig.idiot),
      })
    : null;
  const isWerewolfInvalid = werewolfDist !== null && !werewolfDist.isValid;

  const canStart =
    (room.status === 'LOBBY' || room.status === 'POST_GAME') &&
    onlinePlayers.length >= minimumPlayersToStart &&
    onlinePlayers.length <= maximumPlayers &&
    notReadyCount === 0 &&
    !isWerewolfInvalid;

  const startDisabledReason = !canStart
    ? isWerewolfInvalid
      ? (werewolfDist?.error ?? '狼人杀阵营配置不平衡（需平民保底 2 人），请调整配置后再开局')
      : meNotReady
        ? '你还未就绪：请先点击「点击准备」'
        : onlinePlayers.length < minimumPlayersToStart
          ? isWerewolfModerator
            ? `需要 1 名主持人 + 5–12 名抽卡玩家（当前共 ${onlinePlayers.length} 人）`
            : `需要 ${minimumPlayersToStart}–${maximumPlayers} 名在线玩家（当前 ${onlinePlayers.length}）`
          : notReadyCount > 0
            ? `还有 ${notReadyCount} 人未准备`
            : `需要 ${minimumPlayersToStart}–${maximumPlayers} 名在线玩家`
    : '';

  const isOptionChoiceDisabled = (key: string, choiceValue: unknown): { disabled: boolean; reason?: string } => {
    if (roomGame.id !== 'werewolf') return { disabled: false };
    if (choiceValue === true && (key === 'guard' || key === 'hunter' || key === 'idiot')) {
      const check = canEnableWerewolfSpecial({
        playerCount: cardPlayerCount,
        wolfDelta: typeof gameConfig.wolfDelta === 'number' ? gameConfig.wolfDelta : 0,
        guard: Boolean(gameConfig.guard),
        hunter: Boolean(gameConfig.hunter),
        idiot: Boolean(gameConfig.idiot),
      }, key);
      return { disabled: !check.allowed, reason: check.reason };
    }
    return { disabled: false };
  };

  const botCount = room.members.filter((m) => m.botKind !== null).length;
  // 席位满了就不能再加：服务端也会拒，这里提前禁用避免无效往返
  const seatsFull = onlinePlayers.length >= maximumPlayers;
  const autoStartActive =
    !isWerewolfModerator &&
    (room.status === 'LOBBY' || room.status === 'POST_GAME') &&
    onlinePlayers.length >= minimumPlayersToStart &&
    onlinePlayers.length <= maximumPlayers &&
    onlinePlayers.length > 0 &&
    notReadyCount === 0 &&
    !isWerewolfInvalid &&
    room.members.every((m) => m.connectionStatus === 'CONNECTED');

  const renderMemberCard = (m: RoomMemberView) => {
    const badge = memberStatusBadge(m);
    const isMe = m.playerId === myPlayerId;
    const hasActions =
      isHost &&
      (room.status === 'LOBBY' || room.status === 'POST_GAME') &&
      ((!isMe && m.botKind === null) || m.botKind !== null);

    return (
      <li key={m.playerId} className={'member ' + badge.cls + (hasActions ? ' has-actions' : '')}>
        <span className="member-seat">
          {m.seatRole === 'player' ? '#' + (m.seat !== undefined && m.seat !== null ? m.seat + 1 : '?') : '📺'}
        </span>
        <UserAvatar
          avatar={resolveMemberAvatar(m, { isMe, myAvatar: profile.avatar })}
          nickname={m.nickname}
          size={32}
          style={{ marginRight: '6px' }}
        />
        <span className="member-name">
          {m.nickname}
          {m.isHost && (
            <span className="host-icon" title="房主">
              <GameIcon name="crown" size={15} style={{ marginLeft: '4px' }} />
            </span>
          )}
          {isMe && <span className="me-tag">（我）</span>}
          {m.botKind === 'llm' && <span className="bot-tag bot-tag--llm" title="由大模型决策">AI</span>}
          {m.botKind === 'rule' && <span className="bot-tag" title="随机合法出牌">机器人</span>}
        </span>
        <span className={'member-status ' + badge.cls}>{badge.label}</span>
        {hasActions && (
          <div className="member-actions member-manage-group">
            {!isMe && m.botKind === null && (
              <>
                <button
                  type="button"
                  className="mini-btn mini-btn--seat"
                  aria-label={m.seatRole === 'spectator' ? '加入玩家席' : '设为公共大屏'}
                  title={m.seatRole === 'spectator' ? '将该成员加入玩家席位' : '将该设备设为公共大屏'}
                  onClick={() => handleSwitchSeatRole(m.playerId, m.seatRole === 'spectator' ? 'player' : 'spectator')}
                  disabled={busy || !synced}
                >
                  {m.seatRole === 'spectator' ? '入席' : '设为公屏'}
                </button>
                {m.connectionStatus === 'CONNECTED' && (
                  <>
                    <button
                      type="button"
                      className="mini-btn mini-btn--transfer"
                      aria-label={'转让房主给 ' + m.nickname}
                      title="将房主移交给该玩家"
                      onClick={() => handleTransfer(m.playerId, m.nickname)}
                      disabled={busy || !synced || room.status === 'CLOSED'}
                    >
                      转让
                    </button>
                    <button
                      type="button"
                      className="mini-btn mini-btn--danger"
                      aria-label={'踢出玩家 ' + m.nickname}
                      title="将该玩家移出房间"
                      onClick={() => handleKick(m.playerId, m.nickname)}
                      disabled={busy || !synced || room.status === 'CLOSED'}
                    >
                      踢出
                    </button>
                  </>
                )}
              </>
            )}
            {m.botKind !== null && (
              <button
                type="button"
                className="mini-btn mini-btn--danger"
                aria-label={'移除 ' + m.nickname}
                title="移除该机器人"
                onClick={() => handleRemoveBot(m.playerId)}
                disabled={busy || !synced}
              >
                移除
              </button>
            )}
          </div>
        )}
      </li>
    );
  };

  return (
    <main className="room-page game-home-page" data-game-id={roomGame.id}>
      <div className="game-home-page__content room-layout">
        <header className="home-header room-header">
          <div className="home-brand room-header__brand">
            <img
              src={`/icons/${roomGame.id}.png`}
              alt=""
              style={{ width: '28px', height: '28px', objectFit: 'contain', borderRadius: '6px' }}
              onError={(e) => { (e.currentTarget as HTMLElement).style.display = 'none'; }}
            />
            <span className="room-header__title">{roomGame.displayName}</span>
            <span className="room-status-badge">
              <span className="room-status-badge__dot" />
              {statusText(room.status)}
            </span>
            {isScreen && (
              <span className="room-status-badge room-status-badge--screen" title="当前设备为公共大屏（免准备，纯展示）">
                📺 公共大屏
              </span>
            )}
          </div>
          <div className="home-header__actions room-header__actions">
            {isHost && room.status !== 'IN_GAME' && (
              <button
                type="button"
                className="room-action-btn room-action-btn--switch"
                onClick={() => setShowGameSwitcher(true)}
                title="更换房间游玩的游戏"
              >
                切换游戏
              </button>
            )}
            <button
              type="button"
              className="room-action-btn room-action-btn--leave"
              onClick={() => setViewingHome(true)}
              title="暂离返回主页，可在主页随时返回或自由体验其他游戏"
            >
              暂离大厅
            </button>
            <UserProfileBadge />
          </div>
        </header>

        <section className="room-hero" aria-labelledby="room-title">
          <div className="room-hero__panel">
            {roomGame.id === 'werewolf' && <p className="room-theme-eyebrow">THE NIGHT THEATRE · 暗夜剧场</p>}
            {roomGame.id === 'durian' && <p className="room-theme-eyebrow">FRUIT PARTY · 玩具水果派对</p>}
            <h1 id="room-title" className="room-hero__title">
              {roomGame.id === 'werewolf' ? <>月亮升起前，<span>请入座</span></> : roomGame.id === 'durian' ? <>水果已就位，<span>等你按铃</span></> : <>等待好友<span>入座</span></>}
            </h1>
            <p className="room-hero__description">
              本游戏支持 {minimumPlayersToStart}–{maximumPlayers} 人。将房间码分享给身边的朋友，全员准备后即可开始对局。
            </p>
          </div>

          <RoomCodeCard
            gameName={roomGame.displayName}
            gameId={roomGame.id}
            roomCode={room.roomCode}
            inviteUrl={`${resolveShareBase()}/join/${room.roomCode}`}
            online={onlinePlayers.length}
            max={maximumPlayers}
          />
        </section>

        {actionError && <div className="error-banner room-sheet__error" role="alert">{actionError}</div>}

        {roomGame.id === 'werewolf' && <div className="room-theme-guide"><strong>01 选择本局玩法</strong><p>平台主持由系统推进昼夜；真人主持由房主担任法官。下方阵营分布随人数和配置实时更新。</p></div>}
        {roomGame.id === 'durian' && <div className="room-theme-guide"><strong>01 选择派对模式</strong><p>标准模式：系统判定质疑并计分。纯模拟模式：用电子桌面配合现场游玩，保留手动操作。玩家设备显示个人操作；公共大屏只读展示桌面，不占玩家席位。</p></div>}
        <GameSetupPanel
          dialogClassName={roomGame.id === 'werewolf' ? 'ww-private-dialog' : roomGame.id === 'durian' ? 'durian-dialog' : undefined}
          setup={roomGame.setup}
          value={gameConfig}
          disabled={!isHost || busy || !synced || room.status !== 'LOBBY'}
          isOptionChoiceDisabled={isOptionChoiceDisabled}
          onChange={handleGameConfigChange}
        />

        {roomGame.id === 'werewolf' && (
          <WerewolfCampPreview
            playerCount={cardPlayerCount}
            gameConfig={gameConfig}
            isHost={isHost}
            disabled={!isHost || busy || !synced || room.status !== 'LOBBY'}
            onChangeConfig={handleGameConfigChange}
          />
        )}

        {['werewolf', 'durian'].includes(roomGame.id) && <div className="room-theme-guide"><strong>02 入座与准备</strong><p>配置仅由房主调整。确认玩法后准备，未满足人数或配置条件时无法开局。</p></div>}
        <div className="room-content-grid">
          <div className="room-members-column">
            {/* 区块 1：参局玩家 */}
            <section className="room-panel room-players-panel members-section" aria-labelledby="players-heading">
              <div className="room-panel__head">
                <div>
                  <h2 id="players-heading" className="room-panel__title">
                    🎮 参局玩家（{onlinePlayerMembers.length}/{maximumPlayers}）
                  </h2>
                </div>
                {playerMembers.some((m) => m.connectionStatus !== 'CONNECTED' && m.connectionStatus !== 'KICKED') && (
                  <span className="members-hint room-panel__hint">含断线保留</span>
                )}
              </div>
              <ul className="members-list room-members-list" aria-label="参局玩家列表">
                {playerMembers.map((m) => renderMemberCard(m))}
              </ul>
            </section>

            {/* 区块 2：公共大屏 / 观战 */}
            <section className="room-panel room-spectators-panel members-section" aria-labelledby="spectators-heading">
              <div className="room-panel__head">
                <div>
                  <h2 id="spectators-heading" className="room-panel__title">
                    📺 公共大屏 / 观战（{spectatorMembers.length}）
                  </h2>
                  <span className="spectators-subtitle">不占用玩家席位 · 纯净展示</span>
                </div>
              </div>
              {spectatorMembers.length === 0 ? (
                <div className="spectator-empty-card">
                  <span className="spectator-empty-card__icon" aria-hidden="true">📺</span>
                  <div className="spectator-empty-card__text">
                    <strong>暂无公共大屏设备</strong>
                    <p>可将备用手机、平板或电视置于桌面中央，设为公屏纯净展示计票板与公共天象。</p>
                  </div>
                </div>
              ) : (
                <ul className="members-list room-members-list" aria-label="公共大屏与观战列表">
                  {spectatorMembers.map((m) => renderMemberCard(m))}
                </ul>
              )}
            </section>
          </div>

          <section className="room-panel room-chat-panel chat-section" aria-labelledby="chat-heading">
            <div className="room-panel__head">
              <div>
                <h2 id="chat-heading" className="room-panel__title">聊天</h2>
              </div>
              <span className="room-panel__glyph" aria-hidden="true">✦</span>
            </div>
            <div className="chat-box room-chat-box" ref={chatBoxRef}>
              {state.chat.length === 0 ? <div className="chat-empty">还没有消息</div> : (
                <ChatMessageList messages={state.chat} myPlayerId={myPlayerId} memberNames={memberNames} />
              )}
            </div>
            {isScreen && !chatExpanded ? (
              <button
                type="button"
                className="chat-screen-fold-bar"
                onClick={() => setChatExpanded(true)}
                title="展开聊天输入框"
              >
                <span>📺 公屏模式已收起输入栏（点击展开）</span>
              </button>
            ) : (
              <form className={`chat-input-row ${isScreen ? 'has-fold-btn' : ''}`} onSubmit={handleSendChat}>
                <input
                  ref={chatInputRef}
                  type="text"
                  value={chatDraft}
                  onChange={(e) => setChatDraft(e.target.value.slice(0, 300))}
                  placeholder={synced ? '输入消息…' : '同步中…暂不能发送'}
                  maxLength={300}
                  disabled={!synced}
                  aria-label="聊天输入"
                />
                <button type="submit" className="game-card__action room-inline-btn" aria-label="发送消息" disabled={!synced || !chatDraft.trim() || busy}>发送</button>
                {isScreen && (
                  <button
                    type="button"
                    className="chat-fold-toggle-btn"
                    onClick={() => setChatExpanded(false)}
                    title="收起聊天输入栏"
                  >
                    收起
                  </button>
                )}
              </form>
            )}
          </section>
        </div>

        <section className="home-join-callout room-share-note room-console" aria-labelledby="room-actions-title">
          <div className="room-console__head">
            {isScreen ? (
              <div className="room-console__screen-banner" role="status">
                <div className="room-console__screen-title">
                  <span className="screen-icon" aria-hidden="true">📺</span>
                  <h2 id="room-actions-title" className="room-console__title">当前设备为公共大屏</h2>
                  <span className="screen-tag">免准备 · 纯展示</span>
                </div>
                <p className="room-console__screen-desc">
                  本屏幕将展示全局天象、中央果摊与公共计票板，不占用玩家对局席位。
                </p>
              </div>
            ) : (
              <>
                <span className="home-join-callout__icon" aria-hidden="true">♟</span>
                <div>
                  <h2 id="room-actions-title" className="room-console__title">{(room.status === 'LOBBY' || room.status === 'POST_GAME') ? '对局准备中' : '当前状态：' + statusText(room.status)}</h2>
                </div>
                {(room.status === 'LOBBY' || room.status === 'POST_GAME') && (
                  <div className="room-console__ready" role="status" aria-label="就绪进度">
                    <span className="room-console__ready-label">已就绪 {onlinePlayers.filter((p) => p.ready).length} / {onlinePlayers.length}</span>
                    <div className="room-console__ready-track">
                      <span style={{ width: `${onlinePlayers.length > 0 ? (onlinePlayers.filter((p) => p.ready).length / onlinePlayers.length) * 100 : 0}%` }} />
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
          <div className="action-bar room-console__actions">
            {isHost && (room.status === 'LOBBY' || room.status === 'POST_GAME') && (
              <button type="button" className="room-console__btn room-console__btn--primary" onClick={handleStartGame} disabled={busy || !synced || !canStart}>
                <GameIcon name="cards_deck" size={18} />
                <span>开始游戏</span>
              </button>
            )}
            {myMember && myMember.seatRole === 'player' && myMember.botKind === null && (room.status === 'LOBBY' || room.status === 'POST_GAME') && (
              <button
                type="button"
                className={`room-console__btn room-console__btn--ready ${myMember.ready ? 'is-ready' : 'is-not-ready'}`}
                onClick={() => handleToggleReady(myMember.ready)}
                disabled={busy || !synced}
                title={myMember.ready ? '已准备，点击取消准备' : '点击完成准备'}
              >
                <GameIcon name={myMember.ready ? 'star' : 'hourglass'} size={18} />
                <span>{myMember.ready ? '已准备 (取消)' : '点击准备'}</span>
              </button>
            )}
            {myMember && myMember.seatRole === 'spectator' && (room.status === 'LOBBY' || room.status === 'POST_GAME') && (
              <button
                type="button"
                className="room-console__btn room-console__btn--switch-back"
                onClick={() => handleSwitchSeatRole(myMember.playerId, 'player')}
                disabled={busy || !synced || seatsFull}
                title={seatsFull ? `玩家席位已满（上限 ${maximumPlayers} 人）` : '当前设备为公共大屏。点击加入玩家席位亲自参局'}
              >
                <GameIcon name="cards_deck" size={18} />
                <span>{seatsFull ? '玩家席已满' : '加入玩家席'}</span>
              </button>
            )}
            {myMember && myMember.seatRole === 'player' && myMember.botKind === null && (room.status === 'LOBBY' || room.status === 'POST_GAME') && (
              <button
                type="button"
                className="room-console__btn room-console__btn--secondary"
                onClick={() => handleSwitchSeatRole(myMember.playerId, 'spectator')}
                disabled={busy || !synced}
                title="将此设备设为公共大屏（不占用人数，纯净展示全场）"
              >
                <span style={{ fontSize: '1.05rem', lineHeight: 1 }} aria-hidden="true">📺</span>
                <span>设为公屏</span>
              </button>
            )}
            {isHost && (room.status === 'LOBBY' || room.status === 'POST_GAME') && roomGame.botSupport !== 'none' && (
              <button type="button" className="room-console__btn room-console__btn--secondary" onClick={() => handleAddBot('rule')} disabled={busy || !synced || seatsFull} title={seatsFull ? '席位已满' : '按规则执行合法动作'}>
                <GameIcon name="robot" size={18} />
                <span>添加机器人</span>
              </button>
            )}
            {isHost && (room.status === 'LOBBY' || room.status === 'POST_GAME') && roomGame.botSupport === 'rule_and_llm' && state.llmAvailable && (
              <button type="button" className="room-console__btn room-console__btn--secondary" onClick={() => handleAddBot('llm')} disabled={busy || !synced || seatsFull} title={seatsFull ? '席位已满' : '由大语言模型决策，异常时自动切为规则机器人'}>
                <GameIcon name="star" size={18} />
                <span>添加 AI 玩家</span>
              </button>
            )}
            {isHost && (room.status === 'LOBBY' || room.status === 'POST_GAME') && roomGame.botSupport !== 'none' && botCount > 0 && (
              <button type="button" className="room-console__btn room-console__btn--secondary" onClick={() => handleRemoveBot()} disabled={busy || !synced} title="移除最后加入的机器人">
                <GameIcon name="uno_skip" size={18} />
                <span>移除机器人 ({botCount})</span>
              </button>
            )}
            {room.status === 'POST_GAME' && isHost && (
              <button type="button" className="room-console__btn room-console__btn--secondary" onClick={handleReturnToLobby} disabled={busy || !synced}>
                <GameIcon name="horn" size={18} />
                <span>返回大厅</span>
              </button>
            )}
            <button type="button" className="room-console__btn room-console__btn--leave" onClick={handleLeaveRoom} disabled={busy}>
              <GameIcon name="door_exit" size={18} />
              <span>离开房间</span>
            </button>
            {isHost && room.status === 'IN_GAME' && (
              <button type="button" className="room-console__btn room-console__btn--danger" onClick={() => setConfirmState({ kind: 'abort' })} disabled={busy || !synced}>
                <GameIcon name="bomb" size={18} />
                <span>终止对局</span>
              </button>
            )}
            {isHost && !confirmState && room.status !== 'CLOSED' && (
              <button type="button" className="room-console__btn room-console__btn--danger" onClick={() => setConfirmState({ kind: 'close' })} disabled={busy || !synced}>
                <GameIcon name="door_exit" size={18} />
                <span>解散房间</span>
              </button>
            )}
          </div>
          {/* 2-5：开始游戏禁用原因常驻可见（替代仅 title 提示与重复横幅） */}
          {isHost && (room.status === 'LOBBY' || room.status === 'POST_GAME') && !canStart && (
            <p className="room-console__reason" role="status">{startDisabledReason}</p>
          )}
        </section>

        {/* 连接断线/服务端恢复状态由 App 顶部 TabletopStatusBanner 统一表达（1-1 去重） */}
        {/* 2-7 横幅互斥：错误横幅存在时不叠加自动开局倒计时 */}
        <AutoStartBanner active={autoStartActive && synced && !actionError} />
      </div>

      {/* 游戏切换弹窗 */}
      {showGameSwitcher && createPortal(
        <div className="game-switcher-backdrop" onClick={() => setShowGameSwitcher(false)}>
          <div className="game-switcher-modal" onClick={(e) => e.stopPropagation()}>
            <header className="game-switcher-header">
              <h3>切换房间玩法</h3>
              <button type="button" className="profile-modal__close-btn" onClick={() => setShowGameSwitcher(false)}>×</button>
            </header>
            <div className="game-switcher-grid">
              {GAME_CATALOG.filter((g) => g.availability === 'playable').map((g) => {
                const isCurrent = g.id === roomGame.id;
                return (
                  <button
                    key={g.id}
                    type="button"
                    className={`game-switcher-card ${isCurrent ? 'is-current' : ''}`}
                    onClick={() => handleSelectGame(g.id)}
                    disabled={isCurrent}
                  >
                    <div className="game-switcher-card__icon-box">
                      <GameIcon name={g.id as GameIconName} size={28} />
                    </div>
                    <div className="game-switcher-card__info">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <strong className="game-switcher-card__name">{g.displayName}</strong>
                        <span className="game-switcher-card__players">{g.minPlayers}–{g.maxPlayers}人</span>
                      </div>
                      <span className="game-switcher-card__desc">{g.summary}</span>
                    </div>
                    {isCurrent ? <span className="game-switcher-card__badge">当前玩法</span> : <span className="game-switcher-card__btn">选用</span>}
                  </button>
                );
              })}
            </div>
          </div>
        </div>,
        document.body,
      )}

      {/* P1-6：共享确认弹窗（踢出/转让/终止/解散） */}
      {confirmState && (
        <ConfirmDialog
          title={
            confirmState.kind === 'kick' ? '移出玩家'
              : confirmState.kind === 'transfer' ? '转让房主'
                : confirmState.kind === 'abort' ? '终止本局'
                  : confirmState.kind === 'leave' ? '退出选项'
                  : '解散房间'
          }
          message={
            confirmState.kind === 'kick' ? ('确定要移出 ' + (confirmState.name ?? '该玩家') + ' 吗？移出后其席位将释放。')
              : confirmState.kind === 'transfer' ? ('确定要把房主转让给 ' + (confirmState.name ?? '该玩家') + ' 吗？')
                : confirmState.kind === 'abort' ? '确定要终止当前对局吗？本局进度将作废。'
                  : confirmState.kind === 'leave' ? '你是房主。选择「仅退出」将自动转让房主给其他玩家；选择「解散房间」将关闭房间并踢出所有人。'
                  : '确定要解散房间吗？所有成员将被移出。'
          }
          confirmLabel={
            confirmState.kind === 'kick' ? '移出'
              : confirmState.kind === 'transfer' ? '转让'
                : confirmState.kind === 'abort' ? '终止对局'
                  : confirmState.kind === 'leave' ? '仅退出'
                  : '确认解散'
          }
          secondaryLabel={
            confirmState.kind === 'leave' ? '解散房间' : undefined
          }
          onSecondary={
            confirmState.kind === 'leave' ? () => {
              void performDissolve();
              setConfirmState(null);
            } : undefined
          }
          busy={busy}
          destructive={confirmState.kind === 'abort' || confirmState.kind === 'close'}
          onConfirm={() => void runConfirmAction()}
          onCancel={() => setConfirmState(null)}
        />
      )}
    </main>
  );
}
