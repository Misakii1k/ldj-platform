import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { WerewolfPresentationModel, WerewolfSeatModel, WerewolfActionOption } from '../presentation.ts';
import { WEREWOLF_ROLE_ARTWORK, WEREWOLF_ROLE_DETAILS, WEREWOLF_ROLE_NAMES, getSpeakerIllustrationUrl } from '../presentation.ts';
import { GameOverReveal } from './GameOverReveal.tsx';
import { useJudgeVoice } from './useJudgeVoice.ts';
import { judgeVoice as judgeVoicePlayer } from './judgeVoice.ts';
import { BookOpen, IdCard, MessageCircle, ScrollText, Settings2 } from 'lucide-react';
import { useConnection } from '../../../connection/useConnection.ts';
import { formatTimelineTimer } from '../../../shared-ui/serverClock.ts';
import { useCompactLayout } from '../../../shared-ui/useCompactLayout.ts';
import { useWerewolfTheme } from '../WerewolfThemeProvider.tsx';
import { WerewolfSettingsDrawer } from './WerewolfSettingsDrawer.tsx';
import { TheatreStage } from './TheatreStage.tsx';
import type { TheatrePeriod } from './TheatreStage.tsx';
import { TicketSeat } from './TicketSeat.tsx';
import type { TicketStamp } from './TicketSeat.tsx';
import { SpeakerSpotlight } from './SpeakerSpotlight.tsx';
import { NightWake } from './NightWake.tsx';
import { VoteUrn } from './VoteUrn.tsx';
import { VoteCount, buildBallotQueue } from './VoteCount.tsx';
import { RoleDealCard } from './RoleDealCard.tsx';
import { FinaleReveal } from './FinaleReveal.tsx';

interface WerewolfStageProps {
  readonly model: WerewolfPresentationModel;
  readonly synced: boolean;
  readonly busy: boolean;
  readonly error: string | null;
  readonly onAct: (payload: unknown) => void;
}

/**
 * AI 法官模式玩家端（剧场视觉改造 · W02 舞台骨架 + 剧场票根席位）。
 *
 * 视觉契约：`docs/plans/2026-09-26-werewolf-visual/01-CONTRACT.md`
 * 像素参照：`docs/ui-preview/werewolf/directions/A2-box-wings.html`（白天）
 *          `N-night.html`（夜）、`V-vote.html`、`R-reveal.html`
 *
 * W02 范围：左右包厢栏换成 `TicketSeat` 票根卡（右栏自下而上排）、中央换成 `TheatreStage`，
 * 删掉森林 SVG / 月蚀星轨 / 旧 `.theatre` 块 / `art-caption` / `.next` / 中央「上一轮票型」按钮，
 * 票型记录并入顶栏 📜 图标。中央发言者**暂留**原 `.speaker` 文本，W03 再替换为圆形头像版。
 */
