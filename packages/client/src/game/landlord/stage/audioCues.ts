import { webAudio } from '../../../shared-ui/WebAudioManager.ts';
import type { StageEvent } from './deriveStageEvents.ts';

/**
 * 事件 → 音效。只复用 WebAudioManager 已有的音色，不新增供应商依赖。
 * 静音状态由 webAudio 单例自己判断，这里不再重复判断。
 */
export function playCueFor(event: StageEvent): void {
  try {
    switch (event.kind) {
      case 'bidPlaced':
        webAudio.playTick();
        break;
      case 'landlordDecided':
        webAudio.playCardFlip();
        break;
      case 'cardsPlayed':
        webAudio.playCardPlay();
        break;
      case 'passed':
        webAudio.playTick();
        break;
      case 'bombDropped':
        webAudio.playBuzzer();
        break;
      case 'myTurnStarted':
        webAudio.playTurnAlert();
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

function buzz(pattern: readonly number[]): void {
  try {
    navigator.vibrate?.([...pattern]);
  } catch {
    // 不支持震动的设备直接忽略
  }
}

export const VIBRATE = {
  /** 轮到自己：跨游戏统一节奏 */
  myTurn: () => buzz([30, 40, 30]),
  /** 炸弹落下：最重的一下 */
  bomb: () => buzz([50, 60, 50]),
};
