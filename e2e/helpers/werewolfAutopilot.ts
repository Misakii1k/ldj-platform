/**
 * 狼人杀自动对局驱动（截图与视觉验收用）。
 *
 * 为房间里除浏览器玩家外的每个席位维持一个 Node 侧 RoomDriver，按各自身份视角
 * 自动执行合法动作（确认身份 → 夜间行动 → 天亮确认 → 发言交麦 → 投票 → 遗言），
 * 让真实对局能稳定推进到任意阶段。支持：
 * - `nightScript`：指定狼刀目标、预言家查验、女巫用药、守卫守护（控制夜晚结果）；
 * - `votePlan`：逐席位指定投票目标（null = 弃票），凑出任意票型；
 * - `pauseSpeakers`：指定席位到达发言轮次时不交麦，留给截图时间窗；
 * - `releaseSpeaker` / `resumeAll`：截图完成后放行。
 *
 * 一切都走真实 WS 协议与真实 reducer；驱动只做玩家本人视角允许做的事。
 */
import type { SeededPlayer } from './dbClient.ts';
import { RoomDriver } from './wsClient.ts';

export interface NightScript {
  /** 狼人袭击目标席位（1 起）；null/缺省 = 刀 1 号 */
  victimSeat?: number | null;
  /** 预言家查验目标席位；null/缺省 = 验 2 号 */
  seerCheckSeat?: number | null;
  /** 女巫是否用解药（默认 false） */
  witchSaves?: boolean;
  /** 女巫毒药目标席位；null/缺省 = 不用毒 */
  witchPoisonSeat?: number | null;
  /** 守卫守护目标席位；null/缺省 = 空守 */
  guardSeat?: number | null;
}

export interface DriveState {
  phase: string;
  day: number;
  currentSpeakerSeat: number | null;
  seatOf: (playerId: string) => number | null;
}

export class WerewolfAutopilot {
  readonly drivers = new Map<string, RoomDriver>();
  readonly roles = new Map<string, string>();
  /** 暂停交麦的发言者席位（1 起） */
  private pausedSpeakers = new Set<number>();
  /** 投票方案：key=投票人席位，value=目标席位（null=弃票） */
  votePlan = new Map<number, number | null>();
  nightScript: NightScript = {};
  private running = false;
  private stopRequested = false;

  private constructor(readonly roomCode: string) {}

  /** 为 players 逐个 resume 一个驱动（通常排除浏览器玩家席位）。 */
  static async start(wsUrl: string, roomCode: string, players: readonly SeededPlayer[]): Promise<WerewolfAutopilot> {
    const table = new WerewolfAutopilot(roomCode);
    for (const player of players) {
      const driver = await RoomDriver.resume(wsUrl, roomCode, player.playerId, player.resumeToken);
      table.drivers.set(player.playerId, driver);
    }
    return table;
  }

  /** 等所有驱动拿到首帧含身份的游戏视图，返回 seat→role 映射（1 起）。 */
  async probeRoles(timeoutMs = 15_000): Promise<Map<number, string>> {
    const bySeat = new Map<number, string>();
    await Promise.all([...this.drivers.entries()].map(async ([playerId, driver]) => {
      const state = await driver.waitGameState(
        (view) => typeof ((view.me as Record<string, unknown> | undefined)?.role) === 'string',
        timeoutMs,
      );
      const view = state.payload.view as Record<string, unknown>;
      const me = view.me as Record<string, unknown>;
      this.roles.set(playerId, String(me.role));
      const players = (view.players ?? []) as { playerId: string; seat: number }[];
      const mine = players.find((p) => p.playerId === playerId);
      if (mine) bySeat.set(mine.seat + 1, String(me.role));
    }));
    return bySeat;
  }

  pauseSpeaker(seat: number): void {
    this.pausedSpeakers.add(seat);
  }

  releaseSpeaker(seat: number): void {
    this.pausedSpeakers.delete(seat);
  }

  requestStop(): void {
    this.stopRequested = true;
  }

  closeAll(): void {
    this.stopRequested = true;
    for (const driver of this.drivers.values()) driver.client.close();
  }

  private seatOf(view: Record<string, unknown>, playerId: string): number | null {
    const players = (view.players ?? []) as { playerId: string; seat: number }[];
    const found = players.find((p) => p.playerId === playerId);
    return found ? found.seat + 1 : null;
  }

  private playerAtSeat(view: Record<string, unknown>, seat: number): string | null {
    const players = (view.players ?? []) as { playerId: string; seat: number; alive: boolean }[];
    const found = players.find((p) => p.seat === seat - 1);
    return found ? found.playerId : null;
  }

