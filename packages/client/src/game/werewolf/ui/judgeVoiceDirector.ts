/**
 * 法官语音导演：把狼人杀全流程语音收敛为单一串行演出队列。
 *
 * 修复"语音与实际进程不一致"的核心机制：
 * - 夜晚剧场是完整主持演出：不再因服务端提前结算而拦腰截断（仅终局/卸载可接管）；
 *   服务端提前结算时，各角色等待垫场自动折叠，台词仍逐条播完；
 * - 所有段（夜晚剧场/天亮死讯/叫号/投票/放逐/技能）按入队顺序串行执行，
 *   天亮死讯必定排在叫号之前，投票/放逐不会盖掉死讯；
 * - epoch 接管：终局使在演段立即失效，各协程在 finally 中清理视觉锁标志，
 *   杜绝僵尸 await 导致的永久静音与操作面板锁死；
 * - 新鲜度检查：出队时段已明显滞后（服务端已进入更晚阶段）则跳过，
 *   避免机器人快局中语音与屏幕内容南辕北辙；
 * - bootstrap：挂载/重连时把当前状态视为"已播报"，不重放历史语音。
 */
import type { WerewolfPresentationModel } from '../presentation.ts';
import { hasCue, judgeVoice } from './judgeVoice.ts';

export type NightActiveRole = 'wolf' | 'witch' | 'seer' | 'guard' | null;

export interface JudgeVoiceDirectorFlags {
  readonly currentNightRole: NightActiveRole;
  readonly isNightVoiceRunning: boolean;
  readonly isDayAnnouncementRunning: boolean;
  readonly roleRemainingSeconds: number | null;
  readonly roleTotalSeconds: number | null;
}

export interface JudgeVoiceDirectorHost {
  getModel(): WerewolfPresentationModel;
  onUpdate(flags: JudgeVoiceDirectorFlags): void;
  /** 毫秒时钟（waitForRole 的计时基准），可注入假时钟。 */
  now(): number;
  /** setTimeout 的可注入替身；返回取消函数。 */
  startTimer(ms: number, onFire: () => void): () => void;
  /** setInterval 的可注入替身；返回取消函数。 */
  startTicker(ms: number, onTick: () => void): () => void;
}

type Segment =
  | { kind: 'night'; day: number }
  | { kind: 'dawn'; day: number; seats: readonly number[]; isDay1: boolean }
  | { kind: 'speak'; day: number; playerId: string; seatIndex: number }
  | { kind: 'vote_start'; day: number }
  | { kind: 'exile'; day: number; seatIndex: number }
  | { kind: 'tie_night'; day: number }
  | { kind: 'hunter'; day: number }
  | { kind: 'idiot'; day: number };

const STAGE_ORDER: Record<string, number> = {
  wolf: 0,
  witch: 1,
  seer: 2,
  guard: 3,
  done: 4,
};

const EPOCH_POLL_MS = 100;
const ROLE_TICK_MS = 250;
const FLAG_WAIT_TICK_MS = 50;
const FLAG_WAIT_BOUND_MS = 3000;

const INITIAL_FLAGS: JudgeVoiceDirectorFlags = {
  currentNightRole: null,
  isNightVoiceRunning: false,
  isDayAnnouncementRunning: false,
  roleRemainingSeconds: null,
  roleTotalSeconds: null,
};

export class JudgeVoiceDirector {
  readonly #host: JudgeVoiceDirectorHost;
  /** 演出段队列：严格 FIFO，段之间互不打断。 */
  #segments: Segment[] = [];
  #pumping = false;
  /** 全局代际：终局接管/卸载时递增，使在演协程失效。 */
  #epoch = 0;
  #disposed = false;
  #flags: JudgeVoiceDirectorFlags = { ...INITIAL_FLAGS };
  #prevSync: { phase: string; day: number } | null = null;

  /** 已入队/已播报的一次性段标记（vote_start/exile/hunter/idiot/tie）。 */
  #tags = new Set<string>();
  /** 最后入队夜晚剧场的天数（bootstrap 时用于抑制历史重放）。 */
  #nightDayQueued = -1;
  /** 最后入队天亮死讯的天数。 */
  #dawnDayQueued = -1;
  /** 本客户端完整演过夜晚剧场的最大天数（滞后局中死讯播报的豁免依据）。 */
  #lastTheaterDay = -1;
  #lastSpeakDay = -1;
  #lastSpeakPlayerId: string | null = null;

