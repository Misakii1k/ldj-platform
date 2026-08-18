import { useCallback, useEffect, useRef, useState } from 'react';
import type { CheeseThiefPhase } from './types.ts';

interface UseCheeseTTSOptions {
  enabled?: boolean;
  phase: CheeseThiefPhase;
  currentHour: number;
  mode: 'standard' | 'simulator';
  isTable: boolean;
}

export function useCheeseTTS({
  enabled = true,
  phase,
  currentHour,
  mode,
  isTable,
}: UseCheeseTTSOptions) {
  const [ttsEnabled, setTtsEnabled] = useState(enabled);
  const [voicesLoaded, setVoicesLoaded] = useState(false);
  const lastSpokenKeyRef = useRef<string>('');
  const audioCtxRef = useRef<AudioContext | null>(null);

  // 初始化 Web Audio 上下文
  const getAudioContext = useCallback(() => {
    if (!audioCtxRef.current) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        audioCtxRef.current = new AudioCtx();
      }
    }
    if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
      void audioCtxRef.current.resume();
    }
    return audioCtxRef.current;
  }, []);

  // 合成钟声/提示音
  const playTone = useCallback((freq: number, type: OscillatorType, duration: number, gainVal = 0.2) => {
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
      // Ignore audio synthesis errors
    }
  }, [getAudioContext, ttsEnabled]);

  const playNightGong = useCallback(() => {
    playTone(220, 'sine', 1.8, 0.35);
    setTimeout(() => playTone(110, 'triangle', 2.2, 0.25), 100);
  }, [playTone]);

  const playDawnAlarm = useCallback(() => {
    playTone(587.33, 'triangle', 0.4, 0.3);
    setTimeout(() => playTone(880, 'sine', 0.6, 0.35), 200);
    setTimeout(() => playTone(1174.66, 'sine', 0.8, 0.4), 400);
  }, [playTone]);

  // 语音播报函数
  const speak = useCallback((text: string) => {
    if (!ttsEnabled || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      utterance.lang = 'zh-CN';
      const voices = window.speechSynthesis.getVoices();
      const zhVoice = voices.find((v) => v.lang.includes('zh') || v.lang.includes('cmn') || v.name.includes('Chinese'));
      if (zhVoice) {
        utterance.voice = zhVoice;
      }
      window.speechSynthesis.speak(utterance);
    } catch {
      // Fallback silently if speech synthesis fails
    }
  }, [ttsEnabled]);

  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const handleVoicesChanged = () => setVoicesLoaded(true);
    window.speechSynthesis.addEventListener('voiceschanged', handleVoicesChanged);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', handleVoicesChanged);
  }, []);

  // 根据阶段和时刻自动播报主持词（仅在模拟模式或桌面端播报）
  useEffect(() => {
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
  }, [phase, currentHour, mode, isTable, ttsEnabled, speak, playNightGong, playDawnAlarm]);

  const toggleTts = useCallback(() => {
    setTtsEnabled((prev) => {
      const next = !prev;
      if (!next && typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      return next;
    });
  }, []);

  return {
    ttsEnabled,
    toggleTts,
    speak,
    playTone,
    playDawnAlarm,
    playNightGong,
    voicesLoaded,
  };
}