  /** 决定该驱动当前是否需要动作；需要则发出。返回是否执行了动作。 */
  private async step(driver: RoomDriver): Promise<boolean> {
    const env = driver.client.latestGameState(() => true);
    if (!env) return false;
    const view = env.payload.view as Record<string, unknown>;
    const me = view.me as Record<string, unknown> | null | undefined;
    if (!me || me.forfeited === true) return false;
    const phase = String(view.phase ?? '');
    const timeline = view.timeline as Record<string, unknown> | null | undefined;
    const timelineId = timeline?.id ? String(timeline.id) : undefined;
    const payload = (action: Record<string, unknown>) =>
      timelineId ? { ...action, timelineId } : action;
    const timelineRole = timeline?.role ? String(timeline.role) : null;
    const segment = timeline?.segment ? String(timeline.segment) : null;
    const isActionWindow = !timeline || (segment === 'action');

    const send = async (action: Record<string, unknown>) => {
      try {
        await driver.gameAction(payload(action));
      } catch {
        /* 非法动作被服务端拒绝：忽略，继续轮询 */
      }
    };

    if (phase === 'role_reveal' && me.confirmedRole === false) {
      await send({ type: 'confirm_role' });
      return true;
    }
    if (phase === 'day_announcement' && me.confirmedAnnouncement === false) {
      await send({ type: 'confirm_announcement' });
      return true;
    }
    if (phase === 'night' && me.alive === true && isActionWindow) {
      const role = String(me.role ?? '');
      if (role !== timelineRole && timeline) return false;
      if (role === 'wolf' && me.hasNightVoted !== true) {
        const targetSeat = this.nightScript.victimSeat ?? 1;
        const target = this.playerAtSeat(view, targetSeat);
        if (target) {
          await send({ type: 'night_kill', targetPlayerId: target });
          return true;
        }
      }
      if (role === 'seer' && me.seerCheckedThisNight !== true) {
        const targetSeat = this.nightScript.seerCheckSeat ?? 2;
        const target = this.playerAtSeat(view, targetSeat);
        if (target && target !== playerIdable(me)) {
          await send({ type: 'seer_check', targetPlayerId: target });
          return true;
        }
      }
      if (role === 'witch') {
        if (me.witchSaveDecision === null) {
          await send({ type: 'witch_save', save: this.nightScript.witchSaves === true });
          return true;
        }
        if (me.witchPoisonDecided !== true && me.witchPoisonUsed !== true) {
          const poisonSeat = this.nightScript.witchPoisonSeat ?? null;
          const target = poisonSeat ? this.playerAtSeat(view, poisonSeat) : null;
          if (!poisonSeat || target) {
            await send({ type: 'witch_poison', targetPlayerId: poisonSeat ? target : null });
            return true;
          }
        }
      }
      if (role === 'guard' && me.guardDecided !== true) {
        const guardSeat = this.nightScript.guardSeat ?? null;
        const target = guardSeat ? this.playerAtSeat(view, guardSeat) : null;
        if (!guardSeat || target) {
          await send({ type: 'guard_guard', targetPlayerId: guardSeat ? target : null });
          return true;
        }
      }
      return false;
    }
    if (phase === 'hunter_shot' && me.pendingShoot === true) {
      await send({ type: 'hunter_shoot', targetPlayerId: null });
      return true;
    }
    if (phase === 'discussion' && me.alive === true && view.currentSpeakerId === me.playerId) {
      const mySeat = this.seatOf(view, String(me.playerId));
      if (mySeat !== null && this.pausedSpeakers.has(mySeat)) return false;
      await send({ type: 'finish_speech' });
      return true;
    }
    if (phase === 'free_discussion' && me.alive === true && me.hasReadiedVote !== true) {
      await send({ type: 'ready_vote' });
      return true;
    }
    if ((phase === 'voting' || phase === 'runoff_voting')
      && me.alive === true && me.hasVoted !== true && me.idiotRevealed !== true) {
      const mySeat = this.seatOf(view, String(me.playerId));
      if (mySeat === null) return false;
      if (phase === 'runoff_voting') {
        const candidates = (view.runoffCandidates ?? []) as string[];
        if (candidates.includes(String(me.playerId))) return false;
      }
      if (!this.votePlan.has(mySeat)) return false; // 未排票的席位先不动
      const targetSeat = this.votePlan.get(mySeat) ?? null;
      const target = targetSeat ? this.playerAtSeat(view, targetSeat) : null;
      if (targetSeat && !target) return false;
      this.votePlan.delete(mySeat); // 只投一次
      await send({ type: 'day_vote', targetPlayerId: target });
      return true;
    }
    if (phase === 'last_words' && view.lastWordsPlayerId === me.playerId) {
      // 注意：遗言者是刚出局的人（me.alive === false），不能按存活过滤
      const mySeat = this.seatOf(view, String(me.playerId));
      if (mySeat !== null && this.pausedSpeakers.has(mySeat)) return false;
      await send({ type: 'finish_last_words' });
      return true;
    }
    return false;
  }

  /**
   * 主循环：轮流让每个驱动响应视图，直到 `until` 返回 true 或被 requestStop。
   * `until` 收到任意驱动看到的最新公共视图（phase/day/currentSpeakerId 等）。
   */
  async run(
    until?: (state: DriveState) => boolean,
    options: { idleMs?: number; timeoutMs?: number } = {},
  ): Promise<void> {
    const idleMs = options.idleMs ?? 120;
    const deadline = Date.now() + (options.timeoutMs ?? 10 * 60_000);
    if (this.running) throw new Error('autopilot 已在运行');
    this.running = true;
    this.stopRequested = false;
    try {
      while (!this.stopRequested) {
        if (Date.now() > deadline) throw new Error('autopilot 运行超时');
        let acted = false;
        let reached = false;
        for (const driver of this.drivers.values()) {
          if (until) {
            const env = driver.client.latestGameState(() => true);
            const view = env?.payload.view as Record<string, unknown> | undefined;
            if (view && until({
              phase: String(view.phase ?? ''),
              day: Number(view.day ?? 0),
              currentSpeakerSeat: view.currentSpeakerId ? this.seatOf(view, String(view.currentSpeakerId)) : null,
              seatOf: (pid) => this.seatOf(view, pid),
            })) {
              reached = true;
            }
          }
          if (await this.step(driver)) acted = true;
        }
        if (reached) return;
        if (!acted) await new Promise((resolve) => setTimeout(resolve, idleMs));
      }
    } finally {
      this.running = false;
    }
  }
}

function playerIdable(me: Record<string, unknown>): string {
  return String(me.playerId ?? '');
}