  constructor(host: JudgeVoiceDirectorHost) {
    this.#host = host;
  }

  /**
   * 挂载引导：把当前视图状态视为"已播报"。
   * 重连/重挂载不再从"天黑请闭眼"重放整夜，也不重放已过的死讯/投票/技能。
   */
  bootstrap(model: WerewolfPresentationModel): void {
    const { phase, day } = model;
    this.#prevSync = { phase, day };
    this.#nightDayQueued = day;
    // 夜晚中途挂载：当日死讯尚未到播报时机，不能标记为已处理
    this.#dawnDayQueued = phase === 'night' ? day - 1 : day;
    this.#lastTheaterDay = phase === 'night' ? -1 : day - 1;
    this.#lastSpeakDay = day;
    this.#lastSpeakPlayerId = model.seats.find((s) => s.isSpeaking)?.playerId ?? null;
    if (phase === 'voting') this.#tags.add(`vote_start:${day}`);
    if (phase === 'vote_result') {
      const exiled = model.voteLedger?.exiledSeat ?? null;
      if (exiled !== null) this.#tags.add(`exile:${day}:${exiled}`);
      if (model.voteLedger?.outcome === 'runoff_tie') this.#tags.add(`tie:${day}`);
    }
    if (phase === 'hunter_shot') this.#tags.add(`hunter:${day}`);
    for (const seat of model.seats) {
      if (seat.idiotRevealed) this.#tags.add(`idiot:${day}:${seat.playerId}`);
    }
  }

  /**
   * 视图同步入口（幂等，每次渲染调用）：按当前 phase 把语音段入队，
   * 去重/合并全部由导演内部标记负责。
   */
  sync(model: WerewolfPresentationModel): void {
    if (this.#disposed) return;
    const prev = this.#prevSync;
    const { phase, day } = model;
    this.#prevSync = { phase, day };

    if (phase === 'game_over') {
      if (!prev || prev.phase !== 'game_over') this.#takeoverGameOver(model.winner);
      return;
    }

    if (phase === 'night' && (!prev || prev.phase !== 'night' || prev.day !== day)) {
      this.#queueNight(day);
    } else if (phase === 'day_announcement') {
      this.#queueDawnOnce(model);
    } else if (phase === 'discussion') {
      // 兜底：快局中两帧快照合并跳过 day_announcement 时，仍补播死讯
      this.#queueDawnOnce(model);
      this.#trackSpeaker(model);
    } else if (phase === 'voting') {
      this.#queueTagged({ kind: 'vote_start', day }, `vote_start:${day}`);
    } else if (phase === 'vote_result') {
      this.#queueVoteResult(model);
    } else if (phase === 'hunter_shot') {
      this.#queueTagged({ kind: 'hunter', day }, `hunter:${day}`);
    }
    // runoff_voting（加赛）暂无专用语音；last_words 的出局播报已由 exile 段覆盖
    this.#trackIdiot(model);
  }

  /** 终局接管：使在演段失效、清空队列，播报胜负。 */
  #takeoverGameOver(winner: WerewolfPresentationModel['winner']): void {
    this.#epoch += 1;
    this.#segments = [];
    judgeVoice.interrupt();
    void (async () => {
      const epoch = this.#epoch;
      let waited = 0;
      while (
        waited < FLAG_WAIT_BOUND_MS &&
        (this.#flags.isNightVoiceRunning || this.#flags.isDayAnnouncementRunning)
      ) {
        if (this.#epoch !== epoch) return;
        await this.#sleep(FLAG_WAIT_TICK_MS, epoch);
        waited += FLAG_WAIT_TICK_MS;
      }
      if (this.#epoch !== epoch) return;
      const key = winner === 'village' ? 'game_over_good' : winner === 'wolves' ? 'game_over_wolf' : null;
      if (key && hasCue(key)) await judgeVoice.playCue(key);
    })();
  }

  /** 卸载：终止一切语音活动。静默重置标志，不再回调宿主。 */
  dispose(): void {
    this.#disposed = true;
    this.#epoch += 1;
    this.#segments = [];
    this.#flags = { ...INITIAL_FLAGS };
    judgeVoice.stopAll();
  }

  // ---------------------------------------------------------------- 触发入队

  #queueNight(day: number): void {
    if (this.#nightDayQueued === day) return;
    this.#nightDayQueued = day;
    this.#segments.push({ kind: 'night', day });
    this.#pump();
  }

  #queueDawnOnce(model: WerewolfPresentationModel): void {
    if (this.#dawnDayQueued === model.day) return;
    this.#dawnDayQueued = model.day;
    this.#segments.push({
      kind: 'dawn',
      day: model.day,
      seats: [...model.nightDeathSeats],
      isDay1: model.day === 1,
    });
    this.#pump();
  }

  #queueTagged(segment: Segment, tag: string): void {
    if (this.#tags.has(tag)) return;
    this.#tags.add(tag);
    this.#segments.push(segment);
    this.#pump();
  }

  #queueVoteResult(model: WerewolfPresentationModel): void {
    const exiledSeat = model.voteLedger?.exiledSeat ?? null;
    if (exiledSeat !== null) {
      const isExiledHunter =
        model.pendingShooterId !== null &&
        model.seats[exiledSeat]?.playerId === model.pendingShooterId;
      // 被放逐猎人由 hunter 段播报，避免重复
      if (!isExiledHunter) {
        this.#queueTagged({ kind: 'exile', day: model.day, seatIndex: exiledSeat }, `exile:${model.day}:${exiledSeat}`);
      }
      return;
    }
    if (model.voteLedger?.outcome === 'runoff_tie') {
      this.#queueTagged({ kind: 'tie_night', day: model.day }, `tie:${model.day}`);
    }
  }

