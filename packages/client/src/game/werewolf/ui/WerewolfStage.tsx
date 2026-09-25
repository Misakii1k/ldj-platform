import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { WerewolfPresentationModel, WerewolfSeatModel, WerewolfActionOption } from '../presentation.ts';
import { WEREWOLF_ROLE_DETAILS, WEREWOLF_ROLE_NAMES } from '../presentation.ts';
import { GameOverReveal } from './GameOverReveal.tsx';
import { RoleTurnOverlay } from './RoleTurnOverlay.tsx';
import { useJudgeVoice } from './useJudgeVoice.ts';
import { judgeVoice as judgeVoicePlayer } from './judgeVoice.ts';
import { BookOpen, MessageCircle, Settings2 } from 'lucide-react';
import { useConnection } from '../../../connection/useConnection.ts';
import { formatTimelineTimer } from '../../../shared-ui/serverClock.ts';
import { useWerewolfTheme } from '../WerewolfThemeProvider.tsx';
import { WerewolfSettingsDrawer } from './WerewolfSettingsDrawer.tsx';

export type WerewolfThemeKey = 'woodcut' | 'eclipse' | 'theatre';

interface WerewolfStageProps {
  readonly model: WerewolfPresentationModel;
  readonly synced: boolean;
  readonly busy: boolean;
  readonly error: string | null;
  readonly onAct: (payload: unknown) => void;
}

const THEME_DATA = {
  woodcut: {
    edition: 'THE FOREST FABLE',
    caption: '没有人，能够置身故事之外。',
    tableCaption: 'TWELVE VOICES',
    kickerPrefix: 'CHAPTER',
    kickerSuffix: '林中证词',
    taglineDefault: '森林记得每一个声音。',
  },
  eclipse: {
    edition: 'THE ECLIPSE RITUAL',
    caption: '月亮隐去的，是谁的秘密。',
    tableCaption: 'THE CONSTELLATION',
    kickerPrefix: 'LUNAR',
    kickerSuffix: '月下誓言',
    taglineDefault: '在月光缺席之前，留下你的判断。',
  },
  theatre: {
    edition: 'THE CRIMSON STAGE',
    caption: '幕布落下之前，真相还未谢幕。',
    tableCaption: 'THE COMPANY',
    kickerPrefix: 'ACT',
    kickerSuffix: '人人皆有台词',
    taglineDefault: '灯光之下，每句话都有回声。',
  },
} as const;

