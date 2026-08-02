import { useState } from 'react';
import { useConnection } from '../connection/useConnection.ts';
import { describeError } from '../shared-ui/errors.ts';

export function GameLeaveButton({ className = '' }: { className?: string }) {
  const { send, clearMe } = useConnection();
  const [leaving, setLeaving] = useState(false);
  const [leaveError, setLeaveError] = useState<string | null>(null);

  async function handleLeave() {
    if (leaving) return;
    if (!window.confirm('确定要退出当前牌局吗？退出后本局座位会暂时保留，仍可使用恢复信息重连。')) return;
    setLeaving(true);
    setLeaveError(null);
    try {
      await send('leave_room', {});
      clearMe();
    } catch (err) {
      setLeaveError(`退出失败：${describeError(err)}`);
      setLeaving(false);
    }
  }

  return (
    <div className={`game-leave ${className}`.trim()}>
      <button type="button" className="game-leave__button" disabled={leaving} onClick={() => void handleLeave()}>
        {leaving ? '正在退出…' : '退出牌局'}
      </button>
      {leaveError && <span className="game-leave__error" role="alert">{leaveError}</span>}
    </div>
  );
}
