import { webAudio } from '../../../shared-ui/WebAudioManager.ts';
import type { StageEvent } from './deriveStageEvents.ts';

/**
 * 事件 → 音效。只复用 WebAudioManager 已有的音色，不新增供应商依赖。
 * 静音状态由 webAudio 单例自己判断，这里不再重复判断。
 */
export function playCueFor(event: StageEvent): void {
  try {
    switch (event.kind) {
      case 'guessAccepted':
        webAudio.playCardPlay();
        break;
      case 'otherSubmitted':
        webAudio.playTick();
        break;
      case 'boardRevealed':
        webAudio.playDealCards();
        break;
      case 'myBetsAccepted':
      case 'publicBetsChanged':
        webAudio.playCardPlay();
        break;
      case 'winningRevealed':
        webAudio.playCardFlip();
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

/** 翻牌音：逐张翻开时按节拍单独触发。 */
export function playFlipCue(): void {
  try {
    webAudio.playCardFlip();
  } catch {
    // 同上
  }
}
