import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateTimelineCueOffset,
  isForbiddenPublicCue,
  shouldPlayTimelineVoice,
} from '../src/game/werewolf/ui/judgeVoice.ts';

test('isForbiddenPublicCue: 严格禁止私密线索（验人结果/女巫救人毒人/昨夜死者号码），允许公共报幕', () => {
  // 禁止私密与死因
  assert.equal(isForbiddenPublicCue('seer_good'), true);
  assert.equal(isForbiddenPublicCue('seer_wolf'), true);
  assert.equal(isForbiddenPublicCue('witch_save_generic'), true);
  assert.equal(isForbiddenPublicCue('witch_poison'), true);
  assert.equal(isForbiddenPublicCue('witch_poison_target'), true);
  assert.equal(isForbiddenPublicCue('day_death_number_1'), true);
  assert.equal(isForbiddenPublicCue('day_death_number_12'), true);

  // 允许公共报幕
  assert.equal(isForbiddenPublicCue('night_start'), false);
  assert.equal(isForbiddenPublicCue('wolf_open_first'), false);
  assert.equal(isForbiddenPublicCue('wolf_open_normal'), false);
  assert.equal(isForbiddenPublicCue('wolf_close'), false);
  assert.equal(isForbiddenPublicCue('witch_open'), false);
  assert.equal(isForbiddenPublicCue('witch_close'), false);
  assert.equal(isForbiddenPublicCue('seer_open'), false);
  assert.equal(isForbiddenPublicCue('seer_close'), false);
  assert.equal(isForbiddenPublicCue('guard_open'), false);
  assert.equal(isForbiddenPublicCue('guard_close'), false);
  assert.equal(isForbiddenPublicCue('day_start'), false);
});

test('shouldPlayTimelineVoice: 手动主持永不自动出声，设备默认规则与音量管控', () => {
  // 1. manual 模式永不自动出声，即使是 host 且音量为 1
  assert.equal(
    shouldPlayTimelineVoice({
      mode: 'manual',
      paused: false,
      cue: 'wolf_open_normal',
      isHost: true,
      isModerator: false,
      localSettingEnabled: null,
      volume: 1,
    }).shouldPlay,
    false,
  );

  // 2. 暂停状态不出声
  assert.equal(
    shouldPlayTimelineVoice({
      mode: 'auto',
      paused: true,
      cue: 'wolf_open_normal',
      isHost: true,
      isModerator: false,
      localSettingEnabled: null,
      volume: 1,
    }).shouldPlay,
    false,
  );

  // 3. 无 cue 或属于违禁私密 cue
  assert.equal(
    shouldPlayTimelineVoice({
      mode: 'auto',
      paused: false,
      cue: null,
      isHost: true,
      isModerator: false,
      localSettingEnabled: null,
      volume: 1,
    }).shouldPlay,
    false,
  );
  assert.equal(
    shouldPlayTimelineVoice({
      mode: 'auto',
      paused: false,
      cue: 'seer_good',
      isHost: true,
      isModerator: false,
      localSettingEnabled: null,
      volume: 1,
    }).shouldPlay,
    false,
  );

  // 4. 音量为 0 不出声
  assert.equal(
    shouldPlayTimelineVoice({
      mode: 'auto',
      paused: false,
      cue: 'wolf_open_normal',
      isHost: true,
      isModerator: false,
      localSettingEnabled: null,
      volume: 0,
    }).shouldPlay,
    false,
  );

  // 5. 默认设备规则：host / moderator 默认为 true
  assert.equal(
    shouldPlayTimelineVoice({
      mode: 'auto',
      paused: false,
      cue: 'wolf_open_normal',
      isHost: true,
      isModerator: false,
      localSettingEnabled: null,
      volume: 0.8,
    }).shouldPlay,
    true,
  );
  assert.equal(
    shouldPlayTimelineVoice({
      mode: 'auto',
      paused: false,
      cue: 'wolf_open_normal',
      isHost: false,
      isModerator: true,
      localSettingEnabled: null,
      volume: 0.8,
    }).shouldPlay,
    true,
  );

  // 6. 普通玩家设备默认不出声（只字幕），除非本机显式开启
  assert.equal(
    shouldPlayTimelineVoice({
      mode: 'auto',
      paused: false,
      cue: 'wolf_open_normal',
      isHost: false,
      isModerator: false,
      localSettingEnabled: null,
      volume: 0.8,
    }).shouldPlay,
    false,
  );
  assert.equal(
    shouldPlayTimelineVoice({
      mode: 'auto',
      paused: false,
      cue: 'wolf_open_normal',
      isHost: false,
      isModerator: false,
      localSettingEnabled: true,
      volume: 0.8,
    }).shouldPlay,
    true,
  );
});

