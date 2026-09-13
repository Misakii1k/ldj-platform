import test from 'node:test';
import assert from 'node:assert/strict';
import { CUE_FILES, WEREWOLF_VOICE_BASE, judgeVoice, setAudioFactory } from '../src/game/werewolf/ui/judgeVoice.ts';
import { JudgeVoiceDirector } from '../src/game/werewolf/ui/judgeVoiceDirector.ts';
import type { JudgeVoiceDirectorFlags, JudgeVoiceDirectorHost } from '../src/game/werewolf/ui/judgeVoiceDirector.ts';
import type { WerewolfPresentationModel } from '../src/game/werewolf/presentation.ts';

// ---------------------------------------------------------------- 假音频

class FakeAudio {
  /** 全局开关：true 时 onended 永不触发（模拟后台标签页音频挂起）。 */
  static hangAll = false;
  static played: string[] = [];

  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  currentTime = 0;
  paused = true;

  constructor(readonly url: string) {}

  play(): Promise<void> {
    FakeAudio.played.push(this.url);
    this.paused = false;
    if (!FakeAudio.hangAll) queueMicrotask(() => this.onended?.());
    return Promise.resolve();
  }

  pause(): void {
    this.paused = true;
  }
}

function urlOf(key: string): string {
  const file = CUE_FILES[key];
  assert.ok(file, `测试引用了不存在的 cue：${key}`);
  return `${WEREWOLF_VOICE_BASE}/${encodeURI(file)}`;
}

function playedKeys(): string[] {
  return FakeAudio.played;
}

// ---------------------------------------------------------------- 假时钟

class FakeClock {
  #nowMs = 1_000_000;
  #tasks = new Map<number, { at: number; fn: () => void; every?: number }>();
  #nextId = 1;

  readonly now = () => this.#nowMs;

  readonly startTimer = (ms: number, fn: () => void): (() => void) => {
    const id = this.#nextId += 1;
    this.#tasks.set(id, { at: this.#nowMs + ms, fn });
    return () => this.#tasks.delete(id);
  };

  readonly startTicker = (ms: number, fn: () => void): (() => void) => {
    const id = this.#nextId += 1;
    this.#tasks.set(id, { at: this.#nowMs + ms, fn, every: ms });
    return () => this.#tasks.delete(id);
  };

