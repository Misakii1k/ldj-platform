import { WEREWOLF_PUBLIC_VOICE_MANIFEST, WEREWOLF_VOICE_CATALOG, WEREWOLF_VOICE_ALIASES, isPublicVoiceCue } from '@ldj/shared';
/**
 * 狼人杀法官语音：客户端排程与播放管理器。
 * 支持单曲精准播报（playCue 支持 Promise 等待）、事件排队（enqueue）、
 * 以及阶段切换/用户操作时的即时打断（interrupt / stopAll）。
 *
 * 打断语义：interrupt/stopAll 会暂停当前音频，并把所有尚未完成的 playCue
 * Promise 以 false 结算——保证等待协程总能继续推进，不会出现"僵尸 await"
 * 导致的永久静音与状态锁死。
 */
export const WEREWOLF_VOICE_BASE = '/werewolf-voice';

/**
 * 权威时间线公共语音白名单（Contract F / T11）。
 * 绝不允许包含验人好坏、女巫救人毒人、以及特定玩家死讯等私密/非确定信息。
 */
export const TIMELINE_PUBLIC_CUES: ReadonlySet<string> = new Set([
  ...Object.keys(WEREWOLF_PUBLIC_VOICE_MANIFEST),
  'wolf_open',
  'wolf_kill',
  'wolf_agree',
  'seer_check',
  'seer_result_generic',
  'guard_open_simple',
  'hunter_idiot_open',
  'day_start',
  'day_peaceful',
  'day_last_words',
  'vote_start',
  'vote_tie_night',
  'game_over_good',
  'game_over_wolf',
]);

/**
 * 校验指定 cue 是否为禁止向公共播报的私密或涉密 cue
 */
export function isForbiddenPublicCue(cue: string): boolean {
  return !TIMELINE_PUBLIC_CUES.has(cue) || !isPublicVoiceCue(cue);
}

export interface ShouldPlayVoiceOptions {
  readonly mode: 'auto' | 'manual' | null;
  readonly paused: boolean;
  readonly cue: string | null;
  readonly isHost: boolean;
  readonly isModerator: boolean;
  readonly localSettingEnabled: boolean | null;
  readonly volume: number;
}

/**
 * 判定当前设备在当前环节是否应播放时间线语音（Contract F / T11）：
 * - manual 模式永不自动播报
 * - 暂停或音量为 0 不出声
 * - 无 cue 或属于违禁私密 cue 不出声
 * - 本机设置优先；若无本机设置，仅 host / moderator 默认出声，其他设备默认静音仅显示字幕
 */
export function shouldPlayTimelineVoice(options: ShouldPlayVoiceOptions): {
  readonly shouldPlay: boolean;
  readonly reason?: string;
} {
  const { mode, paused, cue, isHost, isModerator, localSettingEnabled, volume } = options;

  if (mode === 'manual') {
    return { shouldPlay: false, reason: 'manual_mode' };
  }
  if (paused) {
    return { shouldPlay: false, reason: 'paused' };
  }
  if (!cue) {
    return { shouldPlay: false, reason: 'no_cue' };
  }
  if (isForbiddenPublicCue(cue)) {
    return { shouldPlay: false, reason: 'forbidden_cue' };
  }
  if (volume <= 0) {
    return { shouldPlay: false, reason: 'muted' };
  }

  if (localSettingEnabled !== null) {
    return { shouldPlay: localSettingEnabled, reason: 'local_setting' };
  }

  // 默认设备规则：仅房主或主持人出声
  const isDefaultDevice = isHost || isModerator;
  return { shouldPlay: isDefaultDevice, reason: isDefaultDevice ? 'default_device' : 'non_host_default_silent' };
}

/**
 * 根据时间线开始时间、当前同步时钟与台词时长，计算起播偏移（Contract F / T11）：
 * - 若已超过台词总时长，绝不重放/补播过期句子（canPlay: false）
 * - 若尚在播报窗口内，从已过秒数起播（offsetSeconds: elapsed / 1000）
 */
export function calculateTimelineCueOffset(
  startedAt: number,
  adjustedNow: number,
  durationMs: number,
): { readonly canPlay: boolean; readonly offsetSeconds: number } {
  const elapsedMs = adjustedNow - startedAt;
  if (elapsedMs >= durationMs) {
    return { canPlay: false, offsetSeconds: 0 };
  }
  if (elapsedMs <= 0) {
    return { canPlay: true, offsetSeconds: 0 };
  }
  return { canPlay: true, offsetSeconds: elapsedMs / 1000 };
}

