import { Howl } from 'howler';

// Type definitions for audio phases
export type WerewolfPhase =
  | 'night_fall'
  | 'wolf_wake'
  | 'wolf_close'
  | 'witch_wake'
  | 'witch_close'
  | 'seer_wake'
  | 'seer_close'
  | 'day_break'
  | 'result_peace'
  | 'result_death'
  | 'discussion'
  | 'vote'
  | 'win_wolf'
  | 'win_good';

export type CheeseThiefPhase =
  | 'night_fall'
  | 'night_action'
  | 'day_break'
  | 'discussion'
  | 'vote_start'
  | 'win_thief'
  | 'win_town';

// Audio manager for voiceovers
class VoiceoverManagerClass {
  private bgm: Howl | null = null;
  private currentVoiceover: Howl | null = null;

  // Placeholder paths for generated audio
  private werewolfAudioPaths: Record<WerewolfPhase, string> = {
    night_fall: '/audio/voiceover/werewolf/ww_night_fall.mp3',
    wolf_wake: '/audio/voiceover/werewolf/ww_wolf_wake.mp3',
    wolf_close: '/audio/voiceover/werewolf/ww_wolf_close.mp3',
    witch_wake: '/audio/voiceover/werewolf/ww_witch_wake.mp3',
    witch_close: '/audio/voiceover/werewolf/ww_witch_close.mp3',
    seer_wake: '/audio/voiceover/werewolf/ww_seer_wake.mp3',
    seer_close: '/audio/voiceover/werewolf/ww_seer_close.mp3',
    day_break: '/audio/voiceover/werewolf/ww_day_break.mp3',
    result_peace: '/audio/voiceover/werewolf/ww_result_peace.mp3',
    result_death: '/audio/voiceover/werewolf/ww_result_death.mp3',
    discussion: '/audio/voiceover/werewolf/ww_discussion.mp3',
    vote: '/audio/voiceover/werewolf/ww_vote.mp3',
    win_wolf: '/audio/voiceover/werewolf/ww_win_wolf.mp3',
    win_good: '/audio/voiceover/werewolf/ww_win_good.mp3',
  };

  private cheeseThiefAudioPaths: Record<CheeseThiefPhase, string> = {
    night_fall: '/audio/voiceover/cheese_thief/ct_night_fall.mp3',
    night_action: '/audio/voiceover/cheese_thief/ct_night_action.mp3',
    day_break: '/audio/voiceover/cheese_thief/ct_day_break.mp3',
    discussion: '/audio/voiceover/cheese_thief/ct_discussion.mp3',
    vote_start: '/audio/voiceover/cheese_thief/ct_vote_start.mp3',
    win_thief: '/audio/voiceover/cheese_thief/ct_win_thief.mp3',
    win_town: '/audio/voiceover/cheese_thief/ct_win_town.mp3',
  };

  // Cache for loaded Howl instances
  private werewolfCache: Partial<Record<WerewolfPhase, Howl>> = {};
  private cheeseThiefCache: Partial<Record<CheeseThiefPhase, Howl>> = {};

  /**
   * Set and play the background music
   */
  public setBGM(src: string, volume: number = 0.5) {
    if (this.bgm) {
      this.bgm.stop();
      this.bgm.unload();
    }
    this.bgm = new Howl({
      src: [src],
      loop: true,
      volume: volume,
    });
    this.bgm.play();
  }

  /**
   * Stop the background music
   */
  public stopBGM() {
    if (this.bgm) {
      this.bgm.stop();
    }
  }

  /**
   * Play a werewolf voiceover, ducks BGM
   */
  public playWerewolf(phase: WerewolfPhase, onEnd?: () => void) {
    if (!this.werewolfCache[phase]) {
      this.werewolfCache[phase] = new Howl({ src: [this.werewolfAudioPaths[phase]] });
    }
    this.playVoiceover(this.werewolfCache[phase]!, onEnd);
  }

  /**
   * Play a cheese thief voiceover, ducks BGM
   */
  public playCheeseThief(phase: CheeseThiefPhase, onEnd?: () => void) {
    if (!this.cheeseThiefCache[phase]) {
      this.cheeseThiefCache[phase] = new Howl({ src: [this.cheeseThiefAudioPaths[phase]] });
    }
    this.playVoiceover(this.cheeseThiefCache[phase]!, onEnd);
  }

  /**
   * Core logic for playing voiceover and ducking BGM
   */
  private playVoiceover(sound: Howl, onEnd?: () => void) {
    if (this.currentVoiceover) {
      this.currentVoiceover.stop(); // Stop any currently playing voiceover
    }

    this.currentVoiceover = sound;

    // Ducking: lower BGM volume
    if (this.bgm && this.bgm.playing()) {
      this.bgm.fade(this.bgm.volume(), 0.1, 500); // fade to 0.1 over 500ms
    }

    sound.play();

    sound.once('end', () => {
      this.currentVoiceover = null;
      // Restore BGM volume
      if (this.bgm && this.bgm.playing()) {
        this.bgm.fade(0.1, 0.5, 500); // fade back up to 0.5 over 500ms
      }
      if (onEnd) onEnd();
    });
  }

  /**
   * Stop any currently playing voiceover
   */
  public stopVoiceover() {
    if (this.currentVoiceover) {
      this.currentVoiceover.stop();
      this.currentVoiceover = null;
      // Restore BGM immediately
      if (this.bgm && this.bgm.playing()) {
        this.bgm.volume(0.5);
      }
    }
  }
}

export const VoiceoverManager = new VoiceoverManagerClass();
