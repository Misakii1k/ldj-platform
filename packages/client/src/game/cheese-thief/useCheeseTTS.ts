import { useCallback, useEffect, useRef, useState } from 'react';
import { speakText } from '../../app/tts-settings/ttsManager.ts';
import type { CheeseThiefPhase } from './types.ts';

interface UseCheeseTTSOptions {
  enabled?: boolean;
  phase: CheeseThiefPhase;
  currentHour: number;
  mode: 'standard' | 'simulator';
  isTable: boolean;
  nightHourSeconds?: number;
}

interface ToneHandle {
  oscillator: OscillatorNode;
  gain: GainNode;
}

export function useCheeseTTS({
  enabled = true,
  phase,
  currentHour,
  mode,
  isTable,
  nightHourSeconds = 20,
}: UseCheeseTTSOptions) {
  const [ttsEnabled, setTtsEnabled] = useState(enabled);
  const [_voicesLoaded, setVoicesLoaded] = useState(false);
  const lastSpokenKeyRef = useRef<string>('');
  const audioCtxRef = useRef<AudioContext | null>(null);
  const countdownTimersRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const toneHandlesRef = useRef<Set<ToneHandle>>(new Set());
  const mountedRef = useRef(true);
  const [visibilityRevision, setVisibilityRevision] = useState(0);

  const cancelSpeech = useCallback(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  }, []);

  const clearToneHandles = useCallback(() => {
    const ctx = audioCtxRef.current;
    const now = ctx?.currentTime ?? 0;
    for (const { oscillator, gain } of toneHandlesRef.current) {
      try {
        gain.gain.cancelScheduledValues(now);
        gain.gain.setValueAtTime(0.0001, now);
      } catch (error) {
        void error;
      }
      try {
        oscillator.stop();
      } catch (error) {
        void error;
      }
      try {
        oscillator.disconnect();
        gain.disconnect();
      } catch (error) {
        void error;
      }
    }
    toneHandlesRef.current.clear();
  }, []);

  // 清除未完成的倒计时
  const clearTimers = useCallback(() => {
    for (const id of countdownTimersRef.current) {
      clearTimeout(id);
    }
    countdownTimersRef.current = [];
    clearToneHandles();
  }, [clearToneHandles]);

  const scheduleTimer = useCallback((callback: () => void, delayMs: number) => {
    if (typeof window === 'undefined') return;
    const timerId = window.setTimeout(() => {
      countdownTimersRef.current = countdownTimersRef.current.filter((id) => id !== timerId);
      if (mountedRef.current) callback();
    }, delayMs);
    countdownTimersRef.current.push(timerId);
  }, []);

  // 初始化 Web Audio 上下文
  const getAudioContext = useCallback(() => {
    if (!mountedRef.current || typeof window === 'undefined') return null;
    if (!audioCtxRef.current) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        audioCtxRef.current = new AudioCtx();
      }
    }
    if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
      void audioCtxRef.current.resume();
    }
    return audioCtxRef.current;
  }, []);

  // 合成提示音
  const playTone = useCallback(
    (freq: number, type: OscillatorType, duration: number, gainVal = 0.2) => {
      if (!ttsEnabled) return;
      try {
        const ctx = getAudioContext();
        if (!ctx) return;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const handle = { oscillator: osc, gain };
        toneHandlesRef.current.add(handle);
        const release = () => {
          toneHandlesRef.current.delete(handle);
          try {
            osc.disconnect();
            gain.disconnect();
          } catch (error) {
            void error;
          }
        };
        osc.addEventListener('ended', release, { once: true });
        osc.type = type;
        osc.frequency.setValueAtTime(freq, ctx.currentTime);
        gain.gain.setValueAtTime(gainVal, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + duration);
      } catch {
        // Ignore audio errors
      }
    },
    [getAudioContext, ttsEnabled]
  );

  const playNightGong = useCallback(() => {
    playTone(220, 'sine', 1.8, 0.35);
    scheduleTimer(() => playTone(110, 'triangle', 2.2, 0.25), 100);
  }, [playTone, scheduleTimer]);

  const playDawnAlarm = useCallback(() => {
    playTone(587.33, 'triangle', 0.4, 0.3);
    scheduleTimer(() => playTone(880, 'sine', 0.6, 0.35), 200);
    scheduleTimer(() => playTone(1174.66, 'sine', 0.8, 0.4), 400);
  }, [playTone, scheduleTimer]);

  const playTick = useCallback(() => {
    playTone(800, 'sine', 0.08, 0.18);
  }, [playTone]);

  // 语音播报函数（使用用户在设置中选择的 TTS 引擎）
  const speak = useCallback(
    (text: string, interrupt = true) => {
      if (!ttsEnabled || !mountedRef.current) return;
      void speakText(text, undefined, interrupt);
    },
    [ttsEnabled]
  );

  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const handleVoicesChanged = () => setVoicesLoaded(true);
    window.speechSynthesis.addEventListener('voiceschanged', handleVoicesChanged);
    return () => {
      window.speechSynthesis.removeEventListener('voiceschanged', handleVoicesChanged);
      clearTimers();
    };
  }, [clearTimers]);

  useEffect(() => {
    mountedRef.current = true;
    if (typeof document === 'undefined') return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        clearTimers();
        cancelSpeech();
        return;
      }
      lastSpokenKeyRef.current = '';
      setVisibilityRevision((revision) => revision + 1);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      mountedRef.current = false;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      clearTimers();
      cancelSpeech();
      const ctx = audioCtxRef.current;
      audioCtxRef.current = null;
      if (ctx) void ctx.close().catch(() => {});
    };
  }, [cancelSpeech, clearTimers]);

  // 根据阶段和时刻自动播报主持词与倒计时
  useEffect(() => {
    // 每次阶段或时刻变更，立即终止过往未完成的发音与倒计时，防止排队积压
    clearTimers();
    cancelSpeech();
    if (!ttsEnabled || (mode === 'simulator' && !isTable)) return;
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;

    const key = `${phase}-${currentHour}`;
    if (lastSpokenKeyRef.current === key) return;
    lastSpokenKeyRef.current = key;

    if (phase === 'night') {
      if (currentHour === 0 || currentHour === 1) {
        playNightGong();
        speak('天黑请闭眼。夜间 1 点，1 点玩家请睁眼。', true);
      } else {
        playNightGong();
        speak(`夜间 ${currentHour} 点，${currentHour} 点玩家请睁眼。`, true);
      }

      // 最后 5 秒倒计时播报（使用 interrupt=true 强行对齐秒拍，彻底消除队列滞后积压）
      const hourDuration = Math.max(5, nightHourSeconds);
      const countdownStartMs = Math.max(0, (hourDuration - 5) * 1000);

      scheduleTimer(() => {
        playTick();
        speak('5', true);
      }, countdownStartMs);

      scheduleTimer(() => {
        playTick();
        speak('4', true);
      }, countdownStartMs + 1000);

      scheduleTimer(() => {
        playTick();
        speak('3', true);
      }, countdownStartMs + 2000);

      scheduleTimer(() => {
        playTick();
        speak('2', true);
      }, countdownStartMs + 3000);

      scheduleTimer(() => {
        playNightGong();
        speak('1，请闭眼', true);
      }, countdownStartMs + 4000);
    } else if (phase === 'accomplice_select') {
      playNightGong();
      speak('大盗请在暗中确认共犯。', true);

      // 共犯选择 15 秒专属倒计时
      const selectDuration = 15;
      const countdownStartMs = Math.max(0, (selectDuration - 5) * 1000);

      scheduleTimer(() => {
        playTick();
        speak('5', true);
      }, countdownStartMs);

      scheduleTimer(() => {
        playTick();
        speak('4', true);
      }, countdownStartMs + 1000);

      scheduleTimer(() => {
        playTick();
        speak('3', true);
      }, countdownStartMs + 2000);

      scheduleTimer(() => {
        playTick();
        speak('2', true);
      }, countdownStartMs + 3000);

      scheduleTimer(() => {
        playNightGong();
        speak('1，请闭眼', true);
      }, countdownStartMs + 4000);
    } else if (phase === 'dawn') {
      playDawnAlarm();
      speak('天亮了，所有人请睁眼！桌上的奶酪不见了！请大家自由讨论找出大盗！', true);
    } else if (phase === 'vote') {
      speak('讨论结束，请大家秘密指认你怀疑的奶酪大盗！', true);
    } else if (phase === 'game_over') {
      speak('投票结束，现在揭晓所有人的骰子与真相！', true);
    }

    return () => clearTimers();
  }, [
    phase,
    currentHour,
    mode,
    isTable,
    ttsEnabled,
    nightHourSeconds,
    speak,
    playNightGong,
    playDawnAlarm,
    playTick,
    clearTimers,
    cancelSpeech,
    scheduleTimer,
    visibilityRevision,
  ]);

  const toggleTts = useCallback(() => {
    setTtsEnabled((prev) => {
      const next = !prev;
      if (!next) {
        cancelSpeech();
        clearTimers();
      } else {
        lastSpokenKeyRef.current = '';
      }
      return next;
    });
  }, [cancelSpeech, clearTimers]);

  return {
    ttsEnabled,
    toggleTts,
    speak,
    playTone,
    playDawnAlarm,
    playNightGong,
    playTick,
  };
}
