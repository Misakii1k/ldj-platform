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

  // 清除未完成的倒计时
  const clearTimers = useCallback(() => {
    for (const id of countdownTimersRef.current) {
      clearTimeout(id);
    }
    countdownTimersRef.current = [];
  }, []);

  // 初始化 Web Audio 上下文
  const getAudioContext = useCallback(() => {
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
    setTimeout(() => playTone(110, 'triangle', 2.2, 0.25), 100);
  }, [playTone]);

  const playDawnAlarm = useCallback(() => {
    playTone(587.33, 'triangle', 0.4, 0.3);
    setTimeout(() => playTone(880, 'sine', 0.6, 0.35), 200);
    setTimeout(() => playTone(1174.66, 'sine', 0.8, 0.4), 400);
  }, [playTone]);

  const playTick = useCallback(() => {
    playTone(800, 'sine', 0.08, 0.18);
  }, [playTone]);

  // 语音播报函数（使用用户在设置中选择的 TTS 引擎）
  const speak = useCallback(
    (text: string, interrupt = true) => {
      if (!ttsEnabled) return;
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

  // 根据阶段和时刻自动播报主持词与倒计时
  useEffect(() => {
    clearTimers();
    if (!ttsEnabled || (mode === 'simulator' && !isTable)) return;

    const key = `${phase}-${currentHour}`;
    if (lastSpokenKeyRef.current === key) return;
    lastSpokenKeyRef.current = key;

    if (phase === 'night') {
      if (currentHour === 0 || currentHour === 1) {
        playNightGong();
        speak('天黑请闭眼，所有人扣紧骰盅。现在是夜间 1 点，请 1 点的玩家睁眼。');
      } else {
        playNightGong();
        speak(`现在是夜间 ${currentHour} 点，请 ${currentHour} 点的玩家睁眼。`);
      }

      // 最后 5 秒倒计时播报
      const hourDuration = Math.max(5, nightHourSeconds);
      const countdownStartMs = Math.max(0, (hourDuration - 5) * 1000);

      const t5 = setTimeout(() => {
        playTick();
        speak('5', false);
      }, countdownStartMs);

      const t4 = setTimeout(() => {
        playTick();
        speak('4', false);
      }, countdownStartMs + 1000);

      const t3 = setTimeout(() => {
        playTick();
        speak('3', false);
      }, countdownStartMs + 2000);

      const t2 = setTimeout(() => {
        playTick();
        speak('2', false);
      }, countdownStartMs + 3000);

      const t1 = setTimeout(() => {
        playNightGong();
        speak('1，请闭眼', false);
      }, countdownStartMs + 4000);

      countdownTimersRef.current.push(t5, t4, t3, t2, t1);
    } else if (phase === 'accomplice_select') {
      speak('大盗请在暗中确认共犯。');
    } else if (phase === 'dawn') {
      playDawnAlarm();
      speak('天亮了，所有人请睁眼！桌上的奶酪不见了！请大家自由讨论找出大盗！');
    } else if (phase === 'vote') {
      speak('讨论结束，请大家秘密指认你怀疑的奶酪大盗！');
    } else if (phase === 'game_over') {
      speak('投票结束，现在揭晓所有人的骰子与真相！');
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
  ]);

  const toggleTts = useCallback(() => {
    setTtsEnabled((prev) => {
      const next = !prev;
      if (!next && typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        clearTimers();
      }
      return next;
    });
  }, [clearTimers]);

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