export function WerewolfStage({ model, synced, busy, error, onAct }: WerewolfStageProps) {
  // 1. 响应全局主题对（Forest / Theatre）与昼夜派生主题
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

  // 双翼席位分配（左半场与右半场）
  const seatRails = useMemo(() => {
    const leftCount = Math.ceil(effectiveSeats.length / 2);
    return {
      left: effectiveSeats.slice(0, leftCount),
      right: effectiveSeats.slice(leftCount),
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

  const lastSeatClickTimeRef = useRef(0);
  const handleSeatClick = useCallback((seat: WerewolfSeatModel) => {
    const now = Date.now();
    if (now - lastSeatClickTimeRef.current < 350) return;
    if (busy || !synced) return;
    lastSeatClickTimeRef.current = now;
    const singleAction = seat.targetActions[0];
    if (seat.targetActions.length === 1 && singleAction) {
      handleAct(singleAction.payload);
    } else {
      setTargetSeat(seat);
      setActiveModal('target');
    }
  }, [busy, synced, handleAct]);

  const isMySpeaking = speakingSeat?.isSelf;

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

  const themeMeta = useMemo(() => {
    if (resolvedTheme === 'eclipse-night') return THEME_DATA.eclipse;
    if (resolvedTheme === 'theatre-night' || resolvedTheme === 'theatre-day') return THEME_DATA.theatre;
    return THEME_DATA.woodcut;
  }, [resolvedTheme]);

  const aliveCount = effectiveSeats.filter((s) => s.alive).length;

  return (
    <div className="werewolf-native-page" data-ww-theme={resolvedTheme} data-theme={resolvedTheme} data-design="refined">
      {/* 浏览器自动播放拦截提示条 */}
      {judgeVoice.autoplayBlocked && (
        <button
          type="button"
          className="ww-sound-enable-hint"
          onClick={judgeVoice.enableAudio}
          style={{
            position: 'fixed',
            top: '48px',
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'var(--card, #272d40)',
            color: 'var(--text, #f0edf6)',
            border: '1.5px solid var(--active, #245844)',
            borderRadius: '20px',
            padding: '4px 14px',
            fontSize: '12px',
            zIndex: 90,
            cursor: 'pointer',
            boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
          }}
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
          <span>{effectivePhaseLabel}</span>
        </div>
        <nav className="ww-tools" aria-label="快捷工具">
          <button type="button" id="werewolf-chat-btn" className="ww-chat-btn"
            onClick={() => window.dispatchEvent(new CustomEvent('ldj:open-chat'))}
            aria-label={chatUnread > 0 ? `打开对局交流，${chatUnread}条未读` : '打开对局交流'}>
            <MessageCircle size={18} aria-hidden="true" /><span>交流</span>
            {chatUnread > 0 && <span className="ww-chat-badge">{chatUnread > 99 ? '99+' : chatUnread}</span>}
          </button>
          <button type="button" id="rules" onClick={() => setActiveModal('rules')} aria-label="查看对局规则">
            <BookOpen size={18} aria-hidden="true" /><span>规则</span>
          </button>
          <button type="button" id="settings" onClick={() => setSettingsOpen(true)} aria-label="打开对局设置">
            <Settings2 size={18} aria-hidden="true" /><span>设置</span>
          </button>
        </nav>
      </header>

      <main>
        <div className="ww-table-meta">
          <span>{themeMeta.kickerSuffix}</span>
          <span className="table-summary">{aliveCount} / {effectiveSeats.length} 存活</span>
        </div>

        {/* 1:1 双翼布局与中央对局舞台 */}
        <div className="layout">
          {/* 左半场席位轨 */}
          <aside id="seats-left" className="seat-rail" aria-label="左侧席位">
            {seatRails.left.map((seat) => {
              const seatNum = Number(seat.seatLabel.replace(/\D/g, '')) - 1;
              const hasAction = seat.targetActions.length > 0;
              const seerClass = seat.seerResultTeam ? `seer-${seat.seerResultTeam}` : '';
              return (
                <button
                  key={seat.playerId}
                  className={`seat ${seat.isSpeaking ? 'active' : ''} ${!seat.alive ? 'out' : ''} ${seat.isSelf ? 'is-self' : ''} ${hasAction ? 'is-actionable' : ''} ${seat.isMyTarget ? 'is-my-target' : ''} ${seerClass}`}
                  data-seat={seatNum}
                  onClick={() => handleSeatClick(seat)}
                  aria-label={`${seat.seatLabel} ${seat.name}，${!seat.alive ? '已出局' : seat.isSpeaking ? '正在发言' : '存活'}${seat.seerResultLabel ? `，查验为${seat.seerResultLabel}` : ''}`}
                >
                  <b>{String(seatNum + 1).padStart(2, '0')}</b>
                  <span className="name">{seat.name}</span>
                  {seat.seerResultLabel && (
                    <span className={`ww-seer-pill ${seat.seerResultTeam === 'wolves' ? 'is-wolf' : 'is-good'}`}>
                      {seat.seerResultTeam === 'wolves' ? '🐺 狼人' : '✨ 好人'}
                    </span>
                  )}
                  <small>
                    {!seat.alive
                      ? '— 已出局'
                      : seat.isSpeaking
                        ? '● 发言中'
                        : seat.seerResultLabel
                          ? `✓ ${seat.seerResultLabel}`
                          : seat.isMyTarget
                            ? '✓ 已选择'
                            : hasAction
                              ? `● ${seat.targetActions[0]?.label ?? '可操作'}`
                              : '· 存活'}
                  </small>
                </button>
              );
            })}
          </aside>

          {/* 中央聚焦舞台 */}
          <section className="stage">
            <div className="stage-top">
              <span id="kicker">
                {themeMeta.kickerPrefix} {model.day || 'I'} · {effectivePhaseLabel}
              </span>
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

            {/* 终局胜利复盘 or 矢量艺术大舞台 */}
            {model.reveal !== null ? (
              <GameOverReveal reveal={model.reveal} seats={model.seats} />
            ) : (
              <div className="art" aria-hidden="true">
                <RoleTurnOverlay
                  role={model.timeline?.period === 'night' ? model.timeline.role : null}
                  segment={model.timeline?.segment ?? null}
                  timelineId={model.timeline ? `${model.day}:${model.timeline.role}` : null}
                  period={model.timeline?.period ?? null}
                />
                {/* 林中木刻（Forest Woodcut） */}
                <svg className="forest" viewBox="0 0 600 400">
                  <defs>
                    <pattern id="cuts" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(23)">
                      <path d="M0 0V8" stroke="currentColor" strokeWidth="2" />
                    </pattern>
                  </defs>
                  <circle cx="308" cy="148" r="108" fill="currentColor" />
                  <path
                    d="M0 380L40 25 70 380M70 400L112 62 150 400M438 400L477 25 520 400M510 400L565 5 605 400"
                    fill="var(--desk)"
                    stroke="currentColor"
                    strokeWidth="3"
                  />
                  <path
                    d="M218 320L213 118 277 179 329 171 392 99 374 312 305 368Z"
                    fill="var(--desk)"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    d="M230 142L276 191 240 246M374 126L330 193 361 247M240 257L279 270 265 243M363 257L325 270 340 243M277 307L304 326 331 305 305 350Z"
                    fill="currentColor"
                  />
                  <path
                    d="M226 290L283 340M228 302L273 348M370 286L327 338M367 302L337 345"
                    stroke="currentColor"
                    strokeWidth="2"
                  />
                  <path
                    d="M0 380L40 25 70 380M438 400L477 25 520 400"
                    fill="url(#cuts)"
                  />
                  <path d="M140 370Q300 395 453 367" stroke="currentColor" fill="none" />
                </svg>

                {/* 月蚀星轨（Astral Eclipse） */}
                <div className="astral">
                  <div className="orbit o1" />
                  <div className="orbit o2" />
                  <div className="orbit o3" />
                  <span className="star s1">✦</span>
                  <span className="star s2">✧</span>
                  <div className="moon" />
                  <span className="lunar-label">☽ &nbsp; {model.day || 'III'} &nbsp; ☾</span>
                </div>

                {/* 赤幕剧场（Crimson Stage） */}
                <div className="theatre">
                  <div className="drape left" />
                  <div className="drape right" />
                  <div className="beam" />
                  <span className="act">
                    ACT<br />
                    <b>{model.day || 'III'}</b>
                  </span>
                </div>

                <span className="art-caption" id="art-caption">
                  {themeMeta.caption}
                </span>
              </div>
            )}

            {/* 预言家查验结果即时反馈卡片 */}
            {model.self?.role === 'seer' && tonightSeerResult && (
              <div
                className={`ww-seer-verdict-card ${tonightSeerResult.isWolf ? 'is-wolf' : 'is-good'}`}
                role="region"
                aria-label="预言家查验结果反馈"
              >
                <div className="ww-verdict-header">
                  <span className="ww-verdict-icon">🔮</span>
                  <span className="ww-verdict-title">
                    {tonightSeerResult.isTonight ? '今夜查验反馈' : `第 ${tonightSeerResult.night} 夜查验结果`}
                  </span>
                </div>
                <div className="ww-verdict-body">
                  <span className="ww-verdict-target">
                    {tonightSeerResult.seatLabel} {tonightSeerResult.name}
                  </span>
                  <span className="ww-verdict-is">身份是</span>
                  <span className={`ww-verdict-pill ${tonightSeerResult.isWolf ? 'team-wolf' : 'team-good'}`}>
                    {tonightSeerResult.isWolf ? '🐺 狼人（坏人）' : '✨ 好人（好人）'}
                  </span>
                </div>
              </div>
            )}

            {/* 发言人 / 核心焦点 */}
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
              <p id="tagline">{effectiveNarrative || themeMeta.taglineDefault}</p>
            </div>

            {/* 下一位与复盘速览 */}
            <div className="next">
              <span>{isMySpeaking ? '轮到你陈述' : '当前对局进度'}</span>
              <b>{effectivePhaseLabel}</b>
              <span>→</span>
            </div>

            <button
              id="ledger"
              className="ledger"
              onClick={() => setActiveModal('ledger')}
            >
              上一轮票型 <span>{model.voteLedger?.headline ?? '查看投票记录 ↗'}</span>
            </button>
          </section>

          {/* 右半场席位轨 */}
          <aside id="seats-right" className="seat-rail" aria-label="右侧席位">
            {seatRails.right.map((seat) => {
              const seatNum = Number(seat.seatLabel.replace(/\D/g, '')) - 1;
              const hasAction = seat.targetActions.length > 0;
              const seerClass = seat.seerResultTeam ? `seer-${seat.seerResultTeam}` : '';
              return (
                <button
                  key={seat.playerId}
                  className={`seat ${seat.isSpeaking ? 'active' : ''} ${!seat.alive ? 'out' : ''} ${seat.isSelf ? 'is-self' : ''} ${hasAction ? 'is-actionable' : ''} ${seat.isMyTarget ? 'is-my-target' : ''} ${seerClass}`}
                  data-seat={seatNum}
                  onClick={() => handleSeatClick(seat)}
                  aria-label={`${seat.seatLabel} ${seat.name}，${!seat.alive ? '已出局' : seat.isSpeaking ? '正在发言' : '存活'}${seat.seerResultLabel ? `，查验为${seat.seerResultLabel}` : ''}`}
                >
                  <b>{String(seatNum + 1).padStart(2, '0')}</b>
                  <span className="name">{seat.name}</span>
                  {seat.seerResultLabel && (
                    <span className={`ww-seer-pill ${seat.seerResultTeam === 'wolves' ? 'is-wolf' : 'is-good'}`}>
                      {seat.seerResultTeam === 'wolves' ? '🐺 狼人' : '✨ 好人'}
                    </span>
                  )}
                  <small>
                    {!seat.alive
                      ? '— 已出局'
                      : seat.isSpeaking
                        ? '● 发言中'
                        : seat.seerResultLabel
                          ? `✓ ${seat.seerResultLabel}`
                          : seat.isMyTarget
                            ? '✓ 已选择'
                            : hasAction
                              ? `● ${seat.targetActions[0]?.label ?? '可操作'}`
                              : '· 存活'}
                  </small>
                </button>
              );
            })}
          </aside>
        </div>

        {/* 底部操作与身份卡入口 */}
        <footer>
          <button
            id="identity"
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
            {globalActions.length > 0 ? (
              globalActions.map((action) => {
                const isDanger = action.id.includes('abstain') || action.id.includes('skip') || action.label.includes('弃票') || action.label.includes('不用') || action.label.includes('空守');
                const isPrimary = action.id.includes('confirm') || action.id.includes('finish') || action.id.includes('ready') || action.id.includes('save_yes');
                return (
                  <button
                    key={action.id}
                    type="button"
                    disabled={busy || !synced}
                    className={`ww-global-action-btn ${isDanger ? 'is-danger' : isPrimary ? 'primary' : ''}`}
                    onClick={() => handleAct(action.payload)}
                  >
                    {action.label} {isPrimary && <span>→</span>}
                  </button>
                );
              })
            ) : (
              <button
                id="finish"
                className="primary"
                disabled={true}
              >
                等待阶段推进 <span>…</span>
              </button>
            )}
          </div>
        </footer>
      </main>

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
                    <div className="ww-seer-history-box" style={{ marginTop: '12px', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '10px' }}>
                      <p style={{ fontWeight: 'bold', marginBottom: '6px' }}>历次查验线索：</p>
                      {model.self.seerResults.length === 0 ? (
                        <p style={{ fontSize: '12px', color: 'var(--detail)' }}>尚未进行查验，今晚行动后将在此展示。</p>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          {model.self.seerResults.map((r, idx) => {
                            const isWolf = r.team === 'wolves';
                            return (
                              <div
                                key={idx}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  padding: '6px 10px',
                                  borderRadius: '6px',
                                  fontSize: '12px',
                                  background: isWolf ? 'rgba(131, 39, 49, 0.35)' : 'rgba(36, 88, 68, 0.35)',
                                  border: `1px solid ${isWolf ? 'rgba(239, 68, 68, 0.6)' : 'rgba(34, 197, 94, 0.6)'}`,
                                }}
                              >
                                <span>第 {r.night} 夜 · {r.seatLabel} {r.name}</span>
                                <strong style={{ color: isWolf ? '#fca5a5' : '#86efac' }}>
                                  {isWolf ? '🐺 狼人（坏人）' : '✨ 好人（好人）'}
                                </strong>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                  <p style={{ fontSize: '11px', color: 'var(--detail)', marginTop: '10px' }}>
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
            <h2 id="dialog-title">上一轮票型记录</h2>
            <div id="dialog-body">
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
              <p style={{ fontSize: '12px', color: 'var(--secondary)' }}>
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
        <aside
          role="alert"
          style={{
            position: 'fixed',
            bottom: '80px',
            left: '50%',
            transform: 'translateX(-50%)',
            background: '#832731',
            color: '#fff',
            padding: '8px 16px',
            borderRadius: '8px',
            fontSize: '12px',
            zIndex: 100,
          }}
        >
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