  async advance(ms: number): Promise<void> {
    const end = this.#nowMs + ms;
    for (;;) {
      const due = [...this.#tasks.entries()].filter(([, task]) => task.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      const [id, task] = due;
      this.#nowMs = Math.max(this.#nowMs, task.at);
      if (task.every !== undefined) task.at = this.#nowMs + task.every;
      else this.#tasks.delete(id);
      task.fn();
      // 每个 timer 触发后 flush 微任务链（onended → playCue resolve → 协程推进）
      await new Promise((resolve) => setImmediate(resolve));
    }
    this.#nowMs = end;
    await new Promise((resolve) => setImmediate(resolve));
  }
}

// ---------------------------------------------------------------- 模型工厂

type SeatOverrides = { isSpeaking?: boolean; idiotRevealed?: boolean; alive?: boolean };

function seatOf(playerId: string, seatIndex: number, overrides: SeatOverrides = {}) {
  return {
    playerId,
    name: `玩家${seatIndex + 1}`,
    seatLabel: `${seatIndex + 1}号`,
    alive: overrides.alive ?? true,
    statusLabel: overrides.alive === false ? '已出局' : '存活',
    isSelf: false,
    isSpeaking: overrides.isSpeaking ?? false,
    isWolfTeammate: false,
    idiotRevealed: overrides.idiotRevealed ?? false,
    revealedRoleLabel: null,
    targetActions: [],
  };
}

type SelfOverrides = {
  role?: string;
  alive?: boolean;
  hasNightVoted?: boolean;
  witchSaveUsed?: boolean;
  witchSaveDecision?: boolean | null;
  witchPoisonDecided?: boolean;
  guardDecided?: boolean;
  seerResultCount?: number;
};

function selfOf(playerId: string, overrides: SelfOverrides = {}) {
  return {
    playerId,
    role: overrides.role ?? 'villager',
    roleLabel: '村民',
    roleHint: '',
    alive: overrides.alive ?? true,
    artworkUrl: null,
    wolfTeammates: [],
    seerResults: Array.from({ length: overrides.seerResultCount ?? 0 }, (_, i) => ({
      night: i + 1,
      name: 'x',
      seatLabel: '1号',
      team: 'village',
      teamLabel: '好人',
    })),
    witchSaveUsed: overrides.witchSaveUsed ?? false,
    witchPoisonUsed: false,
    nightVictimName: null,
    nightVictimSeat: null,
    canWitchSelfSave: false,
    lastGuardTargetName: null,
    pendingShoot: false,
    idiotRevealed: false,
    hasNightVoted: overrides.hasNightVoted ?? false,
    witchSaveDecision: overrides.witchSaveDecision ?? null,
    witchPoisonDecided: overrides.witchPoisonDecided ?? false,
    guardDecided: overrides.guardDecided ?? false,
  };
}

type ModelOverrides = Partial<Pick<
  WerewolfPresentationModel,
  'phase' | 'day' | 'nightDeathSeats' | 'nightStage' | 'deadlineAt' | 'voteLedger' | 'pendingShooterId' | 'winner' | 'rolesConfig'
>> & { seats?: ReturnType<typeof seatOf>[]; self?: ReturnType<typeof selfOf> | null };

function makeModel(overrides: ModelOverrides = {}): WerewolfPresentationModel {
  const seats = overrides.seats ?? [seatOf('p1', 0), seatOf('p2', 1), seatOf('p3', 2)];
  return {
    phase: overrides.phase ?? 'role_reveal',
    phaseLabel: '测试',
    mood: 'day',
    day: overrides.day ?? 0,
    dayLabel: `第 ${overrides.day ?? 0} 天`,
    narrative: '',
    deadlineAt: overrides.deadlineAt ?? null,
    spectator: false,
    config: {} as WerewolfPresentationModel['config'],
    seats,
    self: overrides.self !== undefined ? overrides.self : selfOf('p1'),
    actionGroups: [],
    waitingHint: null,
    voteProgress: null,
    voteLedger: overrides.voteLedger ?? null,
    nightDeathSeats: overrides.nightDeathSeats ?? [],
    nightStage: overrides.nightStage ?? null,
    pendingShooterId: overrides.pendingShooterId ?? null,
    winner: overrides.winner ?? null,
    reveal: null,
    speakerLine: null,
    rolesConfig: overrides.rolesConfig ?? { guard: false, hunter: false, idiot: false },
  } as unknown as WerewolfPresentationModel;
}

// ---------------------------------------------------------------- 导演测试台

interface Rig {
  clock: FakeClock;
  director: JudgeVoiceDirector;
  model: { current: WerewolfPresentationModel };
  flags: JudgeVoiceDirectorFlags[];
}

function makeRig(initial: WerewolfPresentationModel): Rig {
  const clock = new FakeClock();
  const model = { current: initial };
  const flags: JudgeVoiceDirectorFlags[] = [];
  const host: JudgeVoiceDirectorHost = {
    getModel: () => model.current,
    onUpdate: (next) => flags.push(next),
    now: clock.now,
    startTimer: clock.startTimer,
    startTicker: clock.startTicker,
  };
  const director = new JudgeVoiceDirector(host);
  return { clock, director, model, flags };
}

function lastFlags(rig: Rig): JudgeVoiceDirectorFlags {
  return rig.flags[rig.flags.length - 1] ?? {
    currentNightRole: null,
    isNightVoiceRunning: false,
    isDayAnnouncementRunning: false,
    roleRemainingSeconds: null,
    roleTotalSeconds: null,
  };
}

async function advanceUntil(rig: Rig, predicate: () => boolean, capFakeMs = 600_000): Promise<void> {
  let elapsed = 0;
  while (!predicate() && elapsed < capFakeMs) {
    await rig.clock.advance(100);
    elapsed += 100;
  }
  assert.ok(predicate(), `等待条件在 ${capFakeMs}ms 假时间内未达成`);
}

const isIdle = (rig: Rig) =>
  !lastFlags(rig).isNightVoiceRunning && !lastFlags(rig).isDayAnnouncementRunning;

// ---------------------------------------------------------------- 用例

test('playCue 正常播完返回 true，挂起的音频不会自行结算', async () => {
  FakeAudio.hangAll = false;
  FakeAudio.played = [];
  setAudioFactory((url) => new FakeAudio(url));
  try {
    assert.strictEqual(await judgeVoice.playCue('day_start'), true);
    assert.deepStrictEqual(FakeAudio.played, [urlOf('day_start')]);
  } finally {
    setAudioFactory(null);
  }
});

test('playCue 在 interrupt 后立即以 false 结算（根除僵尸 await）', async () => {
  FakeAudio.hangAll = true;
  FakeAudio.played = [];
  setAudioFactory((url) => new FakeAudio(url));
  try {
    const pending = judgeVoice.playCue('night_start');
    let settled: boolean | null = null;
    void pending.then((value) => {
      settled = value;
    });
    await new Promise((resolve) => setImmediate(resolve));
    assert.strictEqual(settled, null, '挂起的音频不应自行结束');
    judgeVoice.interrupt();
    assert.strictEqual(await pending, false, 'interrupt 必须结算等待中的 playCue');
    assert.strictEqual(settled, false);
  } finally {
    FakeAudio.hangAll = false;
    setAudioFactory(null);
  }
});

test('夜晚剧场完整播完不被服务端提前结算截断，天亮死讯排在剧场之后', async () => {
  FakeAudio.hangAll = false;
  FakeAudio.played = [];
  setAudioFactory((url) => new FakeAudio(url));
  const rig = makeRig(makeModel({ phase: 'role_reveal', day: 0 }));
  rig.director.bootstrap(rig.model.current);
  try {
    rig.director.sync(rig.model.current);
    assert.deepStrictEqual(playedKeys(), [], 'role_reveal 阶段不应有任何语音');

    // 进入第 1 夜，剧场启动并锁定夜晚画面
    rig.model.current = makeModel({ phase: 'night', day: 1, nightStage: 'wolf' });
    rig.director.sync(rig.model.current);
    await advanceUntil(rig, () => lastFlags(rig).isNightVoiceRunning);
    assert.ok(playedKeys().includes(urlOf('night_start')), '剧场应以“天黑请闭眼”开场');

    // 服务端在剧场中途提前结算夜晚（机器人局常态）：进入天亮公布
    rig.model.current = makeModel({ phase: 'day_announcement', day: 1, nightDeathSeats: [0] });
    rig.director.sync(rig.model.current);
    await advanceUntil(rig, () => isIdle(rig));

    const expected = [
      'night_start',
      'wolf_open_first',
      'wolf_kill',
      'wolf_close',
      'witch_open',
      'witch_death_point',
      'witch_cure_prompt',
      'witch_poison_prompt',
      'witch_close',
      'seer_open',
      'seer_check',
      'seer_result_generic',
      'seer_close',
      'day_start',
      'day_death_intro',
      'day_death_number_1',
      'day_last_words',
    ].map(urlOf);
    assert.deepStrictEqual(playedKeys(), expected, '剧场台词必须逐条完整播出且死讯紧随其后');
    assert.strictEqual(lastFlags(rig).isNightVoiceRunning, false);
    assert.strictEqual(lastFlags(rig).isDayAnnouncementRunning, false);

    // 剧场结束后不再有新增语音
    const count = playedKeys().length;
    await rig.clock.advance(2000);
    assert.strictEqual(playedKeys().length, count);
  } finally {
    rig.director.dispose();
    setAudioFactory(null);
  }
});

test('夜晚中途挂载（重连）不重放历史语音', async () => {
  FakeAudio.hangAll = false;
  FakeAudio.played = [];
  setAudioFactory((url) => new FakeAudio(url));
  const rig = makeRig(makeModel({ phase: 'night', day: 2, nightStage: 'guard' }));
  rig.director.bootstrap(rig.model.current);
  try {
    rig.director.sync(rig.model.current);
    await rig.clock.advance(5000);
    assert.deepStrictEqual(playedKeys(), [], '重连进夜晚不得从“天黑请闭眼”重放');
    assert.strictEqual(lastFlags(rig).isNightVoiceRunning, false);
  } finally {
    rig.director.dispose();
    setAudioFactory(null);
  }
});

test('vote_result 中途挂载不重放放逐语音', async () => {
  FakeAudio.hangAll = false;
  FakeAudio.played = [];
  setAudioFactory((url) => new FakeAudio(url));
  const rig = makeRig(makeModel({
    phase: 'vote_result',
    day: 2,
    voteLedger: { headline: '', rows: [], abstained: 0, exiledSeat: 2 },
  }));
  rig.director.bootstrap(rig.model.current);
  try {
    rig.director.sync(rig.model.current);
    await rig.clock.advance(5000);
    assert.deepStrictEqual(playedKeys(), [], '重连进放逐结算不得重放 exile_X');
  } finally {
    rig.director.dispose();
    setAudioFactory(null);
  }
});

test('终局接管：打断夜晚剧场、清空队列并播报胜负', async () => {
  FakeAudio.hangAll = false;
  FakeAudio.played = [];
  setAudioFactory((url) => new FakeAudio(url));
  const rig = makeRig(makeModel({ phase: 'role_reveal', day: 0 }));
  rig.director.bootstrap(rig.model.current);
  try {
    rig.model.current = makeModel({ phase: 'night', day: 1, nightStage: 'wolf' });
    rig.director.sync(rig.model.current);
    await advanceUntil(rig, () => lastFlags(rig).isNightVoiceRunning);
    await rig.clock.advance(1500);

    rig.model.current = makeModel({ phase: 'game_over', day: 1, winner: 'wolves' });
    rig.director.sync(rig.model.current);
    await advanceUntil(rig, () => playedKeys().includes(urlOf('game_over_wolf')));
    assert.strictEqual(lastFlags(rig).isNightVoiceRunning, false, '接管后视觉锁必须解除');
    assert.ok(
      !playedKeys().includes(urlOf('witch_open')),
      '终局后不得继续播放夜晚后续台词',
    );

    const count = playedKeys().length;
    await rig.clock.advance(3000);
    assert.strictEqual(playedKeys().length, count, '终局播报后不得有新增语音');
  } finally {
    rig.director.dispose();
    setAudioFactory(null);
  }
});

test('死讯播报进行中到来的叫号会等待死讯播完，且快速连换的发言者只叫最新一次', async () => {
  FakeAudio.hangAll = false;
  FakeAudio.played = [];
  setAudioFactory((url) => new FakeAudio(url));
  const rig = makeRig(makeModel({ phase: 'role_reveal', day: 0 }));
  rig.director.bootstrap(rig.model.current);
  try {
    rig.model.current = makeModel({ phase: 'day_announcement', day: 1, nightDeathSeats: [0, 1] });
    rig.director.sync(rig.model.current);
    await advanceUntil(rig, () => lastFlags(rig).isDayAnnouncementRunning);

    // 死讯播报进行中：发言者从 1 号快速切到 2 号再切到 3 号
    rig.model.current = makeModel({
      phase: 'discussion',
      day: 1,
      seats: [seatOf('p1', 0, { isSpeaking: true }), seatOf('p2', 1), seatOf('p3', 2)],
    });
    rig.director.sync(rig.model.current);
    rig.model.current = makeModel({
      phase: 'discussion',
      day: 1,
      seats: [seatOf('p1', 0), seatOf('p2', 1, { isSpeaking: true }), seatOf('p3', 2)],
    });
    rig.director.sync(rig.model.current);
    rig.model.current = makeModel({
      phase: 'discussion',
      day: 1,
      seats: [seatOf('p1', 0), seatOf('p2', 1), seatOf('p3', 2, { isSpeaking: true })],
    });
    rig.director.sync(rig.model.current);

    await advanceUntil(rig, () => isIdle(rig));
    const played = playedKeys();
    assert.ok(played.indexOf(urlOf('speak_normal_3')) > played.indexOf(urlOf('day_start')), '叫号必须排在死讯之后');
    assert.ok(!played.includes(urlOf('speak_normal_1')), '过期的叫号应被合并掉');
    assert.ok(!played.includes(urlOf('speak_normal_2')), '过期的叫号应被合并掉');
    assert.ok(played.includes(urlOf('speak_normal_3')), '最新发言者应被叫号');
  } finally {
    rig.director.dispose();
    setAudioFactory(null);
  }
});

test('客户端完整听过当夜剧场后，即使服务端已跨天，当夜死讯仍会补播', async () => {
  FakeAudio.hangAll = false;
  FakeAudio.played = [];
  setAudioFactory((url) => new FakeAudio(url));
  const rig = makeRig(makeModel({ phase: 'role_reveal', day: 0 }));
  rig.director.bootstrap(rig.model.current);
  try {
    rig.model.current = makeModel({ phase: 'night', day: 1, nightStage: 'wolf' });
    rig.director.sync(rig.model.current);
    await advanceUntil(rig, () => lastFlags(rig).isNightVoiceRunning);

    // 服务端极快：day1 死讯尚未播出就进入第 2 夜
    rig.model.current = makeModel({ phase: 'day_announcement', day: 1, nightDeathSeats: [0] });
    rig.director.sync(rig.model.current);
    rig.model.current = makeModel({ phase: 'night', day: 2, nightStage: 'done' });
    rig.director.sync(rig.model.current);

    await advanceUntil(rig, () => isIdle(rig));
    const played = playedKeys();
    assert.ok(played.indexOf(urlOf('night_start')) < played.indexOf(urlOf('day_start')));
    assert.ok(played.includes(urlOf('day_death_number_1')), '已听过剧场的当夜死讯必须补播');
  } finally {
    rig.director.dispose();
    setAudioFactory(null);
  }
});

test('夜晚中途重连后不重放剧场，但服务端离开夜晚时死讯照常播出', async () => {
  FakeAudio.hangAll = false;
  FakeAudio.played = [];
  setAudioFactory((url) => new FakeAudio(url));
  const rig = makeRig(makeModel({ phase: 'night', day: 2, nightStage: 'guard' }));
  rig.director.bootstrap(rig.model.current);
  try {
    rig.director.sync(rig.model.current);
    await rig.clock.advance(5000);
    assert.deepStrictEqual(playedKeys(), [], '重连进夜晚不得从“天黑请闭眼”重放');
    assert.strictEqual(lastFlags(rig).isNightVoiceRunning, false);

    // 服务端结算夜晚：进入天亮公布（死讯快照由视图给出）
    rig.model.current = makeModel({ phase: 'day_announcement', day: 2, nightDeathSeats: [0] });
    rig.director.sync(rig.model.current);
    await advanceUntil(rig, () => isIdle(rig));
    assert.deepStrictEqual(playedKeys(), [
      urlOf('day_start'),
      urlOf('day_death_intro'),
      urlOf('day_death_number_1'),
    ], '重连后错过的死讯必须照常播出（非首夜不播遗言提示）');
  } finally {
    rig.director.dispose();
    setAudioFactory(null);
  }
});