  #trackSpeaker(model: WerewolfPresentationModel): void {
    const speakerId = model.seats.find((s) => s.isSpeaking)?.playerId ?? null;
    if (!speakerId) return;
    if (this.#lastSpeakDay !== model.day) {
      this.#lastSpeakDay = model.day;
      this.#lastSpeakPlayerId = null;
    }
    if (speakerId === this.#lastSpeakPlayerId) return;
    this.#lastSpeakPlayerId = speakerId;
    const seatIndex = model.seats.findIndex((s) => s.playerId === speakerId);
    if (seatIndex < 0) return;
    // 合并：同一日尚未播出的叫号以最新发言者为准，避免快局中积压回放
    this.#segments = this.#segments.filter((s) => !(s.kind === 'speak' && s.day === model.day));
    this.#segments.push({ kind: 'speak', day: model.day, playerId: speakerId, seatIndex });
    this.#pump();
  }

  #trackIdiot(model: WerewolfPresentationModel): void {
    let added = false;
    for (const seat of model.seats) {
      if (!seat.idiotRevealed) continue;
      const tag = `idiot:${model.day}:${seat.playerId}`;
      if (this.#tags.has(tag)) continue;
      this.#tags.add(tag);
      this.#segments.push({ kind: 'idiot', day: model.day });
      added = true;
    }
    if (added) this.#pump();
  }

  // ---------------------------------------------------------------- 串行执行

  #pump(): void {
    if (this.#pumping) return;
    this.#pumping = true;
    void (async () => {
      try {
        while (this.#segments.length > 0) {
          const myEpoch = this.#epoch;
          const segment = this.#segments.shift()!;
          await this.#execute(segment, myEpoch);
          if (this.#epoch !== myEpoch) {
            this.#segments = [];
            return;
          }
        }
      } finally {
        this.#pumping = false;
      }
    })();
  }

