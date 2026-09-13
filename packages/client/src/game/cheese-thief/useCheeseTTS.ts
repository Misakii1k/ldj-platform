import { useCallback, useEffect, useRef, useState } from 'react';
import { cheeseVoice } from './cheeseVoice.ts';
import { webAudio } from '../../shared-ui/WebAudioManager.ts';
import type { CheeseThiefPhase } from './types.ts';

interface UseCheeseTTSOptions {
  enabled?: boolean;
  phase: CheeseThiefPhase;
  currentHour: number;
  mode?: 'standard' | 'simulator';
  isTable?: boolean;
  nightHourSeconds?: number;
  thiefCaught?: boolean | null;
  cheeseStolen?: boolean;
  revealedCat?: string | null;
  revealedDog?: string | null;
  deadlineAt?: number | null;
}

/**
 * 根据服务端权威截止时间动态计算夜间倒计时读秒（11_读秒_5秒.wav，实测 6.0s）的启动延迟。
 * 确保读秒音频播完瞬间刚好与 deadlineAt 到期切换完全同步。
 */
export function calculateNightCountdownDelay(
  deadlineAt: number | null | undefined,
  now: number = Date.now(),
  nightHourSeconds: number = 20,
): number {
  if (typeof deadlineAt === 'number' && deadlineAt > 0) {
    const msLeft = deadlineAt - now;
    // 11_读秒_5秒.wav 实际时长为 6.0s (6000ms)，应在距离 deadlineAt 恰好剩余 6000ms 时开始播放
    return Math.max(0, msLeft - 6000);
  }
  return Math.max(0, (Math.max(6, nightHourSeconds) - 6) * 1000);
}