export function WerewolfStage({ model, synced, busy, error, onAct }: WerewolfStageProps) {
  // 1. 唯一主题：剧场；resolvedTheme 只区分 theatre-day / theatre-night 两态
  const { resolvedTheme } = useWerewolfTheme();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [chatUnread, setChatUnread] = useState(0);

  useEffect(() => {
    const handleUnread = (e: Event) => {
      const custom = e as CustomEvent<{ unreadCount: number }>;
      if (typeof custom.detail?.unreadCount === 'number') {
        setChatUnread(custom.detail.unreadCount);
      }
    };
    window.addEventListener('ldj:chat-unread', handleUnread);
    return () => window.removeEventListener('ldj:chat-unread', handleUnread);
  }, []);

  // 倒计时与权威时钟显示、房主状态
  const { state: connState, me } = useConnection();
  const isHost = Boolean(connState.room?.members?.some((m) => m.playerId === me?.playerId && m.isHost));

  // 2. 法官语音导演状态（新局带权威时间线时单曲播放并按 host 出声，保留旧局分支）
  const judgeVoice = useJudgeVoice(model, { isHost, clockSample: connState.clockSample });
  const isAuthoritative = Boolean(model.isAuthoritativeTimeline && model.timeline);

  const isNightVoiceRunning = isAuthoritative ? false : judgeVoice.isNightVoiceRunning;
  const isDayAnnouncementRunning = isAuthoritative ? false : judgeVoice.isDayAnnouncementRunning;
  const currentNightRole = isAuthoritative ? null : judgeVoice.currentNightRole;
  const roleRemainingSeconds = isAuthoritative ? null : judgeVoice.roleRemainingSeconds;

  const _effectivePhase = isAuthoritative
    ? (model.timeline?.period === 'night' ? 'night' : model.phase)
    : isNightVoiceRunning
      ? 'night'
      : isDayAnnouncementRunning
        ? 'day_announcement'
        : model.phase;
  const effectivePhaseLabel = isAuthoritative && model.timeline
    ? model.timeline.label
    : isNightVoiceRunning
      ? (currentNightRole ? `${WEREWOLF_ROLE_NAMES[currentNightRole]}行动` : '夜晚行动')
      : isDayAnnouncementRunning
        ? '天亮公布'
        : model.phaseLabel;
  const effectiveNarrative = isAuthoritative && model.timeline
    ? model.timeline.label
    : isNightVoiceRunning
      ? (currentNightRole ? `法官正在引导 ${WEREWOLF_ROLE_NAMES[currentNightRole]} 行动` : '夜幕降临，万籁俱寂')
      : isDayAnnouncementRunning
        ? (model.nightDeathSeats.length === 0 ? '昨夜是平安夜' : `昨夜有 ${model.nightDeathSeats.length} 人遇难`)
        : model.narrative;

  // 4. 夜间黑夜遮罩保护：在夜间全流程播放结束前，全场死者保持存活显示，杜绝提前泄露
  // 当 isAuthoritative 时，不再使用客户端补播/整夜 visual lock 遮罩服务端白天，直接以权威视角为准
  const effectiveSeats = useMemo(() => {
    return model.seats.map((seat) => {
      const seatNum = Number(seat.seatLabel.replace(/\D/g, '')) - 1;
      const hideDeath = !isAuthoritative && (isNightVoiceRunning || isDayAnnouncementRunning) && model.nightDeathSeats.includes(seatNum);
      return {
        ...seat,
        alive: hideDeath ? true : seat.alive,
        statusLabel: hideDeath ? '存活' : seat.statusLabel,
        isSpeaking: isNightVoiceRunning || isDayAnnouncementRunning ? false : seat.isSpeaking,
      };
    });
  }, [model.seats, isAuthoritative, isNightVoiceRunning, isDayAnnouncementRunning, model.nightDeathSeats]);

  const speakingSeat = effectiveSeats.find((seat) => seat.isSpeaking);

  const [currentMonotonic, setCurrentMonotonic] = useState(() => (typeof performance !== 'undefined' ? performance.now() : Date.now()));

  useEffect(() => {
    if (!isAuthoritative || !model.timeline || model.timeline.paused || model.timeline.endsAt === null) {
      return;
    }
    const timer = setInterval(() => {
      setCurrentMonotonic(typeof performance !== 'undefined' ? performance.now() : Date.now());
    }, 500);
    return () => clearInterval(timer);
  }, [isAuthoritative, model.timeline]);

  const authoritativeTimer = useMemo(() => {
    if (!isAuthoritative || !model.timeline) return null;
    return formatTimelineTimer(model.timeline, connState.clockSample, currentMonotonic);
  }, [isAuthoritative, model.timeline, connState.clockSample, currentMonotonic]);

  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  useEffect(() => {
    if (isAuthoritative) {
      return;
    }
    if (isNightVoiceRunning) {
      setSecondsLeft(roleRemainingSeconds);
      return;
    }
    if (!model.deadlineAt) {
      setSecondsLeft(null);
      return;
    }
    const updateTime = () => {
      const remaining = Math.max(0, Math.ceil((model.deadlineAt! - Date.now()) / 1000));
      setSecondsLeft(remaining);
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, [isAuthoritative, model.deadlineAt, isNightVoiceRunning, roleRemainingSeconds]);

  const formattedTime = useMemo(() => {
    if (secondsLeft === null) return '--:--';
    const m = Math.floor(secondsLeft / 60);
    const s = secondsLeft % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }, [secondsLeft]);

  // ── W03：中央场景的倒计时（秒 + 环总量 + 权威状态文案） ──
  const displaySeconds = isAuthoritative
    ? (authoritativeTimer?.status === 'counting' ? authoritativeTimer.secondsLeft : null)
    : secondsLeft;
  const timerNote = isAuthoritative && authoritativeTimer
    ? authoritativeTimer.status === 'paused'
      ? `已暂停 · ${authoritativeTimer.secondsLeft}s`
      : authoritativeTimer.status === 'waiting'
        ? '等待主持人推进'
        : authoritativeTimer.status === 'broadcasting'
          ? '正在播报…'
          : null
    : null;

  // 环的总量：每个 (day, phase) 记录见过的最大秒数，让环从满格开始衰减
  const timerTotalRef = useRef(0);
  useEffect(() => {
    timerTotalRef.current = 0;
  }, [model.day, model.phase]);
  useEffect(() => {
    if (displaySeconds !== null) {
      timerTotalRef.current = Math.max(timerTotalRef.current, displaySeconds);
    }
  }, [displaySeconds]);

  // 昼夜：由 resolveThemePeriod 派生的主题态（theatre-day / theatre-night）
  const period: TheatrePeriod = resolvedTheme === 'theatre-night' ? 'night' : 'day';

  // 契约 §4.0 / §4.1：窄屏（≤768px 或横屏矮视口）包厢栏收窄到 86，票根转紧凑竖版。
  const compact = useCompactLayout();

  // 双翼包厢分配（左半场与右半场）。右侧自下而上排（座位号绕场一圈，契约 §4.0）。
  const seatRails = useMemo(() => {
    const leftCount = Math.ceil(effectiveSeats.length / 2);
    return {
      left: effectiveSeats.slice(0, leftCount),
      right: [...effectiveSeats.slice(leftCount)].reverse(),
    };
  }, [effectiveSeats]);

  // 弹窗状态管理
  const [activeModal, setActiveModal] = useState<'rules' | 'identity' | 'ledger' | 'target' | null>(null);
  const [targetSeat, setTargetSeat] = useState<WerewolfSeatModel | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  // 监听 activeModal 同步原生 dialog
  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;
    if (activeModal) {
      if (!dlg.open) dlg.showModal();
    } else {
      if (dlg.open) dlg.close();
    }
  }, [activeModal]);

  // 视线离开或失焦时自动关闭私密弹窗保护隐私
  useEffect(() => {
    const conceal = () => {
      if (activeModal === 'identity') {
        setActiveModal(null);
      }
    };
    window.addEventListener('blur', conceal);
    const onVisibilityChange = () => {
      if (document.hidden) conceal();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('blur', conceal);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [activeModal]);

  const handleAct = useCallback((payload: unknown) => {
    if (payload && typeof payload === 'object' && (payload as Record<string, unknown>).type === 'seer_check') {
      judgeVoicePlayer.playCue('seer_result_generic').catch(() => {});
    }
    onAct(payload);
  }, [onAct]);

  // ── W04/W05：「选中 → 黄色按钮确认」两步交互（契约 §4.4 / 不许做：不许点席位立即发送） ──
  interface PendingPick {
    readonly playerId: string;
    readonly seatLabel: string;
    readonly seatNumber: number;
    readonly stamp: TicketStamp | null;
    readonly confirmLabel: string;
    readonly payload: Readonly<Record<string, unknown>>;
  }
  const [pendingPick, setPendingPick] = useState<PendingPick | null>(null);
  const [witchPotion, setWitchPotion] = useState<'save' | 'poison' | null>(null);

  const TWO_STEP_PHASES = new Set(['night', 'hunter_shot', 'voting', 'runoff_voting']);
  const isTwoStepPhase = TWO_STEP_PHASES.has(model.phase);

  const pickMeta = useCallback((option: WerewolfActionOption, seat: WerewolfSeatModel): {
    stamp: TicketStamp | null;
    confirmLabel: string;
  } => {
    const type = String(option.payload.type ?? '');
    const no = seat.seatLabel;
    switch (type) {
      case 'night_kill': return { stamp: 'wolf', confirmLabel: `确认袭击 · ${no}` };
      case 'seer_check': return { stamp: 'seer', confirmLabel: `查验 · ${no}` };
      case 'guard_guard': return { stamp: 'guard', confirmLabel: `确认守护 · ${no}` };
      case 'witch_poison': return { stamp: 'witch', confirmLabel: `向 ${no} 下毒` };
      case 'hunter_shoot': return { stamp: 'hunter', confirmLabel: `开枪 · ${no}` };
      case 'day_vote': return { stamp: null, confirmLabel: `投给 ${no}` };
      default: return { stamp: null, confirmLabel: option.label };
    }
  }, []);

  const lastSeatClickTimeRef = useRef(0);
  const handleSeatClick = useCallback((seat: WerewolfSeatModel) => {
    const now = Date.now();
    if (now - lastSeatClickTimeRef.current < 350) return;
    if (busy || !synced) return;
    lastSeatClickTimeRef.current = now;
    const singleAction = seat.targetActions[0];
    if (seat.targetActions.length === 1 && singleAction && isTwoStepPhase) {
      // 两步：点票根只选中（可重复点击取消/改选），黄色按钮才发送
      if (pendingPick?.playerId === seat.playerId) {
        setPendingPick(null);
        return;
      }
      const meta = pickMeta(singleAction, seat);
      setPendingPick({
        playerId: seat.playerId,
        seatLabel: seat.seatLabel,
        seatNumber: Number(seat.seatLabel.replace(/\D/g, '')) || 0,
        stamp: meta.stamp,
        confirmLabel: meta.confirmLabel,
        payload: singleAction.payload,
      });
      return;
    }
    if (seat.targetActions.length === 1 && singleAction) {
      handleAct(singleAction.payload);
    } else {
      setTargetSeat(seat);
      setActiveModal('target');
    }
  }, [busy, synced, handleAct, isTwoStepPhase, pendingPick, pickMeta]);

  const isMySpeaking = speakingSeat?.isSelf;

  // ── W03：交麦演出（契约 §4.5 / §5）——发言者切换时金色 🎙 沿弧线飞到新席位 ──
  const prevSpeakerIdRef = useRef<string | null>(null);
  const speakingPlayerId = model.phase === 'discussion' ? (speakingSeat?.playerId ?? null) : null;
  useEffect(() => {
    const prev = prevSpeakerIdRef.current;
    const current = speakingPlayerId;
    prevSpeakerIdRef.current = current;
    if (!current || !prev || prev === current) return;
    const level = document.documentElement.dataset.motionLevel ?? 'full';
    if (level === 'minimal' || level === 'off') return; // minimal：名字淡入即可，无飞行
    const seatNoOf = (pid: string) =>
      model.seats.find((seat) => seat.playerId === pid)?.seatLabel.replace(/\D/g, '') ?? '';
    const fromEl = document.querySelector(`.seat.ticket[data-seat="${seatNoOf(prev)}"]`);
    const toEl = document.querySelector(`.seat.ticket[data-seat="${seatNoOf(current)}"]`);
    if (!fromEl || !toEl) return;
    const a = (fromEl as HTMLElement).getBoundingClientRect();
    const b = (toEl as HTMLElement).getBoundingClientRect();
    const sx = a.left + a.width / 2;
    const sy = a.top + a.height / 2;
    const tx = b.left + b.width / 2;
    const ty = b.top + b.height / 2;
    const mx = (sx + tx) / 2;
    const my = Math.min(sy, ty) - Math.max(60, Math.abs(tx - sx) * 0.18);
    const el = document.createElement('div');
    el.className = 'ww-mic-flight';
    el.textContent = '🎙';
    el.setAttribute('aria-hidden', 'true');
    document.body.appendChild(el);
    const anim = el.animate(
      [
        { transform: `translate(${sx - 20}px, ${sy - 20}px) scale(.9)`, opacity: 0, offset: 0 },
        { transform: `translate(${mx - 20}px, ${my - 20}px) scale(1.15)`, opacity: 1, offset: 0.55 },
        { transform: `translate(${tx - 20}px, ${ty - 20}px) scale(1)`, opacity: 1, offset: 1 },
      ],
      { duration: 560, easing: 'cubic-bezier(.34, 1.3, .64, 1)' },
    );
    anim.onfinish = () => {
      el.remove();
      (toEl as HTMLElement).classList.add('ww-seat-land');
      window.setTimeout(() => (toEl as HTMLElement).classList.remove('ww-seat-land'), 500);
      if (level === 'full') {
        const page = document.querySelector('.werewolf-native-page');
        page?.classList.add('ww-shake');
        window.setTimeout(() => page?.classList.remove('ww-shake'), 280);
      }
    };
    return () => {
      anim.cancel();
      el.remove();
    };
  }, [speakingPlayerId, model.seats]);

  // W03：票根状态行（讨论阶段的发言顺序；其他阶段为 null，沿用 TicketSeat 内部推导）
  const speechStatusOf = useCallback(
    (seat: WerewolfSeatModel): string | null => {
      if (model.phase !== 'discussion' || !seat.alive) return null;
      if (seat.isSpeaking) return '发言中';
      if (model.nextSpeakerId && seat.playerId === model.nextSpeakerId) return '下一位';
      const idx = model.speakingOrderIds.indexOf(seat.playerId);
      if (idx < 0) return null;
      if (model.speechOrderIndex >= 0 && idx < model.speechOrderIndex) return '已发言';
      return '待发言';
    },
    [model.phase, model.speakingOrderIds, model.speechOrderIndex, model.nextSpeakerId],
  );

  // ── W04：夜间场景推导（契约 §4.4） ──
  const actingNightRole = useMemo((): 'wolf' | 'seer' | 'witch' | 'guard' | 'hunter' | null => {
    if (model.phase === 'hunter_shot') return 'hunter';
    if (model.phase !== 'night') return null;
    if (isAuthoritative) {
      const role = model.timeline?.role;
      return role === 'wolf' || role === 'seer' || role === 'witch' || role === 'guard' ? role : null;
    }
    // 非权威时间线（旧局）：以 view 的 nightStage 为准
    return model.nightStage && model.nightStage !== 'done' ? model.nightStage : null;
  }, [model.phase, model.nightStage, model.timeline, isAuthoritative]);

  const self = model.self;
  const isMyNightTurn = Boolean(
    self && self.alive && actingNightRole !== null
    && (model.phase === 'hunter_shot' ? self.pendingShoot : actingNightRole === self.role),
  );
  const isNightScene = model.phase === 'night' || model.phase === 'hunter_shot';
  // 闭眼等待态：夜间非你回合（含观战/已出局）
  const isSleepView = isNightScene && !isMyNightTurn;

  // 阶段 / 天数 / 行动身份变化时清空本地选中与药瓶选择
  useEffect(() => {
    setPendingPick(null);
    setWitchPotion(null);
  }, [model.phase, model.day, actingNightRole]);

  // 女巫药瓶状态
  const witchVictimSeatNo = self?.nightVictimSeat !== null && self?.nightVictimSeat !== undefined
    ? self.nightVictimSeat + 1
    : null;
  const witchSaveGroup = useMemo(
    () => model.actionGroups.find((g) => g.id === 'witch_save'),
    [model.actionGroups],
  );
  const witchSaveYes = witchSaveGroup?.options.find((o) => o.id === 'save_yes');
  const witchSaveNo = witchSaveGroup?.options.find((o) => o.id === 'skip_save');

  // 夜间票根表现（状态行 / 印章 / 被刀红光 / 昨晚已守）
  const nightSeatPropsOf = useCallback(
    (seat: WerewolfSeatModel): {
      statusText: string | null;
      stamp: TicketStamp | null;
      nightMark: 'victim' | null;
      disabledTarget: boolean;
    } => {
      if (!isNightScene || !seat.alive) {
        return { statusText: null, stamp: null, nightMark: null, disabledTarget: false };
      }
      if (!isNightScene || !seat.alive) {
        return { statusText: null, stamp: null, nightMark: null, disabledTarget: false };
      }
      let statusText: string | null = null;
      let stamp: TicketStamp | null = null;
      let nightMark: 'victim' | null = null;
      let disabledTarget = false;

      // 本地两步选中：盖角色印章（未发送，服务端状态不变）
      if (pendingPick?.playerId === seat.playerId) {
        stamp = pendingPick.stamp;
        statusText = '已选择';
      } else if (seat.isMyTarget && actingNightRole) {
        stamp = actingNightRole === 'hunter' ? 'hunter' : actingNightRole;
      }
      if (isSleepView) {
        statusText = seat.isSelf ? '闭眼中' : null;
      } else if (self?.role === 'wolf' && model.phase === 'night') {
        const mate = self.wolfTeammates.find((m) => m.playerId === seat.playerId);
        if (seat.isWolfTeammate) {
          statusText = mate?.targetSeatLabel ? `同伴 · 选了 ${mate.targetSeatLabel}` : '狼队友';
        }
      } else if (self?.role === 'witch' && model.phase === 'night') {
        if (seat.seatLabel === `${witchVictimSeatNo} 号`) {
          statusText = '今晚倒下';
          nightMark = 'victim';
        }
      } else if (self?.role === 'guard' && model.phase === 'night') {
        if (self.lastGuardTargetPlayerId && seat.playerId === self.lastGuardTargetPlayerId) {
          statusText = '昨晚已守';
          disabledTarget = true;
        }
      }
      return { statusText, stamp, nightMark, disabledTarget };
    },
    [isNightScene, isSleepView, pendingPick, actingNightRole, self, model.phase, witchVictimSeatNo],
  );

  // ── W05：投票 / 唱票 / 放逐 / 遗言（契约 §4.6） ──
  const isVotePhase = model.phase === 'voting' || model.phase === 'runoff_voting';
  const isVoteResultPhase = model.phase === 'vote_result';
  const isLastWordsPhase = model.phase === 'last_words';

  // 唱票播放：纯函数 buildBallotQueue 出顺序，这里只做 WAAPI 飞票与落定计数
  const [ballotCounts, setBallotCounts] = useState<Readonly<Record<string, number>>>({});
  const [countingDone, setCountingDone] = useState(false);
  const [tearingSeatNo, setTearingSeatNo] = useState<number | null>(null);

  const flyBallotToSeat = useCallback((targetPlayerId: string) => {
    const seat = model.seats.find((s) => s.playerId === targetPlayerId);
    const no = seat ? Number(seat.seatLabel.replace(/\D/g, '')) : 0;
    const urn = document.querySelector('.ww-urn');
    const seatEl = document.querySelector(`.seat.ticket[data-seat="${no}"]`);
    if (!urn || !seatEl) return;
    urn.classList.remove('shake');
    void (urn as HTMLElement).offsetWidth;
    urn.classList.add('shake');
    const a = (urn as HTMLElement).getBoundingClientRect();
    const b = (seatEl as HTMLElement).getBoundingClientRect();
    const fx = a.left + a.width / 2;
    const fy = a.top + a.height * 0.3;
    const tx = b.left + b.width / 2;
    const ty = b.top + b.height / 2;
    const lift = Math.min(140, Math.abs(tx - fx) * 0.35 + 40);
    const el = document.createElement('div');
    el.className = 'ww-ballot';
    el.setAttribute('aria-hidden', 'true');
    document.body.appendChild(el);
    const anim = el.animate(
      [
        { transform: `translate(${fx}px, ${fy}px) rotate(0deg) scale(.6)`, opacity: 1 },
        { transform: `translate(${(fx + tx) / 2}px, ${Math.min(fy, ty) - lift}px) rotate(200deg) scale(1.2)`, opacity: 1, offset: 0.5 },
        { transform: `translate(${tx}px, ${ty}px) rotate(360deg) scale(.8)`, opacity: 1 },
      ],
      { duration: 420, easing: 'cubic-bezier(.5, 0, .3, 1)' },
    );
    anim.onfinish = () => el.remove();
    anim.oncancel = () => el.remove();
  }, [model.seats]);

  useEffect(() => {
    if (!isVoteResultPhase || !model.voteLedger) {
      setBallotCounts({});
      setCountingDone(false);
      setTearingSeatNo(null);
      return;
    }
    const tally: Record<string, number> = {};
    for (const row of model.voteLedger.rows) tally[row.playerId] = row.count;
    const seatOrder = new Map<string, number>(
      model.seats.map((s) => [s.playerId, Number(s.seatLabel.replace(/\D/g, '')) || 0] as const),
    );
    const queue = buildBallotQueue(tally, seatOrder);
    const level = document.documentElement.dataset.motionLevel ?? 'full';
    // reduced / minimal / off：不飞票，直接落定最终计数（契约 §5）
    if (level !== 'full' || queue.length === 0) {
      setBallotCounts(tally);
      setCountingDone(true);
      return;
    }
    let cancelled = false;
    const counts: Record<string, number> = {};
    let idx = 0;
    let timer = 0;
    const step = () => {
      if (cancelled) return;
      if (idx >= queue.length) {
        setCountingDone(true);
        return;
      }
      const targetId = queue[idx]!;
      idx += 1;
      flyBallotToSeat(targetId);
      counts[targetId] = (counts[targetId] ?? 0) + 1;
      setBallotCounts({ ...counts });
      timer = window.setTimeout(step, 480);
    };
    timer = window.setTimeout(step, 360);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [isVoteResultPhase, model.voteLedger, model.day, model.seats, flyBallotToSeat]);

  // 唱票落定后：撕票（full 档）+ 轻屏震
  useEffect(() => {
    if (!countingDone || !isVoteResultPhase || !model.voteLedger) return;
    if (model.voteLedger.outcome !== 'eliminated' || model.voteLedger.exiledSeat === null) return;
    const level = document.documentElement.dataset.motionLevel ?? 'full';
    const seatNo = model.voteLedger.exiledSeat + 1;
    if (level === 'full') {
      setTearingSeatNo(seatNo);
      const page = document.querySelector('.werewolf-native-page');
      page?.classList.add('ww-shake');
      const t1 = window.setTimeout(() => page?.classList.remove('ww-shake'), 280);
      const t2 = window.setTimeout(() => setTearingSeatNo(null), 700);
      return () => {
        window.clearTimeout(t1);
        window.clearTimeout(t2);
      };
    }
    return undefined;
  }, [countingDone, isVoteResultPhase, model.voteLedger]);

  // 投票 / 唱票 / 遗言阶段的票根表现
  const voteSeatPropsOf = useCallback(
    (seat: WerewolfSeatModel): {
      statusText: string | null;
      tone: 'default' | 'candidate' | 'top' | 'last-words';
      voteCount: number | null;
      torn: boolean;
    } => {
      if (isVotePhase) {
        if (!seat.alive) return { statusText: null, tone: 'default', voteCount: null, torn: false };
        if (pendingPick?.playerId === seat.playerId) {
          return { statusText: '已选择', tone: 'default', voteCount: null, torn: false };
        }
        const isCandidate = model.runoffCandidateIds.includes(seat.playerId);
        if (seat.isSelf) {
          return {
            statusText: model.voteProgress?.hasVoted ? '你 · 已投' : '你 · 未投',
            tone: isCandidate ? 'candidate' : 'default',
            voteCount: null,
            torn: false,
          };
        }
        return {
          statusText: isCandidate ? '平票 · 进加赛' : null,
          tone: isCandidate ? 'candidate' : 'default',
          voteCount: null,
          torn: false,
        };
      }
      if (isVoteResultPhase) {
        const count = ballotCounts[seat.playerId] ?? 0;
        let tone: 'default' | 'candidate' | 'top' = 'default';
        if (countingDone && model.voteLedger && count > 0) {
          const maxCount = Math.max(...model.voteLedger.rows.map((r) => r.count), 0);
          if (count === maxCount) {
            const tie = model.voteLedger.outcome === 'tie' || model.voteLedger.outcome === 'runoff_tie';
            tone = tie ? 'candidate' : 'top';
          }
        }
        const no = Number(seat.seatLabel.replace(/\D/g, '')) || 0;
        return {
          statusText: null,
          tone,
          voteCount: count > 0 ? count : null,
          torn: tearingSeatNo === no,
        };
      }
      if (isLastWordsPhase && seat.isSpeaking) {
        return { statusText: '🎙 发表遗言', tone: 'last-words', voteCount: null, torn: false };
      }
      return { statusText: null, tone: 'default', voteCount: null, torn: false };
    },
    [isVotePhase, isVoteResultPhase, isLastWordsPhase, pendingPick, model.runoffCandidateIds, model.voteProgress, ballotCounts, countingDone, model.voteLedger, tearingSeatNo],
  );

  const voteSceneLine = useMemo((): React.ReactNode => {
    if (isVotePhase) {
      if (pendingPick) return <>你选中了 <b>{pendingPick.seatLabel}</b>，点黄色按钮确认投票</>;
      if (model.voteProgress?.hasVoted) {
        const targetSeat = effectiveSeats.find((s) => s.isMyTarget);
        return targetSeat ? <>你投给了 <b>{targetSeat.seatLabel}</b>，等待全场结果</> : '你已完成投票，等待全场结果';
      }
      return model.phase === 'runoff_voting' ? '加赛只能投给平票候选人' : '点两侧票根选择放逐对象';
    }
    return null;
  }, [isVotePhase, pendingPick, model.voteProgress, model.phase, effectiveSeats]);

  // ── W06：发身份（契约 §4.7） ──
  const isRoleRevealPhase = model.phase === 'role_reveal';
  const [roleCardFlipped, setRoleCardFlipped] = useState(false);
  useEffect(() => {
    if (!isRoleRevealPhase) setRoleCardFlipped(false);
  }, [isRoleRevealPhase]);

  const roleRevealStatusOf = useCallback(
    (seat: WerewolfSeatModel): string | null => {
      if (!isRoleRevealPhase) return null;
      const confirmed = model.roleConfirmedIds.includes(seat.playerId);
      if (seat.isSelf) return confirmed ? '你 · 已确认' : '你 · 查看中';
      return confirmed ? '已确认' : '查看中';
    },
    [isRoleRevealPhase, model.roleConfirmedIds],
  );

  // ── W07：终局揭晓（契约 §4.7） ──
  const isGameOverPhase = model.phase === 'game_over';
  // 票根逐张翻面：full 档按座次 200ms/张；reduced/minimal/off 一次全亮
  const [revealedIds, setRevealedIds] = useState<ReadonlySet<string> | null>(null);
  useEffect(() => {
    if (!isGameOverPhase || !model.reveal) {
      setRevealedIds(null);
      return;
    }
    const ordered = [...model.reveal.rows].sort(
      (a, b) => (Number((a.seatLabel ?? '').replace(/\D/g, '')) || 0) - (Number((b.seatLabel ?? '').replace(/\D/g, '')) || 0),
    );
    const level = document.documentElement.dataset.motionLevel ?? 'full';
    if (level !== 'full' || ordered.length === 0) {
      setRevealedIds(new Set(ordered.map((r) => r.playerId)));
      return;
    }
    let cancelled = false;
    const acc = new Set<string>();
    let idx = 0;
    let timer = 0;
    const step = () => {
      if (cancelled) return;
      if (idx >= ordered.length) return;
      acc.add(ordered[idx]!.playerId);
      idx += 1;
      setRevealedIds(new Set(acc));
      timer = window.setTimeout(step, 200);
    };
    timer = window.setTimeout(step, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [isGameOverPhase, model.reveal]);

  const finaleSeatPropsOf = useCallback(
    (seat: WerewolfSeatModel): {
      tone: 'default' | 'winner' | 'loser';
      reveal: { artworkUrl: string; team: 'wolves' | 'village'; roleLabel: string; detail: string } | null;
    } => {
      if (!isGameOverPhase || !model.reveal || !revealedIds) return { tone: 'default', reveal: null };
      const row = model.reveal.rows.find((r) => r.playerId === seat.playerId);
      if (!row || !row.role || !row.team || !row.artworkUrl) return { tone: 'default', reveal: null };
      if (!revealedIds.has(seat.playerId)) return { tone: 'default', reveal: null };
      return {
        tone: model.winner && row.team === model.winner ? 'winner' : 'loser',
        reveal: {
          artworkUrl: row.artworkUrl,
          team: row.team,
          roleLabel: row.roleLabel,
          detail: row.detail ?? (seat.alive ? '存活' : '出局'),
        },
      };
    },
    [isGameOverPhase, model.reveal, model.winner, revealedIds],
  );

  const tonightSeerResult = useMemo(() => {
    if (model.self?.role !== 'seer' || !model.self.seerResults.length) return null;
    const tonight = model.self.seerResults.find((r) => r.night === model.day);
    const latest = model.self.seerResults[model.self.seerResults.length - 1];
    const targetResult = tonight ?? latest;
    if (!targetResult) return null;
    const isWolf = targetResult.team === 'wolves';
    return {
      night: targetResult.night,
      isTonight: targetResult.night === model.day,
      seatLabel: targetResult.seatLabel || '目标席位',
      name: targetResult.name || '目标玩家',
      isWolf,
      teamLabel: targetResult.teamLabel || (isWolf ? '狼人' : '好人'),
    };
  }, [model.self, model.day]);

  // 女巫毒杀确认后的本地记录（服务器不回显毒杀目标席位，done 行靠本地记忆）
  const [witchPoisonLog, setWitchPoisonLog] = useState<string | null>(null);
  useEffect(() => {
    setWitchPoisonLog(null);
  }, [model.phase, model.day]);

  const nightSceneLine = useMemo((): React.ReactNode => {
    if (!isNightScene) return null;
    if (isSleepView) {
      return self?.roleLabel
        ? <>你是 <b>{self.roleLabel}</b>，今夜无需操作</>
        : '法官正在依次唤醒各个身份，请不要出声';
    }
    if (model.phase === 'hunter_shot') {
      return pendingPick
        ? <>已选 <b>{pendingPick.seatLabel}</b>，点黄色按钮开枪</>
        : '你可以开枪带走一名存活玩家，或选择不开枪';
    }
    if (self?.role === 'wolf') {
      if (self.hasNightVoted) {
        const targetSeat = effectiveSeats.find((s) => s.isMyTarget);
        return targetSeat
          ? <>已锁定 <b>{targetSeat.seatLabel}</b>，等待同伴</>
          : '已锁定袭击目标，等待同伴';
      }
      return pendingPick
        ? <>已选 <b>{pendingPick.seatLabel}</b>，点黄色按钮确认</>
        : '选择今夜的猎物';
    }
    if (self?.role === 'seer') {
      if (tonightSeerResult?.isTonight) {
        return (
          <>
            <b>{tonightSeerResult.seatLabel}</b> 是{' '}
            <b className={tonightSeerResult.isWolf ? 'red' : 'good'}>{tonightSeerResult.isWolf ? '狼人' : '好人'}</b>
          </>
        );
      }
      return pendingPick
        ? <>已选 <b>{pendingPick.seatLabel}</b>，点黄色按钮确认</>
        : '选择一名玩家查验身份';
    }
    if (self?.role === 'witch') {
      if (self.witchSaveDecision === true && witchVictimSeatNo !== null) {
        return <>你救下了 <b>{witchVictimSeatNo}</b> 号</>;
      }
      if (self.witchPoisonUsed) {
        return witchPoisonLog
          ? <>你向 <b>{witchPoisonLog}</b> 下了毒</>
          : '毒药已使用';
      }
      if (self.witchSaveDecision === false && self.witchPoisonDecided) return '今夜不用药';
      if (self.witchSaveDecision === false) {
        return pendingPick
          ? <>已选 <b>{pendingPick.seatLabel}</b>，点黄色按钮确认</>
          : '选择要毒杀的目标，或选择今夜不用药';
      }
      return witchVictimSeatNo !== null
        ? <>今晚 <b className="red">{witchVictimSeatNo} 号 {self.nightVictimName}</b> 倒下了</>
        : '今夜无人遇袭';
    }
    if (self?.role === 'guard') {
      if (self.guardDecided) {
        const targetSeat = effectiveSeats.find((s) => s.isMyTarget);
        return targetSeat
          ? <>今夜守护 <b>{targetSeat.seatLabel}</b></>
          : '今夜守护已决断';
      }
      return pendingPick
        ? <>已选 <b>{pendingPick.seatLabel}</b>，点黄色按钮确认</>
        : '选择今夜守护的人';
    }
    return '等待法官唤醒你的身份';
  }, [isNightScene, isSleepView, self, model.phase, pendingPick, effectiveSeats, tonightSeerResult, witchVictimSeatNo, witchPoisonLog]);

  // 提取当前所有可用的全局/跳过/非目标动作
  const globalActions = useMemo(() => {
    const list: WerewolfActionOption[] = [];
    for (const group of model.actionGroups) {
      for (const opt of group.options) {
        const p = opt.payload as Record<string, unknown>;
        if (
          p.type === 'confirm_role' ||
          p.type === 'confirm_announcement' ||
          p.type === 'finish_speech' ||
          p.type === 'ready_vote' ||
          p.type === 'finish_last_words' ||
          p.targetPlayerId === null ||
          (p.type === 'witch_save' && p.save === false) ||
          (p.type === 'witch_save' && p.save === true)
        ) {
          list.push(opt);
        }
      }
    }
    return list;
  }, [model.actionGroups]);

  const actionHint = useMemo(() => {
    if (isMySpeaking) return '轮到你发言，发言完毕请交麦';
    if (model.phase === 'voting' || model.phase === 'runoff_voting') {
      return model.voteProgress?.hasVoted ? '你已完成投票，等待全场结果' : '点击席位投票，或在右侧选择弃票';
    }
    if (model.phase === 'night' && model.self?.role === 'wolf') {
      return model.self.hasNightVoted ? '已锁定袭击目标，等待同伴决断' : '点击席位选择今夜袭击目标';
    }
    if (model.phase === 'night' && model.self?.role === 'seer') {
      if (tonightSeerResult && tonightSeerResult.isTonight) {
        return `今夜查验完成：${tonightSeerResult.seatLabel} ${tonightSeerResult.name} 为【${tonightSeerResult.teamLabel}】`;
      }
      return '点击席位查验其所属阵营';
    }
    if (model.phase === 'night' && model.self?.role === 'guard') {
      return model.self.guardDecided ? '今夜守护已决断' : '点击席位守护，或在右侧选择空守';
    }
    return model.waitingHint || '静候下一阶段';
  }, [isMySpeaking, model, tonightSeerResult]);

  const aliveCount = effectiveSeats.filter((s) => s.alive).length;

  return (
    <div className="werewolf-native-page" data-ww-theme={resolvedTheme} data-theme={resolvedTheme} data-design="refined">
      {/* 浏览器自动播放拦截提示条 */}
      {judgeVoice.autoplayBlocked && (
        <button
          type="button"
          className="ww-sound-enable-hint"
          onClick={judgeVoice.enableAudio}
        >
          🔊 点击开启旁白声音
        </button>
      )}

      <header className="ww-topbar">
        <div className="ww-title-group">
          <span className="ww-brand-kicker">聚乐桌游</span>
          <h1>狼人杀</h1>
        </div>
        <div className="ww-round-status" aria-label="当前对局进度">
          <strong>{model.dayLabel}</strong>
          {/* 保留既有 .chapter 钩子（阶段文案容器），避免下游 e2e 选择器失效 */}
          <span className="chapter">{effectivePhaseLabel}</span>
          <span className="alive">存活 <b>{aliveCount}</b> 人</span>
        </div>
        <nav className="ww-tools" aria-label="快捷工具">
          <button type="button" id="werewolf-chat-btn" className="ww-chat-btn"
            onClick={() => window.dispatchEvent(new CustomEvent('ldj:open-chat'))}
            aria-label={chatUnread > 0 ? `打开对局交流，${chatUnread}条未读` : '打开对局交流'}>
            <MessageCircle size={18} aria-hidden="true" /><span className="ww-tool-label">交流</span>
            {chatUnread > 0 && <span className="ww-chat-badge">{chatUnread > 99 ? '99+' : chatUnread}</span>}
          </button>
          <button type="button" id="identity" onClick={() => setActiveModal('identity')} aria-label="查看我的身份">
            <IdCard size={18} aria-hidden="true" /><span className="ww-tool-label">身份</span>
          </button>
          {/* 票型记录并入顶栏（W02：原中央「上一轮票型」按钮已删除） */}
          <button type="button" id="ledger" onClick={() => setActiveModal('ledger')} aria-label="查看票型记录">
            <ScrollText size={18} aria-hidden="true" /><span className="ww-tool-label">记录</span>
          </button>
          <button type="button" id="rules" onClick={() => setActiveModal('rules')} aria-label="查看对局规则">
            <BookOpen size={18} aria-hidden="true" /><span className="ww-tool-label">规则</span>
          </button>
          <button type="button" id="settings" onClick={() => setSettingsOpen(true)} aria-label="打开对局设置">
            <Settings2 size={18} aria-hidden="true" /><span className="ww-tool-label">设置</span>
          </button>
        </nav>
      </header>

      <main className="layout" data-view={isSleepView ? 'sleep' : undefined}>
        {/* 左侧包厢栏 */}
        <aside id="seats-left" className="box-rail seat-rail" aria-label="左侧席位">
          {seatRails.left.map((seat) => {
            const nightProps = nightSeatPropsOf(seat);
            const voteProps = voteSeatPropsOf(seat);
            const finaleProps = finaleSeatPropsOf(seat);
            return (
              <TicketSeat
                key={seat.playerId}
                seat={seat}
                compact={compact}
                statusText={voteProps.statusText ?? nightProps.statusText ?? roleRevealStatusOf(seat) ?? speechStatusOf(seat)}
                stamp={nightProps.stamp}
                nightMark={nightProps.nightMark}
                disabledTarget={nightProps.disabledTarget}
                picked={pendingPick?.playerId === seat.playerId}
                tone={finaleProps.tone !== 'default' ? finaleProps.tone : voteProps.tone}
                voteCount={voteProps.voteCount}
                torn={voteProps.torn}
                reveal={finaleProps.reveal}
                matePaw={self?.role === 'wolf' && seat.isWolfTeammate ? '🐾' : null}
                pickable={!isSleepView && seat.targetActions.length > 0}
                onSelect={handleSeatClick}
                busy={busy}
                synced={synced}
              />
            );
          })}
        </aside>

        {/* 中央剧场舞台 */}
        <TheatreStage period={period} centerClassName="art">
          {/*
            W03：白天发言 / 自由发言 / 天亮公告 → SpeakerSpotlight。
            W04：入夜 / 夜间行动 / 猎人开枪 → NightWake（替换原 RoleTurnOverlay 中央占位，
            出场节奏由 ww-wake 的 art-in 承担；RoleTurnOverlay 组件文件保留但不再调用）。
            投票（W05）/ 发身份（W06）/ 终局（W07）暂留旧文本，后续任务逐一替换。
          */}
          {isNightScene && actingNightRole && (
            <NightWake
              roleKey={actingNightRole}
              kicker={
                model.phase === 'hunter_shot'
                  ? `第 ${model.day} 天 · 猎人决断`
                  : `第 ${model.day} 夜 · ${isMyNightTurn ? '你被唤醒' : '请保持闭眼'}`
              }
              big={
                model.phase === 'hunter_shot'
                  ? (isMyNightTurn ? '猎人请睁眼' : '猎人正在决断')
                  : isMyNightTurn
                    ? `${WEREWOLF_ROLE_NAMES[actingNightRole]}请睁眼`
                    : `${WEREWOLF_ROLE_NAMES[actingNightRole]}正在行动`
              }
              line={nightSceneLine}
              artworkUrl={WEREWOLF_ROLE_ARTWORK[actingNightRole]}
              sleeping={isSleepView}
              timerSeconds={displaySeconds}
              timerTotal={timerTotalRef.current || displaySeconds}
              timerNote={timerNote}
              enterKey={`${model.day}:${actingNightRole}:${isMyNightTurn ? 'me' : 'wait'}`}
            >
              {model.phase === 'night' && self?.role === 'witch' && isMyNightTurn && !self.witchSaveUsed && !self.witchPoisonUsed && self.witchSaveDecision === null && witchVictimSeatNo !== null && (
                <div className="ww-potions" role="group" aria-label="女巫药瓶">
                  <button
                    type="button"
                    className={`ww-potion${witchPotion === 'save' ? ' is-on' : ''}`}
                    aria-pressed={witchPotion === 'save'}
                    disabled={busy || !synced}
                    onClick={() => setWitchPotion(witchPotion === 'save' ? null : 'save')}
                  >
                    💧 解药
                  </button>
                  <button
                    type="button"
                    className={`ww-potion${witchPotion === 'poison' ? ' is-on' : ''}`}
                    aria-pressed={witchPotion === 'poison'}
                    disabled={busy || !synced}
                    onClick={() => {
                      if (witchPotion === 'poison') { setWitchPotion(null); return; }
                      setWitchPotion('poison');
                      // 选毒药 = 放弃解药（服务端要求先决断解药再出现毒药目标）
                      if (self.witchSaveDecision === null && witchSaveNo) handleAct(witchSaveNo.payload);
                    }}
                  >
                    ☠ 毒药
                  </button>
                </div>
              )}
              {model.phase === 'night' && self?.role === 'witch' && isMyNightTurn && (self.witchSaveUsed || self.witchPoisonUsed) && (
                <div className="ww-potions" role="group" aria-label="女巫药瓶">
                  <span className={`ww-potion${self.witchSaveUsed ? ' used' : ''}`}>💧 解药</span>
                  <span className={`ww-potion${self.witchPoisonUsed ? ' used' : ''}`}>☠ 毒药</span>
                </div>
              )}
            </NightWake>
          )}

          {model.phase === 'discussion' && !speakingSeat && (
            <SpeakerSpotlight
              kicker="轮流发言"
              big={effectivePhaseLabel}
              sub="等待发言开始"
              timerSeconds={displaySeconds}
              timerTotal={timerTotalRef.current || displaySeconds}
              timerNote={timerNote}
            />
          )}

          {model.phase === 'discussion' && speakingSeat && (
            <SpeakerSpotlight
              kicker="正在发言"
              portraitUrl={getSpeakerIllustrationUrl(speakingSeat.avatar, speakingSeat.seatLabel)}
              big={speakingSeat.isSelf ? '轮到你了' : speakingSeat.name}
              sub={
                <>
                  {speakingSeat.seatLabel} · 第 <b>{model.speechOrderIndex + 1}</b>
                  {' / '}{model.speakingOrderIds.length || aliveCount} 位发言
                </>
              }
              timerSeconds={displaySeconds}
              timerTotal={timerTotalRef.current || displaySeconds}
              timerNote={timerNote}
              slamKey={`${model.day}:${speakingSeat.playerId}`}
            />
          )}

          {model.phase === 'free_discussion' && (
            <SpeakerSpotlight
              kicker="自由发言"
              big="自由讨论"
              sub={
                <>
                  已准备投票 <b>{model.freeDiscussionReadyCount ?? 0}</b>{' / '}{aliveCount} 人
                </>
              }
              timerSeconds={displaySeconds}
              timerTotal={timerTotalRef.current || displaySeconds}
              timerNote={timerNote}
              slamKey={`${model.day}:free`}
            />
          )}

          {model.phase === 'day_announcement' && (
            <SpeakerSpotlight
              kicker="天亮了"
              big={
                model.nightDeathSeats.length === 0
                  ? '昨夜平安'
                  : `${model.nightDeathSeats.map((seat) => `${seat + 1} 号`).join('、')} 出局`
              }
              sub={model.nightDeathSeats.length > 0 ? '身份将在终局揭晓，请开始今天的发言' : '无人出局，请开始今天的发言'}
              timerSeconds={displaySeconds}
              timerTotal={timerTotalRef.current || displaySeconds}
              timerNote={timerNote}
              slamKey={`${model.day}:announce`}
            />
          )}

          {/* W06：发身份 → 中央大牌点击翻面 */}
          {isRoleRevealPhase && self && (
            <RoleDealCard
              kicker="第 1 夜之前 · 查看你的身份"
              roleLabel={self.roleLabel}
              team={self.role === 'wolf' ? 'wolves' : 'village'}
              teamLabel={self.role === 'wolf' ? '狼人阵营' : '好人阵营'}
              skill={WEREWOLF_ROLE_DETAILS[self.role]?.skill ?? ''}
              artworkUrl={self.artworkUrl}
              confirmedCount={model.roleRevealProgress?.confirmed ?? 0}
              totalCount={model.roleRevealProgress?.total ?? effectiveSeats.length}
              onFlipChange={setRoleCardFlipped}
            />
          )}
          {isRoleRevealPhase && !self && (
            <SpeakerSpotlight
              kicker="第 1 夜之前"
              big="发放身份中"
              sub={`已确认 ${model.roleRevealProgress?.confirmed ?? 0} / ${model.roleRevealProgress?.total ?? effectiveSeats.length} 人`}
            />
          )}

          {/* W05：放逐投票 → 票箱 + 进度点 */}
          {isVotePhase && (
            <VoteUrn
              kicker={`第 ${model.day} 天 · ${model.phase === 'runoff_voting' ? '加赛放逐投票' : '放逐投票'}`}
              big={
                pendingPick
                  ? `你选中了 ${pendingPick.seatLabel}`
                  : model.voteProgress?.hasVoted
                    ? '等待全场结果'
                    : '投出你心中的狼'
              }
              line={
                <>
                  已投 <b>{model.voteProgress?.submitted ?? 0}</b>{' / '}{model.voteProgress?.expected ?? aliveCount} 人 ·{' '}
                  {voteSceneLine ?? '可以弃票'}
                </>
              }
              submitted={model.voteProgress?.submitted ?? 0}
              expected={model.voteProgress?.expected ?? aliveCount}
              peek={Boolean(model.voteProgress?.hasVoted) || pendingPick !== null}
              timerSeconds={displaySeconds}
              timerTotal={timerTotalRef.current || displaySeconds}
              timerNote={timerNote}
            />
          )}

          {/* W05：唱票 → 票箱开箱 + 逐票落定（飞票动效在播放 effect 中） */}
          {isVoteResultPhase && model.voteLedger && (
            <VoteCount
              kicker="唱票"
              big={
                !countingDone
                  ? '正在开箱…'
                  : model.voteLedger.outcome === 'eliminated' && model.voteLedger.exiledSeat !== null
                    ? `${model.voteLedger.exiledSeat + 1} 号得票最多`
                    : model.voteLedger.outcome === 'idiot_saved'
                      ? '最高票翻牌免死'
                      : model.voteLedger.outcome === 'tie'
                        ? '平票'
                        : model.voteLedger.outcome === 'runoff_tie'
                          ? '加赛仍平票'
                          : '无人得票'
              }
              line={
                countingDone
                  ? <>
                      {model.voteLedger.headline} · 弃票 <b>{model.voteLedger.abstained}</b>
                    </>
                  : '票会一张张飞到被投的人身上'
              }
              timerSeconds={displaySeconds}
              timerTotal={timerTotalRef.current || displaySeconds}
              timerNote={timerNote}
            />
          )}

          {/* W05：遗言 → 追光聚在被放逐者身上 */}
          {isLastWordsPhase && (() => {
            const lwSeat = effectiveSeats.find((s) => s.isSpeaking);
            if (!lwSeat) return null;
            return (
              <SpeakerSpotlight
                kicker="遗言"
                portraitUrl={getSpeakerIllustrationUrl(lwSeat.avatar, lwSeat.seatLabel)}
                big={lwSeat.isSelf ? '轮到你说遗言' : lwSeat.name}
                sub={<>{lwSeat.seatLabel} · 最后说几句</>}
                timerSeconds={displaySeconds}
                timerTotal={timerTotalRef.current || displaySeconds}
                timerNote={timerNote}
                slamKey={`${model.day}:lastwords:${lwSeat.playerId}`}
              />
            );
          })()}

          {/* W07：终局揭晓 → 胜负盖章 + 胜方阵容 + 逐日票型 */}
          {isGameOverPhase && model.reveal && (
            <FinaleReveal
              winner={model.winner}
              aborted={false}
              day={model.day}
              banner={model.winner === 'village' ? '好人胜利' : model.winner === 'wolves' ? '狼人胜利' : model.reveal.headline}
              line={
                self
                  ? <>
                      你是 <b>{self.roleLabel}</b>，
                      {model.winner && ((self.role === 'wolf') === (model.winner === 'wolves'))
                        ? <b className="good">你赢了</b>
                        : <b className="red">你输了</b>}
                    </>
                  : model.reveal.headline
              }
              lineup={model.winnerLineup ?? []}
              days={model.finaleDays}
              slamKey={`finale:${model.day}`}
            />
          )}

          {/* 尚未迁移的阶段：无（W03–W07 全部迁移完成；.speaker / .stage-top 兜底保留给未知阶段） */}
          {['discussion', 'free_discussion', 'day_announcement', 'night', 'hunter_shot', 'voting', 'runoff_voting', 'vote_result', 'last_words', 'role_reveal', 'game_over'].includes(model.phase) ? null : (
            <div className="speaker">
              <span className="speaker-tag">
                {speakingSeat
                  ? `● ${speakingSeat.seatLabel} · 正在发言`
                  : isNightVoiceRunning
                    ? `☾ ${effectivePhaseLabel}`
                    : `● ${effectivePhaseLabel}`}
              </span>
              <h1 tabIndex={-1}>
                {speakingSeat ? speakingSeat.name : effectivePhaseLabel}
              </h1>
              <p id="tagline">{effectiveNarrative}</p>
            </div>
          )}

          {/* W02 遗留的 kicker + 计时块：迁移过的阶段（W03–W06）不再渲染；待 W07 迁移终局后整体删除 */}
          {['discussion', 'free_discussion', 'day_announcement', 'night', 'hunter_shot', 'voting', 'runoff_voting', 'vote_result', 'last_words', 'role_reveal', 'game_over'].includes(model.phase) ? null : (
          <div className="stage-top">
            <span id="kicker">{effectivePhaseLabel}</span>
            <span className="time">
              {authoritativeTimer !== null ? (
                authoritativeTimer.status === 'paused' ? (
                  <>已暂停 <small>{authoritativeTimer.secondsLeft}s</small></>
                ) : authoritativeTimer.status === 'waiting' ? (
                  <>等待主持人</>
                ) : authoritativeTimer.status === 'broadcasting' ? (
                  <>正在播报</>
                ) : authoritativeTimer.status === 'counting' ? (
                  <>{authoritativeTimer.secondsLeft}s <small>剩余时间</small></>
                ) : (
                  <>--:--</>
                )
              ) : (
                <>{formattedTime} <small>剩余时间</small></>
              )}
            </span>
          </div>
          )}

        </TheatreStage>

        {/* 右侧包厢栏（自下而上排） */}
        <aside id="seats-right" className="box-rail seat-rail" aria-label="右侧席位">
          {seatRails.right.map((seat) => {
            const nightProps = nightSeatPropsOf(seat);
            const voteProps = voteSeatPropsOf(seat);
            const finaleProps = finaleSeatPropsOf(seat);
            return (
              <TicketSeat
                key={seat.playerId}
                seat={seat}
                compact={compact}
                statusText={voteProps.statusText ?? nightProps.statusText ?? roleRevealStatusOf(seat) ?? speechStatusOf(seat)}
                stamp={nightProps.stamp}
                nightMark={nightProps.nightMark}
                disabledTarget={nightProps.disabledTarget}
                picked={pendingPick?.playerId === seat.playerId}
                tone={finaleProps.tone !== 'default' ? finaleProps.tone : voteProps.tone}
                voteCount={voteProps.voteCount}
                torn={voteProps.torn}
                reveal={finaleProps.reveal}
                matePaw={self?.role === 'wolf' && seat.isWolfTeammate ? '🐾' : null}
                pickable={!isSleepView && seat.targetActions.length > 0}
                onSelect={handleSeatClick}
                busy={busy}
                synced={synced}
              />
            );
          })}
        </aside>
      </main>

      {/* 底部操作与身份卡入口 */}
      <footer className="ww-stage-dock">
        <button
          id="identity-footer"
          className="identity"
          onClick={() => setActiveModal('identity')}
        >
          <span>☾</span>
          <span>
            我的身份
            <small>仅自己查看</small>
          </span>
        </button>
        <p>
          {actionHint}
          <br />
          <small>说出判断，也听见不同的声音。</small>
        </p>
        <div className="ww-footer-actions">
          {/* W07：终局——完整复盘只经此按钮弹窗（不再自动弹出） */}
          {isGameOverPhase && model.reveal !== null && (
            <GameOverReveal reveal={model.reveal} seats={model.seats} autoOpen={false} />
          )}
          {/* W04/W05 两步确认：点票根选中后，唯一黄色主按钮发送 */}
          {pendingPick && (
            <button
              key="confirm-pick"
              type="button"
              disabled={busy || !synced}
              className="ww-global-action-btn primary"
              onClick={() => {
                const type = String((pendingPick.payload as Record<string, unknown>).type ?? '');
                if (type === 'witch_poison') setWitchPoisonLog(pendingPick.seatLabel);
                handleAct(pendingPick.payload);
                setPendingPick(null);
              }}
            >
              {pendingPick.confirmLabel} <span>→</span>
            </button>
          )}
          {/* 女巫选了解药：黄色「用解药救 N 号」 */}
          {!pendingPick && witchPotion === 'save' && witchSaveYes && (
            <button
              key="confirm-save"
              type="button"
              disabled={busy || !synced}
              className="ww-global-action-btn primary"
              onClick={() => {
                handleAct(witchSaveYes.payload);
                setWitchPotion(null);
              }}
            >
              用解药救 {witchVictimSeatNo} 号 <span>→</span>
            </button>
          )}
          {(() => {
            // 女巫回合：解药/毒药的决断由中央药瓶 + 黄色按钮驱动，save_yes/skip_save 不再直出
            const hideWitchSave = model.phase === 'night' && self?.role === 'witch' && isMyNightTurn;
            const visible = globalActions.filter((action) => {
              if (hideWitchSave && (action.id === 'save_yes' || action.id === 'skip_save')) return false;
              // W06：发身份——翻开牌面之前不出黄色「我已记住身份并就绪」
              if (isRoleRevealPhase && action.payload.type === 'confirm_role' && !roleCardFlipped) return false;
              // 毒药决断进行中：毒药跳过按钮保留作「今夜不用药」次要按钮
              return true;
            });
            return visible.length > 0 ? (
              visible.map((action) => {
                const isDanger = action.id.includes('abstain') || action.id.includes('skip') || action.label.includes('弃票') || action.label.includes('不用') || action.label.includes('空守');
                const isPrimary = action.id.includes('confirm') || action.id.includes('finish') || action.id.includes('ready') || action.id.includes('save_yes');
                // 契约 §4.5 / §4.4：按钮展示层文案
                const displayLabel = action.id === 'finish_speech' ? '发言完毕 · 交麦'
                  : action.id === 'skip_guard' ? '空守'
                  : action.id === 'shoot_skip' ? '不开枪'
                  : action.label;
                return (
                  <button
                    key={action.id}
                    type="button"
                    disabled={busy || !synced}
                    className={`ww-global-action-btn ${isDanger ? 'is-danger' : isPrimary ? 'primary' : ''}`}
                    onClick={() => handleAct(action.payload)}
                  >
                    {displayLabel} {isPrimary && <span>→</span>}
                  </button>
                );
              })
            ) : (!pendingPick && witchPotion !== 'save') ? (
              /* 契约 §4.0：每视口唯一黄色主按钮；等待态只是信息提示，不用黄色 */
              <button
                id="finish"
                className="ww-global-action-btn"
                disabled={true}
              >
                等待阶段推进 <span>…</span>
              </button>
            ) : null;
          })()}
        </div>
      </footer>

      {/* 模态弹窗系统：规则 / 身份底牌 / 票型记录 / 目标操作 */}
      <dialog
        ref={dialogRef}
        id="dialog"
        aria-labelledby="dialog-title"
        onClick={(e) => {
          if (e.target === dialogRef.current) setActiveModal(null);
        }}
      >
        {activeModal === 'rules' && (
          <>
            <h2 id="dialog-title">本局规则与角色配置</h2>
            <div id="dialog-body">
              <p>
                <strong>配置：</strong>
                {model.seats.length} 人对局（
                {model.rolesConfig.guard ? '守卫、' : ''}
                {model.rolesConfig.hunter ? '猎人、' : ''}
                {model.rolesConfig.idiot ? '白痴、' : ''}
                预言家、女巫、村民与狼人）。
              </p>
              <p>
                <strong>昼夜交替：</strong>
                夜晚秘密行动，白天依次发言并公投放逐嫌疑人。好人阵营放逐所有狼人获胜，狼人击败所有村民或所有神职获胜。
              </p>
            </div>
            <button
              type="button"
              className="dialog-close-btn"
              onClick={() => setActiveModal(null)}
            >
              收起并返回
            </button>
          </>
        )}

        {activeModal === 'identity' && (
          <>
            <h2 id="dialog-title">
              {model.self ? `${model.self.roleLabel} · ${model.self.role === 'wolf' ? '狼人阵营' : '好人阵营'}` : '观战视角'}
            </h2>
            <div id="dialog-body">
              {model.self ? (
                <>
                  {model.self.artworkUrl && (
                    <img src={model.self.artworkUrl} alt={model.self.roleLabel} />
                  )}
                  <p>
                    <strong>技能说明：</strong>
                    {WEREWOLF_ROLE_DETAILS[model.self.role]?.skill ?? '无特殊技能'}
                  </p>
                  <p>
                    <strong>专属提示：</strong>
                    {model.self.roleHint}
                  </p>
                  {model.self.role === 'seer' && (
                    <div className="ww-seer-history-box">
                      <p>历次查验线索：</p>
                      {model.self.seerResults.length === 0 ? (
                        <p className="ww-seer-history-empty">尚未进行查验，今晚行动后将在此展示。</p>
                      ) : (
                        <div className="ww-seer-history-list">
                          {model.self.seerResults.map((r, idx) => {
                            const isWolf = r.team === 'wolves';
                            return (
                              <div
                                key={idx}
                                className={`ww-seer-history-row ${isWolf ? 'is-wolf' : 'is-good'}`}
                              >
                                <span>第 {r.night} 夜 · {r.seatLabel} {r.name}</span>
                                <strong>
                                  {isWolf ? '🐺 狼人（坏人）' : '✨ 好人（好人）'}
                                </strong>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                  <p className="ww-identity-privacy-note">
                    提示：离开此页面或失焦时身份卡自动隐藏，保护暗牌私密性。
                  </p>
                </>
              ) : (
                <p>当前处于观战视角，无底牌身份。</p>
              )}
            </div>
            <button
              type="button"
              className="dialog-close-btn"
              onClick={() => setActiveModal(null)}
            >
              收起身份卡
            </button>
          </>
        )}

        {activeModal === 'ledger' && (
          <>
            <h2 id="dialog-title">票型记录</h2>
            <div id="dialog-body">
              {model.voteLedger?.headline ? (
                <p className="ww-ledger-headline">{model.voteLedger.headline}</p>
              ) : null}
              {model.voteLedger?.rows && model.voteLedger.rows.length > 0 ? (
                model.voteLedger.rows.map((row, idx) => (
                  <p key={idx}>
                    <strong>{row.name}</strong>：{row.count} 票
                  </p>
                ))
              ) : (
                <p>本局尚未产生公投记录。</p>
              )}
              {model.voteLedger?.abstained ? (
                <p>弃票：{model.voteLedger.abstained} 人</p>
              ) : null}
              <p className="ww-ledger-privacy-note">
                只公开每人得了几票，不公开谁投了谁。
              </p>
            </div>
            <button
              type="button"
              className="dialog-close-btn"
              onClick={() => setActiveModal(null)}
            >
              收起并返回
            </button>
          </>
        )}

        {activeModal === 'target' && targetSeat && (
          <div className="ww-target-dialog">
            <h2 id="dialog-title">
              {targetSeat.seatLabel} · {targetSeat.name}
            </h2>
            <p>
              状态：{!targetSeat.alive ? '已出局' : targetSeat.isSpeaking ? '正在发言' : '存活'}
            </p>
            {targetSeat.targetActions.length > 0 ? (
              <div className="ww-target-actions">
                {targetSeat.targetActions.map((action) => (
                  <button
                    key={action.id}
                    type="button"
                    disabled={busy || !synced}
                    className={`ww-target-btn ${
                      action.label.includes('袭击') || action.label.includes('毒杀') || action.label.includes('放逐') || action.label.includes('开枪')
                        ? 'danger'
                        : action.label.includes('救') || action.label.includes('守护')
                          ? 'safe'
                          : ''
                    }`}
                    onClick={() => {
                      setActiveModal(null);
                      handleAct(action.payload);
                    }}
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            ) : (
              <p className="ww-target-empty">
                当前阶段无针对该玩家的操作。
              </p>
            )}
            <button
              type="button"
              className="dialog-close-btn"
              onClick={() => setActiveModal(null)}
            >
              返回桌面
            </button>
          </div>
        )}
      </dialog>

      {/* 错误提示 Toast */}
      {error && (
        <aside className="ww-error-toast" role="alert">
          {error}
        </aside>
      )}
      {/* 设置抽屉 */}
      <WerewolfSettingsDrawer
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onShowRules={() => setActiveModal('rules')}
        isHost={isHost}
      />
    </div>
  );
}
