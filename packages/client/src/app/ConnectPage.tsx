/**
 * 连接页（Task 2）：昵称输入 + 创建/加入房间。
 * 创建：可选密码；加入：必填房间码（5 位），可选密码。
 */
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useConnection } from '../connection/useConnection.ts';
import { useToast } from '../shared-ui/ToastContext.tsx';
import { describeError } from '../shared-ui/errors.ts';
import type { Me } from '../connection/types.ts';

type Mode = 'create' | 'join';

interface AckOutcome {
  roomCode: string;
  playerId: string;
  resumeToken: string;
  seatRole?: 'player' | 'spectator';
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function parseAck(payload: unknown): AckOutcome | null {
  if (!isObject(payload)) return null;
  const { roomCode, playerId, resumeToken, seatRole } = payload;
  if (typeof roomCode !== 'string' || typeof playerId !== 'string' || typeof resumeToken !== 'string') {
    return null;
  }
  if (seatRole !== undefined && seatRole !== 'player' && seatRole !== 'spectator') {
    return null;
  }
  return { roomCode, playerId, resumeToken, seatRole };
}

export function ConnectPage() {
  const { send, setMe, state } = useConnection();
  const { showToast } = useToast();
  const [mode, setMode] = useState<Mode>('create');
  const [nickname, setNickname] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [password, setPassword] = useState('');
  const [asSpectator, setAsSpectator] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nicknameRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    nicknameRef.current?.focus();
  }, []);

  const canSubmit =
    !submitting &&
    nickname.trim().length >= 1 &&
    nickname.trim().length <= 16 &&
    (mode === 'create' || /^[A-HJ-NP-Z2-9]{5}$/i.test(roomCode.trim())) &&
    state.connState !== 'connecting' &&
    state.connState !== 'reconnecting';

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const type = mode === 'create' ? 'create_room' : 'join_room';
      const payload =
        mode === 'create'
          ? { nickname: nickname.trim(), ...(password.length > 0 ? { password } : {}) }
          : {
              roomCode: roomCode.trim().toUpperCase(),
              nickname: nickname.trim(),
              asSpectator,
              ...(password.length > 0 ? { password } : {}),
            };
      const ack = await send(type, payload);
      const outcome = parseAck(ack.payload);
      if (!outcome) {
        setError('服务器返回异常，请重试');
        return;
      }
      const me: Me = {
        playerId: outcome.playerId,
        resumeToken: outcome.resumeToken,
        roomCode: outcome.roomCode,
        nickname: nickname.trim(),
        seatRole: outcome.seatRole ?? 'player',
      };
      setMe(me);
    } catch (err) {
      const msg = describeError(err);
      setError(msg);
      showToast(msg, 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="connect-page">
      <header className="connect-header">
        <h1>局域网桌游平台</h1>
        <p className="subtitle">谁是卧底 · 局域网联机</p>
      </header>

      <form className="connect-form" onSubmit={handleSubmit}>
        <div className="mode-toggle" role="tablist" aria-label="选择创建或加入房间">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'create'}
            aria-label="创建房间"
            className={mode === 'create' ? 'active' : ''}
            onClick={() => setMode('create')}
          >
            创建房间
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'join'}
            aria-label="加入房间"
            className={mode === 'join' ? 'active' : ''}
            onClick={() => setMode('join')}
          >
            加入房间
          </button>
        </div>

        <label className="field" htmlFor="nickname">
          <span className="field-label">昵称</span>
          <input
            ref={nicknameRef}
            id="nickname"
            type="text"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="1-16 个字符"
            maxLength={16}
            autoComplete="off"
            aria-invalid={!!error}
            aria-describedby={error ? 'connect-error' : undefined}
            required
          />
        </label>

        {mode === 'join' && (
          <label className="field" htmlFor="roomCode">
            <span className="field-label">房间码</span>
            <input
              id="roomCode"
              type="text"
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
              placeholder="5 位字母数字"
              maxLength={5}
              autoComplete="off"
              aria-invalid={!!error}
              aria-describedby={error ? 'connect-error' : undefined}
              required
            />
          </label>
        )}

        <label className="field" htmlFor="password">
          <span className="field-label">密码（可选）</span>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={mode === 'create' ? '留空则不设密码' : '有密码的房间必填'}
            maxLength={32}
            autoComplete="off"
          />
        </label>

        {mode === 'join' && (
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={asSpectator}
              onChange={(e) => setAsSpectator(e.target.checked)}
              aria-label="以观战身份加入"
            />
            <span>以观战身份加入</span>
          </label>
        )}

        {error && <div id="connect-error" className="error-banner" role="alert">{error}</div>}

        <button type="submit" className="submit-btn" disabled={!canSubmit}>
          {submitting ? '处理中…' : mode === 'create' ? '创建并进入' : '加入房间'}
        </button>
      </form>

      <footer className="connect-footer">
        <span className="conn-indicator" data-state={state.connState}>
          <span className="conn-dot" aria-hidden="true" />
          已连接
        </span>
        {state.serverVersion && <span className="server-version">服务端 {state.serverVersion}</span>}
      </footer>
    </main>
  );
}
