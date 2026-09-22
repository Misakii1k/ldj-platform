import { webAudio } from '../../../shared-ui/WebAudioManager.ts';
import type { StageEvent } from './deriveStageEvents.ts';

/**
 * 事件 → 音效。只复用 WebAudioManager 已有的音色，不新增供应商依赖。
 * 这款已有 TTS 语音（cheeseVoice.ts），此处只补必要的短音，不与语音抢。
 */
export function playCueFor(event: StageEvent): void {
  try {
    switch (event.kind) {
      case 'nightFell':
      case 'dawnBroke':
        webAudio.playCardFlip();
        break;
      case 'voteStarted':
        webAudio.playCardPlay();
        break;
      case 'voteResolved':
        webAudio.playBuzzer();
        break;
      case 'gameOver':
        webAudio.playVictory();
        break;
      default:
        break;
    }
  } catch {
    // 音频上下文尚未解锁等情况不应打断演出
  }
}