/** 队列键 → 音频文件（相对 WEREWOLF_VOICE_BASE；文件名含中文，播放时 encodeURI）。 */
export const CUE_FILES: Readonly<Record<string, string>> = {
  ...Object.fromEntries([
    ...Object.values(WEREWOLF_VOICE_CATALOG).filter(e => e.availability === 'public').map(e => [e.cue, e.file]),
    ...Object.entries(WEREWOLF_VOICE_ALIASES).filter(([,cue]) => isPublicVoiceCue(cue)).map(([alias,cue]) => [alias, WEREWOLF_VOICE_CATALOG[cue]!.file]),
  ]),
  ...(WEREWOLF_VOICE_CATALOG.seer_result_generic ? { seer_result_generic: WEREWOLF_VOICE_CATALOG.seer_result_generic.file } : {}),
};

/**
 * 检查某个 key 是否在映射表中有配置。
 */
export function hasCue(key: string): boolean {
  return key in CUE_FILES;
}

/** 音频元素工厂；测试可注入替身以模拟播放/挂起行为。 */
export type AudioFactory = (url: string) => HTMLAudioElement;

let audioFactory: AudioFactory = (url) => new Audio(url);

/** 注入 Audio 工厂（测试用）；传 null 恢复默认实现。 */
export function setAudioFactory(factory: AudioFactory | null): void {
  audioFactory = factory ?? ((url) => new Audio(url));
}

/**
 * 单曲播放看门狗：后台标签页等场景下 onended 可能永不触发，
 * 超时后强制结算（按最长台词富余取 30s）。
 */
const PLAY_WATCHDOG_MS = 30_000;

/** 法官语音队列单例。 */
class JudgeVoiceQueue {
  #queue: string[] = [];
  #playing = false;
  #currentAudio: HTMLAudioElement | null = null;
  #currentSettle: ((value: boolean) => void) | null = null;
  #processTimer: ReturnType<typeof setTimeout> | null = null;
  /** 在途 playCue 的结算器：interrupt 时统一以 false 结算，杜绝协程挂死。 */
  #waiters = new Set<(value: boolean) => void>();

