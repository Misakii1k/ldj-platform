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

/** 队列键 → 音频文件（相对 WEREWOLF_VOICE_BASE；文件名含中文，播放时 encodeURI）。 */
export const CUE_FILES: Readonly<Record<string, string>> = {
  // 夜晚基础
  night_start: '01_首夜/01_开场_天黑请闭眼.wav',
  wolf_open_first: '01_首夜/02_狼人_请睁眼确认队友.wav',
  wolf_open_normal: '01_首夜/02_狼人_请睁眼选择目标.wav',
  wolf_open: '01_首夜/02_狼人_请睁眼确认队友.wav',
  wolf_kill: '01_首夜/03_狼人_请杀人.wav',
  wolf_agree: '01_首夜/04_狼人_请统一意见.wav',
  wolf_close: '01_首夜/05_狼人_请闭眼.wav',

  // 女巫环节（全套重置新音频）
  witch_open: '01_首夜/06_女巫_请睁眼.wav',
  witch_death_point: '01_首夜/07_女巫_今晚死亡的是他.wav',
  witch_cure_prompt: '01_首夜/07_女巫_请问有一瓶解药你要用吗.wav',
  witch_poison_prompt: '01_首夜/07_女巫_你有一瓶毒药你要用吗.wav',
  witch_poison_target: '01_首夜/07_女巫_你要对谁使用.wav',
  witch_close: '01_首夜/07_女巫_请闭眼.wav',
  witch_save_generic: '01_首夜/07_女巫_今晚死亡的是他.wav',
  witch_poison: '01_首夜/07_女巫_你有一瓶毒药你要用吗.wav',

  // 预言家
  seer_open: '01_首夜/10_预言家_请睁眼.wav',
  seer_check: '01_首夜/11_预言家_请选择查验玩家.wav',
  seer_good: '01_首夜/12_预言家_身份是好人.wav',
  seer_result_generic: '01_首夜/12_预言家_这位玩家的身份是_留尾.wav',
  seer_wolf: '01_首夜/13_预言家_身份是狼人.wav',
  seer_close: '01_首夜/14_预言家_请闭眼.wav',

  // 守卫与猎人白痴
  guard_open: '01_首夜/15_守卫_请睁眼守护谁.wav',
  guard_open_simple: '01_首夜/15_守卫_请睁眼.wav',
  guard_close: '01_首夜/16_守卫_请闭眼.wav',
  hunter_idiot_open: '01_首夜/17_猎人白痴_请睁眼确认身份.wav',
  hunter_idiot_close: '01_首夜/18_猎人白痴_请闭眼.wav',
  cupid_open: '01_首夜/19_丘比特_请睁眼.wav',
  cupid_couple: '01_首夜/20_丘比特_请指定情侣.wav',
  cupid_close: '01_首夜/21_丘比特_请闭眼.wav',
  lovers_open: '01_首夜/22_情侣_请睁眼确认身份.wav',

  // 白天播报与导语+号码拼接
  day_start: '02_首个白天/01_白天_天亮了.wav',
  day_death_intro: '02_首个白天/05_死亡_昨晚死亡的玩家为_留尾.wav',
  day_death_number_1: '02_首个白天/05_死亡_号码_1号.wav',
  day_death_number_2: '02_首个白天/05_死亡_号码_2号.wav',
  day_death_number_3: '02_首个白天/05_死亡_号码_3号.wav',
  day_death_number_4: '02_首个白天/05_死亡_号码_4号.wav',
  day_death_number_5: '02_首个白天/05_死亡_号码_5号.wav',
  day_death_number_6: '02_首个白天/05_死亡_号码_6号.wav',
  day_death_number_7: '02_首个白天/05_死亡_号码_7号.wav',
  day_death_number_8: '02_首个白天/05_死亡_号码_8号.wav',
  day_death_number_9: '02_首个白天/05_死亡_号码_9号.wav',
  day_death_number_10: '02_首个白天/05_死亡_号码_10号.wav',
  day_death_number_11: '02_首个白天/05_死亡_号码_11号.wav',
  day_death_number_12: '02_首个白天/05_死亡_号码_12号.wav',
  day_peaceful: '02_首个白天/06_死亡_平安夜.wav',
  day_last_words: '02_首个白天/07_遗言_请死亡玩家发表遗言.wav',

  // 常规叫号发言 1-12 号
  speak_normal_1: '02_首个白天/02_发言_请1号玩家发言.wav',
  speak_normal_2: '02_首个白天/02_发言_请2号玩家发言.wav',
  speak_normal_3: '02_首个白天/02_发言_请3号玩家发言.wav',
  speak_normal_4: '02_首个白天/02_发言_请4号玩家发言.wav',
  speak_normal_5: '02_首个白天/02_发言_请5号玩家发言.wav',
  speak_normal_6: '02_首个白天/02_发言_请6号玩家发言.wav',
  speak_normal_7: '02_首个白天/02_发言_请7号玩家发言.wav',
  speak_normal_8: '02_首个白天/02_发言_请8号玩家发言.wav',
  speak_normal_9: '02_首个白天/02_发言_请9号玩家发言.wav',
  speak_normal_10: '02_首个白天/02_发言_请10号玩家发言.wav',
  speak_normal_11: '02_首个白天/02_发言_请11号玩家发言.wav',
  speak_normal_12: '02_首个白天/02_发言_请12号玩家发言.wav',
  speak_1: '02_首个白天/02_发言_请1号玩家发言.wav',
  speak_2: '02_首个白天/02_发言_请2号玩家发言.wav',
  speak_3: '02_首个白天/02_发言_请3号玩家发言.wav',
  speak_4: '02_首个白天/02_发言_请4号玩家发言.wav',
  speak_5: '02_首个白天/02_发言_请5号玩家发言.wav',
  speak_6: '02_首个白天/02_发言_请6号玩家发言.wav',
  speak_7: '02_首个白天/02_发言_请7号玩家发言.wav',
  speak_8: '02_首个白天/02_发言_请8号玩家发言.wav',
  speak_9: '02_首个白天/02_发言_请9号玩家发言.wav',
  speak_10: '02_首个白天/02_发言_请10号玩家发言.wav',
  speak_11: '02_首个白天/02_发言_请11号玩家发言.wav',
  speak_12: '02_首个白天/02_发言_请12号玩家发言.wav',

  // 竞选
  police_hand_up: '02_首个白天/01_竞选_天亮了请举手.wav',
  police_vote: '02_首个白天/03_竞选_请警下玩家投票.wav',

  // 放逐与遗言 1-12 号
  vote_tie_pk: '02_首个白天/08_发言_平票请发言.wav',
  vote_tie_night: '02_首个白天/09_发言_再次平票无人出局.wav',
  vote_start: '02_首个白天/10_投票_请选择放逐玩家.wav',
  exile_1: '02_首个白天/11_出局_1号出局请发遗言.wav',
  exile_2: '02_首个白天/11_出局_2号出局请发遗言.wav',
  exile_3: '02_首个白天/11_出局_3号出局请发遗言.wav',
  exile_4: '02_首个白天/11_出局_4号出局请发遗言.wav',
  exile_5: '02_首个白天/11_出局_5号出局请发遗言.wav',
  exile_6: '02_首个白天/11_出局_6号出局请发遗言.wav',
  exile_7: '02_首个白天/11_出局_7号出局请发遗言.wav',
  exile_8: '02_首个白天/11_出局_8号出局请发遗言.wav',
  exile_9: '02_首个白天/11_出局_9号出局请发遗言.wav',
  exile_10: '02_首个白天/11_出局_10号出局请发遗言.wav',
  exile_11: '02_首个白天/11_出局_11号出局请发遗言.wav',
  exile_12: '02_首个白天/11_出局_12号出局请发遗言.wav',

  // 技能与终局
  hunter_shoot: '03_技能与终局/01_猎人_请开枪.wav',
  hunter_pass: '03_技能与终局/02_猎人_放弃开枪.wav',
  idiot_reveal: '03_技能与终局/03_白痴_翻牌免死.wav',
  game_over_good: '03_技能与终局/04_终局_好人获胜.wav',
  game_over_wolf: '03_技能与终局/05_终局_狼人获胜.wav',
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
  /** 在途 playCue 的结算器：interrupt 时统一以 false 结算，杜绝协程挂死。 */
  #waiters = new Set<(value: boolean) => void>();

  /**
   * 停止当前播放并清空排队队列，结算所有在途等待。
   * 用于阶段突变、终局接管或新一轮夜晚到来时重置。
   */
  interrupt(): void {
    this.#queue = [];
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
        if (watchdog !== null) clearTimeout(watchdog);
        this.#waiters.delete(settle);
        resolve(value);
      };

      try {
        if (this.#currentAudio) {
          const prev = this.#currentAudio;
          this.#currentAudio = null;
          prev.onended = null;
          prev.onerror = null;
          prev.pause();
          try {
            prev.currentTime = 0;
          } catch {
            // 忽略已释放元素的重置错误
          }
        }
        const audio = audioFactory(url);
        this.#currentAudio = audio;
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
        this.#process();
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
