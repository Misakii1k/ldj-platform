import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, BookOpen, Trophy, X } from 'lucide-react';
import type { WerewolfPresentationModel } from '../presentation.ts';
import { UserAvatar } from '../../../user/UserAvatar.tsx';
import { useWerewolfTheme } from '../WerewolfThemeProvider.tsx';
import { buildResultRoster } from './resultRoster.ts';
import './werewolf-result.css';

interface GameOverRevealProps {
  readonly reveal: WerewolfPresentationModel['reveal'];
  readonly seats?: WerewolfPresentationModel['seats'];
  /**
   * 是否在 reveal 出现时自动弹出。真人主持玩家端（moderator/PlayerCardView）保持自动弹出；
   * 剧场 v2 舞台（W07）传 false：终局揭晓由中央 FinaleReveal 承担，本组件只作「查看终局复盘」弹窗。
   */
  readonly autoOpen?: boolean;
}

export function GameOverReveal({ reveal, seats = [], autoOpen = true }: GameOverRevealProps) {
  const [closed, setClosed] = useState(!autoOpen);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const rosterId = useId();
  const { resolvedTheme } = useWerewolfTheme();
  const open = Boolean(reveal) && !closed;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!open || !dialog) return;
    dialog.showModal();
    return () => {
      dialog.close();
      triggerRef.current?.focus();
    };
  }, [open]);

  if (!reveal) return null;
  const rows = buildResultRoster(reveal, seats);
  const aliveCount = rows.filter(row => row.status === 'alive').length;
  const outCount = rows.filter(row => row.status === 'out').length;
  const close = () => setClosed(true);

  return <>
    <div className="ww-result-launcher" data-result-theme={resolvedTheme}>
      <button ref={triggerRef} type="button" className="ww-result-open" aria-haspopup="dialog" onClick={() => setClosed(false)}>
        <BookOpen size={18} aria-hidden="true" />查看终局复盘
      </button>
    </div>
    {open && createPortal(
      <dialog ref={dialogRef} className="ww-result-modal" data-result-theme={resolvedTheme}
        aria-labelledby={titleId} aria-modal="true"
        onCancel={event => { event.preventDefault(); close(); }}
        onKeyDown={event => {
          if (event.key !== 'Tab') return;
          const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), [tabindex="0"]'));
          const first = controls[0];
          const last = controls.at(-1);
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        }}
        onClick={event => {
          if (event.target !== event.currentTarget) return;
          const box = event.currentTarget.getBoundingClientRect();
          if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) close();
        }}>
        <div className="ww-result-topbar">
          <h2 id={titleId}>终局复盘</h2>
          <button type="button" className="ww-result-close" onClick={close} aria-label="关闭终局复盘" autoFocus>
            <X size={20} aria-hidden="true" />
          </button>
        </div>
        <div className="ww-result-hero">
          <div className="ww-result-emblem" aria-hidden="true"><Trophy size={28} /></div>
          <div className="ww-result-outcome">
            <span className="ww-result-eyebrow">对局结束 · 身份揭晓</span>
            <h3>{reveal.headline}</h3>
            <p>所有身份已公开，一起回看这局的隐藏角色。</p>
          </div>
        </div>
        <section className="ww-result-roster" aria-labelledby={rosterId} tabIndex={0}>
          <div className="ww-result-roster-heading">
            <h3 id={rosterId}>全员身份 <span>{rows.length} 人</span></h3>
            <span className="ww-result-tally">存活 {aliveCount} · 出局 {outCount}</span>
          </div>
          <ul className="ww-result-grid">
            {rows.map(row => <li key={row.key} className="ww-result-player">
              <div aria-hidden="true"><UserAvatar avatar={row.avatar} nickname={row.name} size={40} /></div>
              <div className="ww-result-player-info">
                <span className="ww-result-seat">{row.seatLabel}</span>
                <strong className="ww-result-name" title={row.name}>{row.name}</strong>
                <span className="ww-result-role" data-role-kind={row.roleKind}>{row.roleLabel}</span>
              </div>
              <span className="ww-result-status" data-status={row.status}>{row.statusLabel}</span>
            </li>)}
          </ul>
          {rows.length === 0 && <p className="ww-result-empty">暂无公开身份记录</p>}
        </section>
        <div className="ww-result-footer">
          <p>返回后仍可随时查看本局复盘</p>
          <button type="button" className="ww-result-return" onClick={close}><ArrowLeft size={18} aria-hidden="true" />返回桌面</button>
        </div>
      </dialog>, document.body,
    )}
  </>;
}