  /**
   * 停止当前播放并清空排队队列，结算所有在途等待。
   * 用于阶段突变、终局接管或新一轮夜晚到来时重置。
   */
  interrupt(): void {
    if (this.#processTimer !== null) {
      clearTimeout(this.#processTimer);
      this.#processTimer = null;
    }
    this.#queue = [];
    this.#currentSettle = null;
    const waiters = [...this.#waiters];
    this.#waiters.clear();
    const audio = this.#currentAudio;
    this.#currentAudio = null;
    this.#playing = false;
    if (audio) {
      // 先摘掉事件句柄再 pause，避免与统一结算竞争
      audio.onended = null;
      audio.onerror = null;
      audio.pause();
      try {
        audio.currentTime = 0;
      } catch {
        // 已释放的音频元素重置进度可能抛错，忽略
      }
    }
    for (const waiter of waiters) waiter(false);
  }

  /**
   * 追加一条语音到播放队列末尾。
   */
  enqueue(key: string): void {
    if (!hasCue(key)) return;
    this.#queue.push(key);
    this.#process();
  }

  /**
   * 精确播放单个 CUE 音频，并返回 Promise 直到其播放完成或被打断。
   * 打断（interrupt/stopAll）时以 false 结算；适合串行步进器。
   */
  async playCue(key: string): Promise<boolean> {
    const file = CUE_FILES[key];
    if (!file) return false;
    const url = `${WEREWOLF_VOICE_BASE}/${encodeURI(file)}`;

    return new Promise<boolean>((resolve) => {
      let settled = false;
      let watchdog: ReturnType<typeof setTimeout> | null = null;
      const settle = (value: boolean) => {
        if (settled) return;
        settled = true;
        if (this.#currentSettle === settle) {
          this.#currentSettle = null;
        }
        if (watchdog !== null) clearTimeout(watchdog);
        this.#waiters.delete(settle);
        resolve(value);
      };

      try {
        if (this.#currentAudio) {
          const prev = this.#currentAudio;
          const prevSettle = this.#currentSettle;
          this.#currentAudio = null;
          this.#currentSettle = null;
          prev.onended = null;
          prev.onerror = null;
          prev.pause();
          try {
            prev.currentTime = 0;
          } catch {
            // 忽略已释放元素的重置错误
          }
          if (prevSettle) {
            this.#waiters.delete(prevSettle);
            prevSettle(false);
          }
        }
        const audio = audioFactory(url);
        this.#currentAudio = audio;
        this.#currentSettle = settle;
        this.#waiters.add(settle);
        audio.onended = () => {
          if (this.#currentAudio === audio) this.#currentAudio = null;
          settle(true);
        };
        audio.onerror = () => {
          if (this.#currentAudio === audio) this.#currentAudio = null;
          settle(false);
        };
        watchdog = setTimeout(() => {
          if (this.#currentAudio === audio) this.#currentAudio = null;
          settle(false);
        }, PLAY_WATCHDOG_MS);
        void audio.play().catch(() => {
          if (this.#currentAudio === audio) this.#currentAudio = null;
          settle(false);
        });
      } catch {
        settle(false);
      }
    });
  }

  /**
   * 停止所有声音。
   */
  stopAll(): void {
    this.interrupt();
  }

  /**
   * 播放权威时间线单曲 cue（Contract F / T11）：
   * - 立即打断并清理旧音频，不入旧队列
   * - 支持从已流逝的 offsetSeconds 处起播
   * - 捕获浏览器自动播放受限异常，返回 { success: false, blocked: true }
   */
  async playTimelineCue(
    cue: string,
    offsetSeconds: number = 0,
    volume: number = 0.8,
    announcement: boolean = false,
  ): Promise<{ success: boolean; blocked?: boolean }> {
    this.interrupt();
    if (announcement ? !isPublicVoiceCue(cue) : isForbiddenPublicCue(cue)) return { success: false };
    const file = CUE_FILES[cue];
    if (!file) return { success: false };
    const url = `${WEREWOLF_VOICE_BASE}/${encodeURI(file)}`;

    return new Promise((resolve) => {
      let settled = false;
      let audio: HTMLAudioElement | null = null;
      let watchdog: ReturnType<typeof setTimeout> | null = null;
      const settle = (success: boolean, blocked = false) => {
        if (settled) return;
        settled = true;
        if (watchdog !== null) clearTimeout(watchdog);
        this.#waiters.delete(settleWrapper);
        if (audio) {
          audio.onended = null;
          audio.onerror = null;
          audio.pause();
        }
        if (this.#currentAudio === audio) this.#currentAudio = null;
        resolve({ success, blocked });
      };
      const settleWrapper = (val: boolean) => settle(val);
      this.#waiters.add(settleWrapper);
      try {
        audio = audioFactory(url);
        this.#currentAudio = audio;
        audio.volume = Math.max(0, Math.min(1, volume));
        if (offsetSeconds > 0) audio.currentTime = offsetSeconds;
        audio.onended = () => settle(true);
        audio.onerror = () => settle(false);
        watchdog = setTimeout(() => settle(false), PLAY_WATCHDOG_MS);
        void Promise.resolve(audio.play()).catch((err: unknown) => {
          settle(false, err instanceof Error && err.name === 'NotAllowedError');
        });
      } catch { settle(false); }
    });
  }

  #process(): void {
    if (this.#playing || this.#queue.length === 0) return;
    const key = this.#queue.shift();
    if (!key) return;

    const file = CUE_FILES[key];
    if (!file) {
      this.#process();
      return;
    }

    this.#playing = true;
    const url = `${WEREWOLF_VOICE_BASE}/${encodeURI(file)}`;

    try {
      const audio = audioFactory(url);
      this.#currentAudio = audio;

      const finish = () => {
        if (this.#currentAudio === audio) {
          this.#currentAudio = null;
        }
        this.#playing = false;
        this.#processTimer = setTimeout(() => {
          this.#processTimer = null;
          this.#process();
        }, 500);
      };

      audio.onended = finish;
      audio.onerror = finish;
      audio.play().catch(finish);
    } catch {
      this.#playing = false;
      this.#process();
    }
  }
}

export const judgeVoice = new JudgeVoiceQueue();
