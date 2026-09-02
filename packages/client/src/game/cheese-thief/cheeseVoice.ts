/**
 * 奶酪大盗法官/主持人语音：客户端排程与播放管理器。
 * 支持单曲精准播报（playCue 支持 Promise 等待）、事件排队（enqueue）、
 * 以及阶段切换/用户操作时的即时打断（interrupt / stopAll）。
 */
import { webAudio } from '../../shared-ui/WebAudioManager.ts';

export const CHEESE_THIEF_VOICE_BASE = '/cheese-thief-voice';

/** 队列键 → 音频文件（相对 CHEESE_THIEF_VOICE_BASE；文件名含中文，播放时 encodeURI）。 */
export const CUE_FILES: Readonly<Record<string, string>> = {
  // 开场准备
  game_start_intro: '20_开场_游戏即将开始.wav',

  // 夜间基础
  night_start: '01_开场_天黑请闭眼.wav',
  wake_1: '02_一点叫醒.wav',
  wake_2: '03_两点叫醒.wav',
  wake_3: '04_三点叫醒.wav',
  wake_4: '05_四点叫醒.wav',
  wake_5: '06_五点叫醒.wav',
  wake_6: '07_六点叫醒.wav',

  // 共犯与天亮
  accomplice_select: '08_共犯指定.wav',
  dawn: '09_天亮.wav',
  discussion: '10_白天讨论.wav',

  // 读秒倒计时
  countdown_5: '11_读秒_5秒.wav',
  countdown_10: '12_读秒_10秒.wav',

  // 投票与终局胜负
  vote_start: '13_投票_请指认大盗.wav',
  game_over_village: '14_终局_好人胜利.wav',
  game_over_thief: '15_终局_大盗胜利.wav',
  game_over_white_mouse: '16_终局_白老鼠胜利.wav',
  game_over_peace: '17_终局_全员胜利.wav',

  // 身份卡动作
  identity_cat: '18_身份卡_猫咪偷看.wav',
  identity_dog: '19_身份卡_忠犬指定.wav',
};

export function hasCue(key: string): boolean {
  return key in CUE_FILES;
}

class CheeseVoiceQueue {
  private queue: string[] = [];
  private current: HTMLAudioElement | null = null;
  private currentPromiseResolve: ((completed: boolean) => void) | null = null;
  private playing = false;
  private pendingRetry: string | null = null;
  private retryListenerAttached = false;
  private token = 0;

  /** 播放指定台词并等待播放完成；静音或被中断时立即 resolve(false)。 */
  playCue(key: string): Promise<boolean> {
    const file = CUE_FILES[key];
    if (!file || webAudio.isMuted() || typeof Audio === 'undefined') return Promise.resolve(false);
    return new Promise<boolean>((resolve) => {
      this.interrupt();
      this.token += 1;
      const currentToken = this.token;
      this.currentPromiseResolve = resolve;

      const audio = new Audio(encodeURI(`${CHEESE_THIEF_VOICE_BASE}/${file}`));
      audio.volume = 1;
      this.current = audio;
      this.playing = true;

      const finish = (ok: boolean) => {
        if (this.token !== currentToken) return;
        if (this.current === audio) {
          this.current.onended = null;
          this.current.onerror = null;
          this.current = null;
        }
        this.playing = false;
        const cb = this.currentPromiseResolve;
        this.currentPromiseResolve = null;
        if (cb) cb(ok);
      };

      audio.onended = () => finish(true);
      audio.onerror = () => finish(false);
      audio.play().catch(() => {
        if (this.token === currentToken) {
          this.pendingRetry = file;
          this.attachRetry();
        }
        finish(false);
      });
    });
  }

  /** 入队一段语音（队列串行播放）；静音时丢弃。 */
  enqueue(key: string): void {
    const file = CUE_FILES[key];
    if (!file || webAudio.isMuted()) return;
    this.queue.push(file);
    void this.pump();
  }

  /** 立即打断当前正在播放的音频并清空队列。 */
  interrupt(): void {
    this.token += 1;
    this.queue = [];
    if (this.current) {
      this.current.onended = null;
      this.current.onerror = null;
      this.current.pause();
      this.current = null;
    }
    if (this.currentPromiseResolve) {
      const cb = this.currentPromiseResolve;
      this.currentPromiseResolve = null;
      cb(false);
    }
    this.playing = false;
    this.pendingRetry = null;
  }

  /** 全部停止（卸载/终局时）。 */
  stopAll(): void {
    this.interrupt();
  }

  /** 清空未播放的排队项。 */
  cancelPending(): void {
    this.queue = [];
  }

  private attachRetry(): void {
    if (typeof document === 'undefined') return;
    if (this.retryListenerAttached) return;
    this.retryListenerAttached = true;
    const retry = () => {
      document.removeEventListener('pointerdown', retry);
      this.retryListenerAttached = false;
      if (this.pendingRetry) {
        this.queue.unshift(this.pendingRetry);
        this.pendingRetry = null;
        void this.pump();
      }
    };
    document.addEventListener('pointerdown', retry, { once: false });
  }

  private async pump(): Promise<void> {
    if (this.playing || typeof Audio === 'undefined') return;
    const file = this.queue.shift();
    if (!file) return;
    if (webAudio.isMuted()) return;
    this.playing = true;
    const currentToken = this.token;
    const audio = new Audio(encodeURI(`${CHEESE_THIEF_VOICE_BASE}/${file}`));
    audio.volume = 1;
    this.current = audio;

    const advance = () => {
      if (this.token !== currentToken || this.current !== audio) return;
      this.current = null;
      this.playing = false;
      setTimeout(() => {
        if (this.token === currentToken) void this.pump();
      }, 250);
    };

    audio.onended = advance;
    audio.onerror = advance;
    try {
      await audio.play();
    } catch {
      if (this.token === currentToken && this.current === audio) {
        this.current = null;
        this.playing = false;
        this.pendingRetry = file;
        this.attachRetry();
      }
    }
  }
}

export const cheeseVoice = new CheeseVoiceQueue();
