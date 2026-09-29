import { webAudio } from '../../../shared-ui/WebAudioManager.ts';
import type { StageEvent } from './deriveStageEvents.ts';

/**
 * 事件 → 音效与触觉反馈。
 */
export function playCueFor(event: StageEvent): void {
  try {
    switch (event.kind) {
      case 'cardPlayed':
        webAudio.playCardPlay();
        break;
      case 'cardDrawn':
      case 'penaltyDrawn':
        webAudio.playDealCards();
        break;
      case 'bellRung':
        webAudio.playBuzzer();
        VIBRATE.ring();
        break;
      case 'challengeResolved':
        if (event.success) {
          webAudio.playTurnAlert();
        } else {
          webAudio.playUnoDrawPenalty();
          VIBRATE.bellMiss();
        }
        break;
      case 'myTurnStarted':
        webAudio.playTurnAlert();
        VIBRATE.myTurn();
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

/** 震动节奏 */
export const VIBRATE = {
  /** 轮到自己 */
  myTurn: () => buzz([30, 40, 30]),
  /** 我按下拍铃 */
  ring: () => buzz([50, 60, 50]),
  /** 拍错 */
  bellMiss: () => buzz([40, 50, 40]),
};
