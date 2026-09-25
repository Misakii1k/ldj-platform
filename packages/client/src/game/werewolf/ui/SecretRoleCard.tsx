import { useEffect, useRef, useState, type ReactNode } from 'react';
import { GameDrawer } from '../../tabletop/GameDrawer.tsx';

/** Shoulder-surf protection only: the server still controls the authorized view. */
export function SecretRoleCard({ name, camp, artwork, children, label = '查看我的身份' }: {
  readonly name: string; readonly camp: string; readonly artwork: string;
  readonly children?: ReactNode; readonly label?: string;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const hide = () => setOpen(false);
    const visibility = () => { if (document.hidden) hide(); };
    window.addEventListener('blur', hide);
    window.addEventListener('pagehide', hide);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      window.removeEventListener('blur', hide);
      window.removeEventListener('pagehide', hide);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, []);
  return (
    <>
      <button ref={trigger} type="button" className="ww-secret-trigger" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>
        <span className="ww-secret-seal" aria-hidden="true">☾</span>
        <span><strong>{label}</strong><small>身份已遮蔽 · 点击私密查看</small></span>
      </button>
      {open && <GameDrawer kind="private" title="私密身份契约" className="ww-private-dialog" triggerRef={trigger} onClose={() => setOpen(false)}>
        <div className="ww-secret-card">
          <div className="ww-secret-art"><img src={artwork} alt="" onError={(event) => { event.currentTarget.style.visibility = 'hidden'; }} /></div>
          <div><span className="ww-eyebrow">{camp}</span><h2>{name}</h2></div>
        </div>
        {children}
        <p className="ww-private-notice">请留意身边视线。关闭、切后台或窗口失焦后自动遮蔽。</p>
      </GameDrawer>}
    </>
  );
}
