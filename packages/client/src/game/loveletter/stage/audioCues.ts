import { webAudio } from '../../../shared-ui/WebAudioManager.ts';
import type { StageEvent } from './deriveStageEvents.ts';

/**
 * 事件 → 音效。只复用 WebAudioManager 已有的音色，不新增供应商依赖。
 * 静音状态由 webAudio 单例自己判断，这里不再重复判断。
 */
export function playCueFor(event: StageEvent): void {
  try {
    switch (event.kind) {
      case 'cardPlayed':
        webAudio.playCardPlay();
        break;
      case 'eliminated':
        webAudio.playBuzzer();
        break;
      case 'protected':
        webAudio.playTick();
        break;
      case 'myTurnStarted':
        webAudio.playTurnAlert();
        break;
      case 'roundOver':
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

/** 轮到我出牌的提醒：与其余游戏的「轮到自己」节奏跨游戏统一。 */
export function vibrateMyTurn(): void {
  try {
    navigator.vibrate?.([30, 40, 30]);
  } catch {
    // 不支持震动的设备直接忽略
  }
}
