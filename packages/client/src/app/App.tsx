import type { ClientMessage } from '@lan-party/shared';
import { useEffect, useMemo, useReducer, useRef, useState, type FormEvent } from 'react';

import { useGatewayConnection } from '../connection/use-gateway-connection';
import { parseAckCredential } from '../lobby/ack-credential';
import {
  getBrowserStorage,
  getOrCreateIdentity,
  listRoomCredentials,
  removeRoomCredential,
  saveRoomCredential,
  type RoomCredential,
} from '../lobby/credentials';
import {
  buildCreateRoomEnvelope,
  buildJoinRoomEnvelope,
  buildResyncEnvelope,
  buildResumeRoomEnvelope,
  validateLobbyForm,
  type LobbyMode,
} from '../lobby/envelopes';
import {
  getSnapshotDisposition,
  initialLobbyState,
  lobbyReducer,
  type PendingRequest,
} from '../lobby/lobby-state';
import { ConnectionBadge } from '../shared-ui/ConnectionBadge';

export function App() {
  const gateway = useGatewayConnection();
  const [state, dispatch] = useReducer(lobbyReducer, initialLobbyState);
  const storage = useMemo(() => getBrowserStorage(window), []);
  const identityId = useMemo(() => getOrCreateIdentity(storage), [storage]);
  const [savedRooms, setSavedRooms] = useState(() => listRoomCredentials(storage));
  const pendingRef = useRef<PendingRequest | undefined>(undefined);
  const acceptedCredentialRef = useRef<ReturnType<typeof parseAckCredential>>(undefined);
  const resyncRequestRef = useRef<string | undefined>(undefined);
  const handledMessage = useRef(0);
  const formRef = useRef<HTMLFormElement>(null);
  const canSend = gateway.welcomed && gateway.state === 'connected' && state.pending === undefined;

  useEffect(() => {
    if (gateway.state === 'recovering' || gateway.state === 'replaced') {
      pendingRef.current = undefined;
      resyncRequestRef.current = undefined;
      dispatch({ type: 'connection_lost' });
    }
  }, [gateway.state]);

  useEffect(() => {
    const received = gateway.latestMessage;
    if (received === undefined || received.sequence <= handledMessage.current) return;
    handledMessage.current = received.sequence;
    const message = received.message;
    const pending = pendingRef.current;

    if (message.type === 'welcome' && state.room !== undefined && pending === undefined) {
      const credential = listRoomCredentials(storage).find(
        (item) => item.roomCode === state.room?.roomCode,
      );
      if (credential !== undefined) {
        const resumeMessage = buildResumeRoomEnvelope(credential);
        const resumeRequest: PendingRequest = {
          requestId: resumeMessage.requestId,
          kind: 'resume',
          roomCode: credential.roomCode,
        };
        pendingRef.current = resumeRequest;
        dispatch({ type: 'request_started', request: resumeRequest });
        if (!gateway.send(resumeMessage)) {
          pendingRef.current = undefined;
          dispatch({ type: 'request_send_failed' });
        }
      }
    }

    if (message.type === 'ack' && pending?.requestId === message.requestId) {
      const credential = parseAckCredential(message);
      if (credential !== undefined) {
        acceptedCredentialRef.current = credential;
        if (pending.roomCode !== undefined) {
          saveRoomCredential(storage, {
            roomCode: pending.roomCode,
            ...credential,
            lastSeq: message.roomSeq,
            savedAt: Date.now(),
          });
          setSavedRooms(listRoomCredentials(storage));
        }
      }
    }

    if (
      message.type === 'error' &&
      pending?.requestId === message.requestId &&
      pending.kind === 'resume' &&
      (message.payload.code === 'INVALID_RESUME_TOKEN' || message.payload.code === 'RESERVATION_EXPIRED')
    ) {
      if (pending.roomCode !== undefined) removeRoomCredential(storage, pending.roomCode);
      setSavedRooms(listRoomCredentials(storage));
    }

    let requestResync = message.type === 'resync_required';
    if (message.type === 'room_snapshot') {
      const disposition = getSnapshotDisposition(state, message.roomSeq);
      requestResync = disposition === 'gap';
      if (disposition === 'accept') {
        const acceptedCredential = acceptedCredentialRef.current;
        const credential = listRoomCredentials(storage).find(
          (item) => item.roomCode === message.payload.roomCode,
        );
        if (acceptedCredential !== undefined) {
          saveRoomCredential(storage, {
            roomCode: message.payload.roomCode,
            ...acceptedCredential,
            lastSeq: message.roomSeq,
            savedAt: Date.now(),
          });
          acceptedCredentialRef.current = undefined;
          setSavedRooms(listRoomCredentials(storage));
        } else if (credential !== undefined) {
          saveRoomCredential(storage, {
            ...credential,
            lastSeq: message.roomSeq,
            savedAt: Date.now(),
          });
          setSavedRooms(listRoomCredentials(storage));
        }
        pendingRef.current = undefined;
        resyncRequestRef.current = undefined;
      }
    }
    if (message.type === 'error' && pending?.requestId === message.requestId) {
      pendingRef.current = undefined;
    }
    dispatch({ type: 'server_message', message });
    if (message.type === 'error' && message.requestId === resyncRequestRef.current) {
      resyncRequestRef.current = undefined;
      dispatch({ type: 'resync_send_failed' });
    }
    if (requestResync && resyncRequestRef.current === undefined) {
      const resyncMessage = buildResyncEnvelope(state.roomSeq);
      if (gateway.send(resyncMessage)) {
        resyncRequestRef.current = resyncMessage.requestId;
        dispatch({ type: 'resync_started' });
      } else {
        dispatch({ type: 'resync_send_failed' });
      }
    }
  }, [gateway.latestMessage, gateway.send, state, storage]);

  useEffect(() => {
    if (Object.keys(state.fieldErrors).length === 0) return;
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [state.fieldErrors]);

  const changeMode = (mode: LobbyMode): void => {
    if (state.pending !== undefined) return;
    dispatch({ type: 'mode_changed', mode });
  };

  const sendRequest = (request: PendingRequest, message: ClientMessage): void => {
    pendingRef.current = request;
    dispatch({ type: 'request_started', request });
    if (!gateway.send(message)) {
      pendingRef.current = undefined;
      dispatch({ type: 'request_send_failed' });
    }
  };

  const submitLobby = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const errors = validateLobbyForm(state.mode, state.form);
    if (Object.keys(errors).length > 0) {
      dispatch({ type: 'validation_failed', errors });
      return;
    }
    if (!canSend) {
      dispatch({ type: 'request_send_failed' });
      return;
    }

    const message =
      state.mode === 'create'
        ? buildCreateRoomEnvelope(state.form, identityId)
        : buildJoinRoomEnvelope(state.form, identityId);
    sendRequest(
      {
        requestId: message.requestId,
        kind: state.mode,
        ...(state.mode === 'join' ? { roomCode: state.form.roomCode.trim().toUpperCase() } : {}),
      },
      message,
    );
  };

  const resumeRoom = (credential: RoomCredential): void => {
    if (!canSend) {
      dispatch({ type: 'request_send_failed' });
      return;
    }
    const message = buildResumeRoomEnvelope(credential);
    sendRequest(
      { requestId: message.requestId, kind: 'resume', roomCode: credential.roomCode },
      message,
    );
  };

  return (
    <main className="party-shell">
      <div className="confetti confetti--one" aria-hidden="true" />
      <div className="confetti confetti--two" aria-hidden="true" />

      <header className="masthead">
        <a className="brand" href="/" aria-label="闹一桌首页">
          <span className="brand__stamp" aria-hidden="true">闹</span>
          <span>闹一桌</span>
        </a>
        <span className="lan-tag">局域网限定</span>
      </header>

      <section className="hero" aria-labelledby="welcome-title">
        <p className="eyebrow">手机就是你的手牌</p>
        <h1 id="welcome-title">人到齐，<br /><em>就开局。</em></h1>
        <p className="hero__lede">连上同一个 Wi-Fi，不用注册，和身边的朋友面对面玩。</p>
      </section>

      {state.room === undefined ? (
        <section className="table-card lobby-card" aria-labelledby="lobby-title">
          <div className="table-card__marker" aria-hidden="true">01</div>
          <div className="game-art" aria-hidden="true">
            <span className="game-art__card game-art__card--back">?</span>
            <span className="game-art__card game-art__card--front">谁</span>
          </div>
          <div className="table-card__copy">
            <p className="kicker">首发游戏</p>
            <h2 id="lobby-title">谁是卧底</h2>
            <p>4–12 人 · 同桌推理 · 一台主机</p>
          </div>

          <div className="mode-tabs" role="group" aria-label="进入房间方式">
            <button
              type="button"
              aria-pressed={state.mode === 'create'}
              onClick={() => changeMode('create')}
            >
              我来开桌
            </button>
            <button
              type="button"
              aria-pressed={state.mode === 'join'}
              onClick={() => changeMode('join')}
            >
              加入一桌
            </button>
          </div>

          <form
            id="lobby-form"
            ref={formRef}
            className="lobby-form"
            onSubmit={submitLobby}
            noValidate
          >
            <label className="field" htmlFor="nickname">
              <span>你的昵称</span>
              <input
                id="nickname"
                name="nickname"
                type="text"
                autoComplete="nickname"
                maxLength={64}
                value={state.form.nickname}
                aria-invalid={state.fieldErrors.nickname !== undefined}
                aria-describedby={state.fieldErrors.nickname === undefined ? 'nickname-hint' : 'nickname-error'}
                onChange={(event) => dispatch({ type: 'field_changed', field: 'nickname', value: event.target.value })}
              />
              {state.fieldErrors.nickname === undefined ? (
                <small id="nickname-hint">1–16 个字符，朋友一眼就能认出你</small>
              ) : (
                <small id="nickname-error" className="field__error">{state.fieldErrors.nickname}</small>
              )}
            </label>

            {state.mode === 'join' && (
              <label className="field" htmlFor="room-code">
                <span>5 位房间码</span>
                <input
                  id="room-code"
                  name="roomCode"
                  className="room-code-input"
                  type="text"
                  autoComplete="off"
                  autoCapitalize="characters"
                  maxLength={5}
                  value={state.form.roomCode}
                  aria-invalid={state.fieldErrors.roomCode !== undefined}
                  aria-describedby={state.fieldErrors.roomCode === undefined ? undefined : 'room-code-error'}
                  onChange={(event) => dispatch({ type: 'field_changed', field: 'roomCode', value: event.target.value })}
                />
                {state.fieldErrors.roomCode !== undefined && (
                  <small id="room-code-error" className="field__error">{state.fieldErrors.roomCode}</small>
                )}
              </label>
            )}

            <label className="field" htmlFor="room-password">
              <span>房间密码 <i>可选</i></span>
              <input
                id="room-password"
                name="password"
                type="password"
                autoComplete={state.mode === 'create' ? 'new-password' : 'current-password'}
                maxLength={64}
                value={state.form.password}
                aria-invalid={state.fieldErrors.password !== undefined}
                aria-describedby={state.fieldErrors.password === undefined ? 'password-hint' : 'password-error'}
                onChange={(event) => dispatch({ type: 'field_changed', field: 'password', value: event.target.value })}
              />
              {state.fieldErrors.password === undefined ? (
                <small id="password-hint">留空则无需密码；设置时为 4–32 个字符</small>
              ) : (
                <small id="password-error" className="field__error">{state.fieldErrors.password}</small>
              )}
            </label>

            {state.mode === 'join' && (
              <fieldset className="role-choice">
                <legend>这次想怎么玩？</legend>
                <label>
                  <input
                    type="radio"
                    name="role"
                    value="player"
                    checked={state.form.role === 'player'}
                    onChange={(event) => dispatch({ type: 'field_changed', field: 'role', value: event.target.value })}
                  />
                  <span><strong>上桌玩</strong><small>拿词、发言和投票</small></span>
                </label>
                <label>
                  <input
                    type="radio"
                    name="role"
                    value="spectator"
                    checked={state.form.role === 'spectator'}
                    onChange={(event) => dispatch({ type: 'field_changed', field: 'role', value: event.target.value })}
                  />
                  <span><strong>先围观</strong><small>只看公开进度</small></span>
                </label>
              </fieldset>
            )}

            <button className="primary-action" type="submit" disabled={!canSend}>
              {state.pending !== undefined
                ? '等待主机回应…'
                : !gateway.welcomed
                  ? '等待主机就绪'
                  : state.mode === 'create'
                    ? '创建房间'
                    : '加入房间'}
              <span aria-hidden="true">→</span>
            </button>
          </form>

          {(state.notice !== undefined || gateway.protocolIssue !== undefined) && (
            <p
              className={`request-notice request-notice--${gateway.protocolIssue === undefined ? state.notice?.tone : 'error'}`}
              role={gateway.protocolIssue !== undefined || state.notice?.tone === 'error' ? 'alert' : 'status'}
              aria-live="polite"
            >
              {gateway.protocolIssue ?? state.notice?.text}
            </p>
          )}
        </section>
      ) : (
        <section className="table-card room-card" aria-labelledby="room-title">
          <p className="kicker">{state.synchronized ? '已同步到这张桌' : '正在重新同步'}</p>
          <h2 id="room-title">房间 {state.room.roomCode}</h2>
          <p className="room-card__meta">{state.room.members.length} 人在线 · 序号 {state.roomSeq}</p>
          <ul className="member-list" aria-label="房间成员">
            {state.room.members.map((member) => (
              <li key={member.playerId}>
                <span>{member.nickname}</span>
                <small>{member.isHost ? '房主' : member.role === 'spectator' ? '观战' : '玩家'}</small>
              </li>
            ))}
          </ul>
          <p className={`sync-guard ${state.synchronized ? 'sync-guard--ready' : ''}`} role="status">
            {state.synchronized ? '房间状态已同步，可以安全继续。' : '同步完成前，房间操作保持禁用。'}
          </p>
          {state.notice?.tone === 'error' && (
            <p className="request-notice request-notice--error" role="alert">{state.notice.text}</p>
          )}
        </section>
      )}

      {state.room === undefined && savedRooms[0] !== undefined && (
        <section className="resume-card" aria-labelledby="resume-title">
          <span className="resume-card__ticket" aria-hidden="true">续</span>
          <div>
            <p className="kicker">找到上次的席位</p>
            <h2 id="resume-title">房间 {savedRooms[0].roomCode}</h2>
            <small>恢复凭证只保存在这台设备；仅恢复时发送给当前主机，不显示在页面或日志。</small>
          </div>
          <button
            type="button"
            className="secondary-action"
            disabled={!canSend}
            onClick={() => resumeRoom(savedRooms[0]!)}
          >
            {state.pending?.kind === 'resume' ? '恢复中…' : '恢复席位'}
          </button>
        </section>
      )}

      <ConnectionBadge state={gateway.state} />

      <footer>
        <span>β R1</span><span>·</span><span>只在这张网里玩</span>
      </footer>
    </main>
  );
}
