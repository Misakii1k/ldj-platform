/**
 * 法官语音时序钩子：
 * - 权威时间线新局（Contract F / T11）：单曲 cue 播放，按 clock 定位，手动主持永不自动播报，
 *   默认出声设备按 host/moderator，重连不补播过期音频，彻底旁路旧视觉锁；
 * - 旧局（无 timeline）：保留旧版 JudgeVoiceDirector 串行步进器与视觉锁。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { getVoiceCueDurationMs, locateWerewolfAnnouncement, type WerewolfAnnouncement, type WerewolfTimeline } from '@ldj/shared';
import { calculateAdjustedNow, type ServerClockSample } from '../../../shared-ui/serverClock.ts';
import { NARRATION_SETTINGS_EVENT, readNarrationSettings } from './narrationSettings.ts';
import type { WerewolfPresentationModel } from '../presentation.ts';
import { JudgeVoiceDirector } from './judgeVoiceDirector.ts';
import type { JudgeVoiceDirectorFlags, NightActiveRole } from './judgeVoiceDirector.ts';
import {
  calculateTimelineCueOffset,
  judgeVoice,
  shouldPlayTimelineVoice,
} from './judgeVoice.ts';

export type { NightActiveRole } from './judgeVoiceDirector.ts';

export interface UseJudgeVoiceResult {
  readonly currentNightRole: NightActiveRole;
  readonly isNightVoiceRunning: boolean;
  readonly isDayAnnouncementRunning: boolean;
  readonly roleRemainingSeconds: number | null;
  readonly roleTotalSeconds: number | null;
  readonly autoplayBlocked?: boolean;
  readonly enableAudio?: () => void;
}

export interface UseJudgeVoiceOptions {
  readonly isHost?: boolean;
  readonly isModerator?: boolean;
  readonly clockSample?: ServerClockSample | null;
  readonly announcement?: WerewolfAnnouncement | null;
}

const INITIAL_FLAGS: JudgeVoiceDirectorFlags = {
  currentNightRole: null,
  isNightVoiceRunning: false,
  isDayAnnouncementRunning: false,
  roleRemainingSeconds: null,
  roleTotalSeconds: null,
};

export function useJudgeVoice(
  model: WerewolfPresentationModel,
  options?: UseJudgeVoiceOptions,
): UseJudgeVoiceResult {
  const isAuthoritative = Boolean(model.isAuthoritativeTimeline && model.timeline);
  const [flags, setFlags] = useState<JudgeVoiceDirectorFlags>(INITIAL_FLAGS);
  const modelRef = useRef(model);
  modelRef.current = model;
  const timelineVoice = useTimelineJudgeVoice(isAuthoritative ? model.timeline : null, { ...options, announcement: model.announcement });

  const directorRef = useRef<JudgeVoiceDirector | null>(null);

  // 1. 旧局（无时间线）：运行旧版导演 Stepper
  useEffect(() => {
    if (isAuthoritative) {
      if (directorRef.current) {
        directorRef.current.dispose();
        directorRef.current = null;
      }
      return;
    }

    if (!directorRef.current) {
      const director = new JudgeVoiceDirector({
        getModel: () => modelRef.current,
        onUpdate: setFlags,
        now: () => Date.now(),
        startTimer: (ms, onFire) => {
          const handle = window.setTimeout(onFire, ms);
          return () => window.clearTimeout(handle);
        },
        startTicker: (ms, onTick) => {
          const handle = window.setInterval(onTick, ms);
          return () => window.clearInterval(handle);
        },
      });
      director.bootstrap(model);
      directorRef.current = director;
    }

    directorRef.current.sync(model);
  }, [isAuthoritative, model]);

  useEffect(
    () => () => {
      directorRef.current?.dispose();
      directorRef.current = null;
      judgeVoice.stopAll();
    },
    [],
  );

  if (isAuthoritative) {
    return {
      currentNightRole: (model.timeline?.period === 'night' ? (model.timeline?.role as NightActiveRole) : null) ?? null,
      isNightVoiceRunning: false,
      isDayAnnouncementRunning: false,
      roleRemainingSeconds: null,
      roleTotalSeconds: null,
      ...timelineVoice,
    };
  }

  return flags;
}

/** Shared server-clock playback for automatic cues and explicitly requested moderator announcements. */
export function useTimelineJudgeVoice(timeline: WerewolfTimeline | null | undefined, options?: UseJudgeVoiceOptions) {
  const isAuthoritative = Boolean(timeline || options?.announcement);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const timelineRef = useRef(timeline);
  timelineRef.current = timeline;
  const clockRef = useRef(options?.clockSample);
  clockRef.current = options?.clockSample;
  const playbackEpoch = useRef(0);
  const announcementRef = useRef(options?.announcement);
  announcementRef.current = options?.announcement;
  // Play only the current server cue. Settings, resume and user gestures use the same guard.
  const playCurrentTimeline = useCallback(() => {
    if (!isAuthoritative) return;
    const epoch = ++playbackEpoch.current;
    judgeVoice.stopAll();
    setAutoplayBlocked(false);
    const timeline = timelineRef.current;
    if (document.hidden) return;
    const settings = readNarrationSettings();
    const announcement = announcementRef.current;
    const now = calculateAdjustedNow(clockRef.current);
    if (announcement && now < announcement.endsAt) {
      const allowed = announcement.source === 'moderator'
        ? (announcement.output === 'room' || options?.isModerator) && settings.enabled !== false
        : timeline?.mode !== 'manual' && !timeline?.paused && (settings.enabled ?? Boolean(options?.isHost || options?.isModerator));
      if (!allowed || settings.volume <= 0) return;
      const playSequence = async () => {
        let completedIndex = -1;
        while (epoch === playbackEpoch.current) {
          const position = locateWerewolfAnnouncement(announcement, calculateAdjustedNow(clockRef.current));
          if (!position || position.index <= completedIndex) break;
          const result = await judgeVoice.playTimelineCue(position.cue, position.offsetSeconds, settings.volume, true);
          if (epoch !== playbackEpoch.current) return;
          if (!result.success) { setAutoplayBlocked(Boolean(result.blocked)); return; }
          // Audio duration rounding must not replay the tail of a completed sentence.
          completedIndex = position.index;
          const nextIndex = position.index + 1;
          if (nextIndex >= announcement.cues.length) break;
          const nextStart = announcement.startedAt + announcement.cues.slice(0,nextIndex).reduce((ms,cue) => ms + getVoiceCueDurationMs(cue),0);
          const wait = nextStart - calculateAdjustedNow(clockRef.current);
          if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait));
        }
        if (epoch === playbackEpoch.current && timelineRef.current?.period === 'night') {
          const wait = Math.max(0, announcement.endsAt - calculateAdjustedNow(clockRef.current));
          setTimeout(() => { if (epoch === playbackEpoch.current) playCurrentTimeline(); }, wait + 1);
        }
      };
      void playSequence();
      return;
    }
    if (!timeline) return;
    const decision = shouldPlayTimelineVoice({
      mode: timeline.mode, paused: timeline.paused, cue: timeline.cue,
      isHost: Boolean(options?.isHost), isModerator: Boolean(options?.isModerator),
      localSettingEnabled: settings.enabled, volume: settings.volume,
    });
    if (!decision.shouldPlay || !timeline.cue) return;
    if (now < timeline.startedAt) return;
    const durationMs = getVoiceCueDurationMs(timeline.cue);
    if (timeline.endsAt !== null && now >= timeline.endsAt) return;
    const offset = calculateTimelineCueOffset(timeline.startedAt, now, durationMs);
    if (!offset.canPlay) return;
    void judgeVoice.playTimelineCue(timeline.cue, offset.offsetSeconds, settings.volume).then((result) => {
      if (epoch === playbackEpoch.current) setAutoplayBlocked(Boolean(result.blocked));
    });
  }, [isAuthoritative, options?.isHost, options?.isModerator]);

  useEffect(() => {
    if (!isAuthoritative) return;
    playCurrentTimeline();
    return () => { ++playbackEpoch.current; judgeVoice.stopAll(); };
  }, [isAuthoritative, playCurrentTimeline, timeline?.id, timeline?.segment,
    timeline?.cue, timeline?.paused, timeline?.mode,
    timeline?.startedAt, timeline?.endsAt, options?.announcement?.id]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden) { ++playbackEpoch.current; judgeVoice.stopAll(); }
      else playCurrentTimeline();
    };
    const handleStorage = (event: StorageEvent) => {
      if (!event.key || event.key.startsWith('ldj_werewolf_narration_')) playCurrentTimeline();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener(NARRATION_SETTINGS_EVENT, playCurrentTimeline);
    window.addEventListener('storage', handleStorage);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener(NARRATION_SETTINGS_EVENT, playCurrentTimeline);
      window.removeEventListener('storage', handleStorage);
    };
  }, [playCurrentTimeline]);

  const enableAudio = useCallback(() => {
    try { localStorage.setItem('ldj_werewolf_narration_enabled', 'true'); } catch { /* Storage may be unavailable in private browsing. */ }
    // Keep audio.play in the user gesture, without replaying the cue from zero.
    playCurrentTimeline();
  }, [playCurrentTimeline]);

  return { autoplayBlocked, enableAudio };
}
