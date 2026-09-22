import { webAudio } from '../../../shared-ui/WebAudioManager.ts';
import type { StageEvent } from './deriveStageEvents.ts';

/**
 * 事件 → 音效。全部复用本游戏原有的五个音色，不新增。
 * 静音状态由 webAudio 单例自己判断，这里不再重复判断。
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
      case 'bellOpened':
      case 'bellClaimed':
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

/** 三种震动节奏，沿用本游戏原有的手感。 */
export const VIBRATE = {
  /** 轮到自己：与伪人测试的「轮到我发言」跨游戏统一 */
  myTurn: () => buzz([30, 40, 30]),
  /** 抢铃窗口开启：比回合提醒更急 */
  bellOpen: () => buzz([40, 50, 40]),
  /** 我按下拍铃：最重的一下 */
  ring: () => buzz([50, 60, 50]),
};
