import { useEffect, useMemo, useRef, useState } from 'react';

export interface RoleTurnOverlayProps {
  readonly role: string | null;
  readonly segment: string | null;
  readonly timelineId: string | null;
  readonly period?: 'day' | 'night' | null;
}

const ROLE_IMAGE_MAP: Readonly<Record<string, string>> = {
  werewolf: '/assets/roles/werewolf.png',
  wolf: '/assets/roles/werewolf.png',
  witch: '/assets/roles/witch.png',
  seer: '/assets/roles/seer.png',
  guard: '/assets/roles/guard.png',
  hunter: '/assets/roles/hunter.png',
  hunter_idiot: '/assets/roles/hunter.png',
  idiot: '/assets/roles/idiot.png',
  villager: '/assets/roles/villager.png',
};

type AnimPhase = 'enter' | 'highlight' | 'silhouette' | 'exit' | 'hidden';

/**
 * 通用职业演出层（02-VISUAL.md 第4节 / T11）：
 * - 仅接收公开 timeline 信息（role, segment, timelineId, period），严禁接收 self/seat/target 等私密数据
 * - 入场 450ms → 突出高亮 1500ms → 退居柔和态（不与背景叠印） → close 段 350ms 淡出
 * - 不挡点击（pointer-events: none）
 * - 限定在独立插画区域，实体底板隔离背景纹理
 * - 响应 prefers-reduced-motion，并在后台/离开时清理全部计时器
 */
export function RoleTurnOverlay({ role, segment, timelineId, period = 'night' }: RoleTurnOverlayProps) {
  const [phase, setPhase] = useState<AnimPhase>('hidden');
  const [activeRole, setActiveRole] = useState<string | null>(null);

  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  const closing = segment === 'close';
  const timersRef = useRef<number[]>([]);

  const clearTimers = () => {
    for (const t of timersRef.current) {
      window.clearTimeout(t);
    }
    timersRef.current = [];
  };

  const imageSrc = useMemo(() => {
    if (!activeRole) return null;
    return ROLE_IMAGE_MAP[activeRole] ?? null;
  }, [activeRole]);

  useEffect(() => {
    clearTimers();

    if (!role) {
      setPhase('exit');
      const t = window.setTimeout(() => {
        setPhase('hidden');
        setActiveRole(null);
      }, 350);
      timersRef.current.push(t);
      return () => clearTimers();
    }

    setActiveRole(role);

    if (closing) {
      setPhase('exit');
      const t = window.setTimeout(() => {
        setPhase('hidden');
      }, 350);
      timersRef.current.push(t);
      return () => clearTimers();
    }

    // 新环节开启或从 open 开始：入场 450ms -> 高亮 1500ms -> 轮廓态
    setPhase('enter');
    if (document.hidden || loadedSrc !== ROLE_IMAGE_MAP[role]) return () => clearTimers();
    const tHighlight = window.setTimeout(() => {
      setPhase('highlight');
      const tSil = window.setTimeout(() => {
        setPhase('silhouette');
      }, 1500);
      timersRef.current.push(tSil);
    }, 450);
    timersRef.current.push(tHighlight);

    return () => clearTimers();
  }, [role, closing, timelineId, loadedSrc]);

  // 后台可见性变更处理：若页面隐藏，立即清理当前计时器
  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden) {
        clearTimers();
        setPhase('hidden');
      } else if (role && !closing) {
        setActiveRole(role);
        setPhase('silhouette');
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [role, closing]);

  if (phase === 'hidden' || !imageSrc) {
    return null;
  }

  return (
    <aside
      data-role={activeRole ?? undefined}
      data-ready={loadedSrc === imageSrc}
      className={`ww-role-turn-overlay is-${phase} is-${period ?? 'night'}`}
      aria-hidden="true"
      style={{ pointerEvents: 'none' }}
    >
      <img
        key={activeRole}
        src={imageSrc}
        onLoad={() => setLoadedSrc(imageSrc)}
        alt=""
        className="ww-role-silhouette-art"
        loading="eager"
      />
      {activeRole === 'hunter_idiot' && <img src={ROLE_IMAGE_MAP.idiot} alt="" className="ww-role-silhouette-art" loading="eager" />}
    </aside>
  );
}
