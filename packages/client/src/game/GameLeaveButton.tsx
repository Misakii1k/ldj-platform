import { useState } from 'react';
import { useConnection } from '../connection/useConnection.ts';
import { describeError } from '../shared-ui/errors.ts';
import { ConfirmDialog } from '../shared-ui/ConfirmDialog.tsx';
import { GameIcon } from '../shared-ui/GameIcon.tsx';

export function GameLeaveButton({ className = '' }: { className?: string }) {
  const { send, clearMe, setViewingHome, state, me } = useConnection();
  const isHost = me !== null && state.room !== null && state.room.members.some(
    (m) => m.playerId === me.playerId && m.isHost,
  );
  const [leaving, setLeaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [leaveError, setLeaveError] = useState<string | null>(null);

  // 1. 暂离返回大厅/首页：保持房间在后台运行，主页顶部显示快捷返回条，玩家也可自由挑选/创建其他游戏
  function handleStepOut() {
    setConfirmOpen(false);
    setViewingHome(true);
  }

  // 2. 彻底离开房间
  async function handleLeave() {
    if (leaving) return;
    setConfirmOpen(false);
    setLeaving(true);
    setLeaveError(null);
    try {
      await send('leave_room', {});
    } catch (err) {
      setLeaveError(`退出失败：${describeError(err)}`);
    } finally {
      clearMe();
      setLeaving(false);
    }
  }

  // 3. 房主解散房间
  async function handleDissolve() {
    if (leaving) return;
    setConfirmOpen(false);
    setLeaving(true);
    setLeaveError(null);
    try {
      await send('room_command', { command: 'close_room' });
    } catch (err) {
      setLeaveError(`解散失败：${describeError(err)}`);
    } finally {
      clearMe();
      setLeaving(false);
    }
  }

  return (
    <div className={`game-leave ${className}`.trim()}>
      <button type="button" className="game-leave__button" disabled={leaving} onClick={() => setConfirmOpen(true)}>
        <GameIcon name="door_exit" size={15} style={{ marginRight: '6px' }} />
        {leaving ? '正在退出…' : '返回大厅 / 退出'}
      </button>
      {leaveError && <span className="game-leave__error" role="alert">{leaveError}</span>}
      {confirmOpen && (
        <ConfirmDialog
          title={isHost ? '房主退出选项' : '暂离或退出'}
          message={
            isHost
              ? '选择「暂离返回大厅」可在主页顶部随时一键返回原房间，或自由挑选新游戏；选择「解散房间」将彻底关闭当前房间。'
              : '选择「暂离返回大厅」将保留您的席位，可在主页顶部随时返回或自由体验其他游戏；选择「彻底退出」将释放席位。'
          }
          confirmLabel="暂离返回大厅"
          secondaryLabel={isHost ? '解散房间' : '彻底退出'}
          onSecondary={isHost ? () => void handleDissolve() : () => void handleLeave()}
          busy={leaving}
          onConfirm={handleStepOut}
          onCancel={() => setConfirmOpen(false)}
        />
      )}
    </div>
  );
}