  async #execute(segment: Segment, epoch: number): Promise<void> {
    switch (segment.kind) {
      case 'night':
        await this.#executeNight(segment.day, epoch);
        return;
      case 'dawn':
        await this.#executeDawn(segment, epoch);
        return;
      case 'speak': {
        const model = this.#host.getModel();
        const stillSpeaking = model.seats.find((s) => s.isSpeaking)?.playerId === segment.playerId;
        if (this.#epoch !== epoch || model.day !== segment.day || !stillSpeaking) return;
        const normalCue = `speak_normal_${segment.seatIndex + 1}`;
        const key = hasCue(normalCue) ? normalCue : `speak_${segment.seatIndex + 1}`;
        if (hasCue(key)) await judgeVoice.playCue(key);
        return;
      }
      case 'vote_start': {
        const model = this.#host.getModel();
        if (this.#epoch !== epoch || model.day !== segment.day || model.phase !== 'voting') return;
        await judgeVoice.playCue('vote_start');
        return;
      }
      case 'exile': {
        const model = this.#host.getModel();
        if (this.#epoch !== epoch || model.day !== segment.day) return;
        if (model.phase !== 'vote_result' && model.phase !== 'last_words') return;
        const key = `exile_${segment.seatIndex + 1}`;
        if (hasCue(key)) await judgeVoice.playCue(key);
        return;
      }
      case 'tie_night': {
        const model = this.#host.getModel();
        if (this.#epoch !== epoch || model.day !== segment.day || model.phase !== 'vote_result') return;
        await judgeVoice.playCue('vote_tie_night');
        return;
      }
      case 'hunter': {
        const model = this.#host.getModel();
        if (this.#epoch !== epoch || model.day !== segment.day || model.phase !== 'hunter_shot') return;
        await judgeVoice.playCue('hunter_shoot');
        return;
      }
      case 'idiot': {
        if (this.#epoch !== epoch) return;
        await judgeVoice.playCue('idiot_reveal');
        return;
      }
    }
  }

  // ------------------------------------------------------------- 夜晚剧场

  /**
   * 整夜主持剧场：天黑→狼人→女巫→预言家→守卫→猎人白痴确认。
   * 仅 epoch 接管（终局/卸载）可中止；服务端提前结算只折叠各角色的
   * 等待垫场，台词仍逐条完整播出。
   */
  async #executeNight(day: number, epoch: number): Promise<void> {
    const valid = () => this.#epoch === epoch;
    const model = this.#host.getModel();
    if (this.#disposed || model.day !== day) return;
    this.#patchFlags({
      isNightVoiceRunning: true,
      currentNightRole: null,
      roleRemainingSeconds: null,
      roleTotalSeconds: null,
    });

    const play = async (key: string): Promise<boolean> => {
      if (!valid() || !hasCue(key)) return false;
      return judgeVoice.playCue(key);
    };
    const sleep = (ms: number) => this.#sleep(ms, epoch);
    const waitForRole = (
      role: 'wolf' | 'witch' | 'seer' | 'guard',
      isSelfAct: () => boolean,
      simulatedMs = 4000,
      maxWaitMs = 15000,
    ) => this.#waitForRole(epoch, role, isSelfAct, simulatedMs, maxWaitMs);

    try {
      // 1. 开场：天黑请闭眼
      await play('night_start');
      if (!valid()) return;
      await sleep(600);
      if (!valid()) return;

      // 2. 狼人环节
      this.#patchFlags({ currentNightRole: 'wolf' });
      if (day <= 1) {
        await play('wolf_open_first');
        if (!valid()) return;
        await sleep(400);
        if (!valid()) return;
        await play('wolf_kill');
      } else {
        await play('wolf_open_normal');
        if (!valid()) return;
        await sleep(400);
        if (!valid()) return;
        await play('wolf_kill');
      }
      if (!valid()) return;

      await waitForRole('wolf', () => Boolean(this.#host.getModel().self?.hasNightVoted), 6000, 15000);
      if (!valid()) return;

      await play('wolf_close');
      if (!valid()) return;
      await sleep(600);
      if (!valid()) return;

      // 3. 女巫环节
      this.#patchFlags({ currentNightRole: 'witch' });
      await play('witch_open');
      if (!valid()) return;
      await sleep(350);
      if (!valid()) return;

      const isWitchSaveUsed = Boolean(this.#host.getModel().self?.witchSaveUsed);
      if (!isWitchSaveUsed) {
        // 解药未用时：全场播报手势指向死者（不报具体几号）并提示解药
        await play('witch_death_point');
        if (!valid()) return;
        await sleep(300);
        if (!valid()) return;
        await play('witch_cure_prompt');
        if (!valid()) return;
        await sleep(300);
        if (!valid()) return;
      }

      await play('witch_poison_prompt');
      if (!valid()) return;

      await waitForRole(
        'witch',
        () => {
          const self = this.#host.getModel().self;
          return self ? self.witchSaveDecision !== null || self.witchPoisonDecided : true;
        },
        6000,
        15000,
      );
      if (!valid()) return;

      await play('witch_close');
      if (!valid()) return;
      await sleep(600);
      if (!valid()) return;

      // 4. 预言家环节
      this.#patchFlags({ currentNightRole: 'seer' });
      await play('seer_open');
      if (!valid()) return;
      await sleep(300);
      if (!valid()) return;
      await play('seer_check');
      if (!valid()) return;

      const initialSeerCount = this.#host.getModel().self?.seerResults.length ?? 0;
      await waitForRole(
        'seer',
        () => (this.#host.getModel().self?.seerResults.length ?? 0) > initialSeerCount,
        6000,
        12000,
      );
      if (!valid()) return;
      await sleep(400);
      if (!valid()) return;

      // 全场播放留尾手势音效（不泄露好人/狼人阵营）
      await play('seer_result_generic');
      if (!valid()) return;
      await sleep(300);
      if (!valid()) return;

      await play('seer_close');
      if (!valid()) return;
      await sleep(600);
      if (!valid()) return;

      // 5. 守卫环节（若本局角色池配置了守卫）
      if (this.#host.getModel().rolesConfig.guard) {
        this.#patchFlags({ currentNightRole: 'guard' });
        await play('guard_open');
        if (!valid()) return;

        await waitForRole('guard', () => Boolean(this.#host.getModel().self?.guardDecided), 6000, 12000);
        if (!valid()) return;

        await play('guard_close');
        if (!valid()) return;
        await sleep(600);
        if (!valid()) return;
      }

      // 6. 猎人/白痴首夜确认身份
      const rolesConfig = this.#host.getModel().rolesConfig;
      if (day <= 1 && (rolesConfig.hunter || rolesConfig.idiot)) {
        await play('hunter_idiot_open');
        if (!valid()) return;
        await sleep(3000);
        if (!valid()) return;
        await play('hunter_idiot_close');
        if (!valid()) return;
        await sleep(600);
        if (!valid()) return;
      }
    } finally {
      this.#lastTheaterDay = Math.max(this.#lastTheaterDay, day);
      this.#patchFlags({
        isNightVoiceRunning: false,
        currentNightRole: null,
        roleRemainingSeconds: null,
        roleTotalSeconds: null,
      });
    }
  }

  /**
   * 单个夜间角色的等待：
   * - 本人担任该角色且未操作：等本人操作，只受服务端夜晚 deadline 约束
   *   （不再用固定 15s 上限提前剥夺操作面板）；
   * - 服务端已结算夜晚（phase 离开 night）：立即跳过垫场，台词紧凑播完；
   * - 其余情况保留最短演出时长，超时或服务端越过该环节后放行。
   */
  #waitForRole(
    epoch: number,
    role: 'wolf' | 'witch' | 'seer' | 'guard',
    isSelfAct: () => boolean,
    simulatedMs: number,
    maxWaitMs: number,
  ): Promise<void> {
    return new Promise<void>((resolve) => {
      const start = this.#host.now();
      const self = this.#host.getModel().self;
      const selfIsThisRole = self?.role === role && self.alive;
      const fallbackDurationMs = selfIsThisRole ? maxWaitMs : simulatedMs;
      this.#patchFlags({
        roleTotalSeconds: Math.round(fallbackDurationMs / 1000),
        roleRemainingSeconds: Math.round(fallbackDurationMs / 1000),
      });

      let done = false;
      let feedbackCancel: (() => void) | null = null;
      let tickerCancel: (() => void) | null = null;
      const finish = () => {
        if (done) return;
        done = true;
        feedbackCancel?.();
        tickerCancel?.();
        this.#patchFlags({ roleRemainingSeconds: null, roleTotalSeconds: null });
        resolve();
      };

      tickerCancel = this.#host.startTicker(ROLE_TICK_MS, () => {
        if (this.#epoch !== epoch) return finish();
        const model = this.#host.getModel();
        // 服务端已结算夜晚：跳过等待垫场，直接进入后续台词
        if (model.phase !== 'night') return finish();

        const serverStagePassed =
          (STAGE_ORDER[model.nightStage ?? 'done'] ?? 4) > (STAGE_ORDER[role] ?? 0);
        const deadlineAt = model.deadlineAt;
        const leftMs = deadlineAt
          ? Math.max(0, deadlineAt - this.#host.now())
          : Math.max(0, start + fallbackDurationMs - this.#host.now());
        this.#patchFlags({ roleRemainingSeconds: Math.ceil(leftMs / 1000) });

        const currentSelf = model.self;
        const selfAliveThisRole = currentSelf?.role === role && currentSelf.alive;
        const elapsed = this.#host.now() - start;

        if (selfAliveThisRole) {
          if (isSelfAct()) {
            if (!feedbackCancel) {
              feedbackCancel = this.#host.startTimer(800, () => {
                const latest = this.#host.getModel();
                const passed = (STAGE_ORDER[latest.nightStage ?? 'done'] ?? 4) > (STAGE_ORDER[role] ?? 0);
                if (passed || this.#host.now() - start >= maxWaitMs) finish();
              });
            } else if (serverStagePassed) {
              finish();
            }
          } else if (leftMs <= 0 || (!deadlineAt && elapsed >= maxWaitMs)) {
            finish();
          }
        } else if ((elapsed >= simulatedMs && serverStagePassed) || elapsed >= maxWaitMs || leftMs <= 0) {
          finish();
        }
      });
    });
  }

  // ------------------------------------------------------------- 天亮死讯

  async #executeDawn(segment: Extract<Segment, { kind: 'dawn' }>, epoch: number): Promise<void> {
    const valid = () => this.#epoch === epoch;
    // 服务端可能仍在夜晚（剧场先于超时结束）：等待其离开夜晚再播
    while (valid()) {
      const model = this.#host.getModel();
      if (model.day !== segment.day || model.phase !== 'night') break;
      await this.#sleep(FLAG_WAIT_TICK_MS * 5, epoch);
    }
    if (!valid()) return;

    const model = this.#host.getModel();
    const theaterPlayed = this.#lastTheaterDay >= segment.day;
    // 服务端已跨天且本客户端未演过当夜剧场：整整滞后一天以上，跳过历史播报
    if (model.day !== segment.day && !theaterPlayed) return;
    if (model.phase === 'game_over') return;

    this.#patchFlags({ isDayAnnouncementRunning: true });
    try {
      judgeVoice.interrupt();
      if (!valid()) return;
      await judgeVoice.playCue('day_start');
      await this.#sleep(300, epoch);
      if (!valid()) return;

      if (segment.seats.length === 0) {
        await judgeVoice.playCue('day_peaceful');
      } else {
        await judgeVoice.playCue('day_death_intro');
        await this.#sleep(200, epoch);
        if (!valid()) return;

        for (const seat of segment.seats) {
          const numberCue = `day_death_number_${seat + 1}`;
          const legacyCue = `day_death_${seat + 1}`;
          const key = hasCue(numberCue) ? numberCue : hasCue(legacyCue) ? legacyCue : null;
          if (!key) continue;
          await judgeVoice.playCue(key);
          await this.#sleep(200, epoch);
          if (!valid()) return;
        }

        if (segment.isDay1 && hasCue('day_last_words')) {
          await this.#sleep(300, epoch);
          if (!valid()) return;
          await judgeVoice.playCue('day_last_words');
        }
      }

      await this.#sleep(400, epoch);
    } finally {
      this.#patchFlags({ isDayAnnouncementRunning: false });
    }
  }

  // ---------------------------------------------------------------- 基础设施

  #sleep(ms: number, epoch: number): Promise<void> {
    return new Promise<void>((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        cancelTimer();
        cancelTicker();
        resolve();
      };
      const cancelTimer = this.#host.startTimer(ms, finish);
      const cancelTicker = this.#host.startTicker(EPOCH_POLL_MS, () => {
        if (this.#epoch !== epoch) finish();
      });
    });
  }

  #patchFlags(partial: Partial<JudgeVoiceDirectorFlags>): void {
    this.#flags = { ...this.#flags, ...partial };
    this.#host.onUpdate(this.#flags);
  }
}
