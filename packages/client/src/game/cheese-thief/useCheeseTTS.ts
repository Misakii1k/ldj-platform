import { useCallback, useEffect, useRef, useState } from 'react';
import { cheeseVoice, hasCue } from './cheeseVoice.ts';
import { webAudio } from '../../shared-ui/WebAudioManager.ts';
import type { CheeseThiefPhase } from './types.ts';

interface UseCheeseTTSOptions {
  enabled?: boolean;
  phase: CheeseThiefPhase;
  currentHour: number;
  mode: 'standard' | 'simulator';
  isTable: boolean;
  nightHourSeconds?: number;
  thiefCaught?: boolean | null;
  cheeseStolen?: boolean;
  revealedCat?: string | null;
  revealedDog?: string | null;
}

export function useCheeseTTS({
  enabled = true,
  phase,
  currentHour,
  mode,
  isTable,
  nightHourSeconds = 10,
  thiefCaught = null,
  cheeseStolen = true,
  revealedCat = null,
  revealedDog = null,
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
    if (!ttsEnabled || webAudio.isMuted() || (mode === 'simulator' && !isTable)) return;
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

    if (phase === 'night') {
      const hourDuration = Math.max(5, nightHourSeconds);

      const runNightHour = async () => {
        if (currentHour === 0) {
          // 开场准备阶段：播放「20_开场_游戏即将开始」，播放完毕后紧接着播放「11_读秒_5秒」
          await cheeseVoice.playCue('game_start_intro');
          if (!isActive()) return;
          await cheeseVoice.playCue('countdown_5');
        } else if (currentHour === 1) {
          // 倒计时结束正式切入 1 点：播报「01_开场_天黑请闭眼」与「02_一点叫醒」
          await cheeseVoice.playCue('night_start');
          if (!isActive()) return;
          await cheeseVoice.playCue('wake_1');
          if (!isActive()) return;

          // 1点时刻最后 5 秒播报「11_读秒_5秒」
          const countdownStartMs = Math.max(0, (hourDuration - 5) * 1000);
          scheduleTimer(() => {
            if (isActive()) {
              void cheeseVoice.playCue('countdown_5');
            }
          }, countdownStartMs);
        } else if (currentHour >= 2 && currentHour <= 6) {
          await cheeseVoice.playCue(`wake_${currentHour}`);
          if (!isActive()) return;

          // 倒计时最后 5 秒播报「11_读秒_5秒」
          const countdownStartMs = Math.max(0, (hourDuration - 5) * 1000);
          scheduleTimer(() => {
            if (isActive()) {
              void cheeseVoice.playCue('countdown_5');
            }
          }, countdownStartMs);
        }
      };

      void runNightHour();
    } else if (phase === 'accomplice_select') {
      // 08_共犯指定.wav 含有完整的大盗指定与闭眼主持词，完整播放不被截断
      const runAccomplice = async () => {
        await cheeseVoice.playCue('accomplice_select');
      };

      void runAccomplice();
    } else if (phase === 'dawn') {
      // 天亮了，所有人请睁眼（按用户要求：不播放“白天讨论”音频）
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
