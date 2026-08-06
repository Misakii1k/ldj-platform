/**
 * D4-UI0：连接状态横幅。
 * 读取 isRefreshing / isRecovering（ConnectionSnapshot 派生标志）：
 *  - 两者都不为真 → 渲染 null（不占位、不打扰）；
 *  - 否则显示非模态的纯信息状态条（role="status" aria-live="polite"）。
 * 仅在“服务端恢复对局状态”时提供手动“重新同步”按钮。
 * 不拦截任何交互，保留已渲染的房间/对局视图。
 */
import { useConnection } from '../connection/useConnection.ts';
import type { ConnectionSnapshot } from '../connection/types.ts';
import styles from './TabletopStatusBanner.module.css';

export function TabletopStatusBanner({
  state,
}: {
  /** 显式传入快照（App 已持有）；未传时回退到 useConnection() 的实时快照 */
  state?: ConnectionSnapshot;
}) {
  const api = useConnection();
  const snap = state ?? api.state;
  const { isRefreshing, isRecovering } = snap;

  if (!isRefreshing && !isRecovering) return null;

  const recovering = isRecovering;
  const message = recovering ? '服务端正在恢复对局状态…' : '连接断开，正在重连…';

  return (
    <aside className={styles.statusBar} role="status" aria-live="polite">
      <span className={styles.dot} aria-hidden="true" />
      <span className={styles.message}>{message}</span>
      {recovering && (
        <button type="button" className={styles.resyncButton} onClick={api.resync}>
          重新同步
        </button>
      )}
    </aside>
  );
}