test('calculateTimelineCueOffset: 已超时句子绝不补播，未播完句子从已过位置起播', () => {
  const durationMs = 4500;

  // 1. 开始于 1000，当前 2500 -> 已经过去 1500ms -> 可播，offset 为 1.5s
  const res1 = calculateTimelineCueOffset(1000, 2500, durationMs);
  assert.equal(res1.canPlay, true);
  assert.equal(res1.offsetSeconds, 1.5);

  // 2. 开始于 1000，当前 6000 -> 已经过去 5000ms（大于时长 4500ms）-> 绝不补播！
  const res2 = calculateTimelineCueOffset(1000, 6000, durationMs);
  assert.equal(res2.canPlay, false);

  // 3. 时钟轻微未来偏误（当前 950）-> 从 0 开始播
  const res3 = calculateTimelineCueOffset(1000, 950, durationMs);
  assert.equal(res3.canPlay, true);
  assert.equal(res3.offsetSeconds, 0);
});
import { WEREWOLF_PUBLIC_VOICE_MANIFEST, getVoiceCueDurationMs } from '@ldj/shared';
import { CUE_FILES, judgeVoice, setAudioFactory } from '../src/game/werewolf/ui/judgeVoice.ts';
import { readNarrationSettings } from '../src/game/werewolf/ui/narrationSettings.ts';
import { calculateAdjustedNow } from '../src/shared-ui/serverClock.ts';
import { buildNightPlan } from '../../games/werewolf/server/timeline.ts';
import { existsSync, readFileSync } from 'node:fs';

test('server timeline cues share the measured public audio manifest, including dawn and hunter/idiot', () => {
  const cues = [...buildNightPlan({ witch: true, seer: true, guard: true, hunter: true, idiot: true }, 1), { cue: 'dawn' }];
  for (const { cue } of cues) {
    if (!cue) continue;
    assert.equal(isForbiddenPublicCue(cue), false, cue);
    assert.equal(CUE_FILES[cue], WEREWOLF_PUBLIC_VOICE_MANIFEST[cue]?.file, cue);
    assert.ok(getVoiceCueDurationMs(cue) > 0, cue);
    const url = new URL(`../public/werewolf-voice/${CUE_FILES[cue]}`, import.meta.url);
    assert.ok(existsSync(url), cue);
    const bytes = readFileSync(url);
    assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
  }
});

test('audio timing uses server clock and the actual short cue duration, not 4.5 seconds', () => {
  const sample = { serverNow: 10000, receivedAtMonotonic: 200 };
  const now = calculateAdjustedNow(sample, 1700);
  assert.deepEqual(calculateTimelineCueOffset(10000, now, getVoiceCueDurationMs('dawn')), { canPlay: false, offsetSeconds: 0 });
  assert.equal(calculateTimelineCueOffset(10000, now, getVoiceCueDurationMs('wolf_open_first')).offsetSeconds, 1.5);
});

test('narration preferences preserve default volume, explicit zero and host-only default', () => {
  assert.deepEqual(readNarrationSettings({ getItem: () => null }), { enabled: null, volume: .8 });
  assert.deepEqual(readNarrationSettings({ getItem: key => key.endsWith('enabled') ? 'false' : '0' }), { enabled: false, volume: 0 });
  assert.deepEqual(readNarrationSettings({ getItem: () => { throw Error('blocked'); } }), { enabled: null, volume: .8 });
});

test('timeline playback handles cue transitions, autoplay denial and audio construction errors', async () => {
  const audios: Array<{ currentTime: number; volume: number; paused: boolean; onended: (() => void) | null; onerror: (() => void) | null; play: () => Promise<void>; pause: () => void }> = [];
  setAudioFactory(() => {
    const audio = { currentTime: 0, volume: 1, paused: false, onended: null, onerror: null,
      play: async () => {}, pause: () => { audio.paused = true; } };
    audios.push(audio);
    return audio as unknown as HTMLAudioElement;
  });
  try {
    const first = judgeVoice.playTimelineCue('wolf_open_first', 1.2, .6);
    assert.equal(audios[0]!.currentTime, 1.2);
    assert.equal(audios[0]!.volume, .6);
    const next = judgeVoice.playTimelineCue('wolf_close');
    assert.equal((await first).success, false);
    assert.equal(audios[0]!.paused, true);
    audios[1]!.onended?.();
    assert.equal((await next).success, true);
    setAudioFactory(() => { throw Error('Audio unavailable'); });
    assert.equal((await judgeVoice.playTimelineCue('dawn')).success, false);
    setAudioFactory(() => ({ pause() {}, play: () => Promise.reject(Object.assign(Error('blocked'), { name: 'NotAllowedError' })) }) as unknown as HTMLAudioElement);
    assert.equal((await judgeVoice.playTimelineCue('dawn')).blocked, true);
    assert.equal((await judgeVoice.playTimelineCue('seer_good')).success, false);
  } finally { judgeVoice.stopAll(); setAudioFactory(null); }
});