export function useCheeseTTS({
  enabled = true,
  phase,
  currentHour,
  mode,
  isTable = true,
  nightHourSeconds = 20,
  thiefCaught = null,
  cheeseStolen = true,
  revealedCat = null,
  revealedDog = null,
  deadlineAt = null,
}: UseCheeseTTSOptions) {
  const [ttsEnabled, setTtsEnabled] = useState(enabled && !webAudio.isMuted());
  const lastSpokenKeyRef = useRef<string>('');
  const prevCatRef = useRef<string | null>(null);
  const prevDogRef = useRef<string | null>(null);
  const countdownTimersRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const mountedRef = useRef(true);
  const runIdRef = useRef(0);

  // 清除未完成的倒计时
  const clearTimers = useCallback(() => {
    for (const id of countdownTimersRef.current) {
      clearTimeout(id);
    }
    countdownTimersRef.current = [];
  }, []);

  const scheduleTimer = useCallback((callback: () => void, delayMs: number) => {
    if (typeof window === 'undefined') return;
    const timerId = window.setTimeout(() => {
      countdownTimersRef.current = countdownTimersRef.current.filter((id) => id !== timerId);
      if (mountedRef.current) callback();
    }, delayMs);
    countdownTimersRef.current.push(timerId);
  }, []);

  // 同步静音与卸载监听
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearTimers();
      cheeseVoice.stopAll();
    };
  }, [clearTimers]);

  // 身份卡揭晓监听
  useEffect(() => {
    if (!ttsEnabled || webAudio.isMuted()) return;
    if (revealedCat && revealedCat !== prevCatRef.current) {
      prevCatRef.current = revealedCat;
      cheeseVoice.interrupt();
      void cheeseVoice.playCue('identity_cat');
    }
  }, [revealedCat, ttsEnabled]);

  useEffect(() => {
    if (!ttsEnabled || webAudio.isMuted()) return;
    if (revealedDog && revealedDog !== prevDogRef.current) {
      prevDogRef.current = revealedDog;
      cheeseVoice.interrupt();
      void cheeseVoice.playCue('identity_dog');
    }
  }, [revealedDog, ttsEnabled]);

  // 根据阶段和时刻自动播报真实主持词与倒计时
  useEffect(() => {
    if (!ttsEnabled || webAudio.isMuted()) return;
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;

    const key = `${phase}-${currentHour}`;
    // 只有当阶段或时刻确实改变时才打断旧语音并启动新播报，避免重渲染时误伤正在播放的语音
    if (lastSpokenKeyRef.current === key) return;
    lastSpokenKeyRef.current = key;

    clearTimers();
    cheeseVoice.interrupt();
    runIdRef.current += 1;
    const currentRunId = runIdRef.current;
    const isActive = () => mountedRef.current && runIdRef.current === currentRunId;

    const hourStartedAt = Date.now();
    const effectiveDeadline =
      typeof deadlineAt === 'number' && deadlineAt > 0
        ? deadlineAt
        : hourStartedAt + nightHourSeconds * 1000;

    if (phase === 'night') {
      const runNightHour = async () => {
        if (currentHour === 0) {
          // 开场准备阶段：依次播放「20_开场_游戏即将开始」（11.5s）和「01_开场_天黑请闭眼」（5.3s）
          // 两者合计 16.8s，开局准备 roleRevealSeconds 严格设为 17s，整段语音完整播完与环节切换同步
          await cheeseVoice.playCue('game_start_intro');
          if (!isActive()) return;
          await cheeseVoice.playCue('night_start');
        } else if (currentHour >= 1 && currentHour <= 6) {
          // 1～6 点时刻到达：立即播报对应的叫醒语音（02_一点叫醒 ~ 07_六点叫醒）
          await cheeseVoice.playCue(`wake_${currentHour}`);
          if (!isActive()) return;

          // 叫醒音频播完后，依据权威 view.deadlineAt 动态排程：
          // 11_读秒_5秒.wav 实际为 6.0s，在剩余 6 秒时播放，保证播完刚好到期切换
          const delayMs = calculateNightCountdownDelay(effectiveDeadline, Date.now(), nightHourSeconds);
          if (delayMs > 0) {
            scheduleTimer(() => {
              if (isActive()) {
                void cheeseVoice.playCue('countdown_5');
              }
            }, delayMs);
          } else {
            const msLeft = effectiveDeadline - Date.now();
            if (msLeft >= 1500) {
              void cheeseVoice.playCue('countdown_5');
            }
          }
        }
      };

      void runNightHour();
    } else if (phase === 'accomplice_select') {
      // 08_共犯指定.wav 实测 16.6s，accompliceSelectSeconds 设为 17s，完整播放不被提前截断
      const runAccomplice = async () => {
        await cheeseVoice.playCue('accomplice_select');
      };

      void runAccomplice();
    } else if (phase === 'dawn') {
      // 天亮了，所有人请睁眼（按要求：不播放“白天讨论”音频）
      void cheeseVoice.playCue('dawn');
    } else if (phase === 'vote') {
      void cheeseVoice.playCue('vote_start');
    } else if (phase === 'game_over') {
      // 终局揭晓
      if (!cheeseStolen) {
        void cheeseVoice.playCue('game_over_peace');
      } else if (thiefCaught === true) {
        void cheeseVoice.playCue('game_over_village');
      } else if (thiefCaught === false) {
        void cheeseVoice.playCue('game_over_thief');
      }
    }

    return () => clearTimers();
  }, [
    phase,
    currentHour,
    mode,
    isTable,
    ttsEnabled,
    nightHourSeconds,
    deadlineAt,
    thiefCaught,
    cheeseStolen,
    clearTimers,
    scheduleTimer,
  ]);

  const toggleTts = useCallback(() => {
    setTtsEnabled((prev) => {
      const next = !prev;
      if (!next) {
        clearTimers();
        cheeseVoice.stopAll();
      } else {
        lastSpokenKeyRef.current = '';
      }
      return next;
    });
  }, [clearTimers]);

  return {
    ttsEnabled,
    toggleTts,
  };
}

// 导出别名以便向后兼容
export const useCheeseVoice = useCheeseTTS;
