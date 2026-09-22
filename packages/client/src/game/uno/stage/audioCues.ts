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
      case 'cardDrawn':
        webAudio.playDealCards();
        break;
      case 'colorChanged':
        webAudio.playCardFlip();
        break;
      case 'unoRaceOpened':
      case 'penaltyStacked':
        webAudio.playBuzzer();
        break;
      case 'myTurnStarted':
        webAudio.playTurnAlert();
        break;
      case 'roundOver':
      case 'matchOver':
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
  /** 抓漏报窗口开着、或我被罚牌：更急的一下 */
  alert: () => buzz([40, 50, 40]),
};
