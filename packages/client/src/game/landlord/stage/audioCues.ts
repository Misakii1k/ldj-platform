import { webAudio } from '../../../shared-ui/WebAudioManager.ts';
import type { StageEvent } from './deriveStageEvents.ts';

/**
 * 事件 → 音效。只复用 WebAudioManager 已有的音色，不加音频文件
 * （契约 contracts/landlord.md §5：木牌敲桌 / 金元宝"叮" / 纸张哗啦 就近复用）。
 * 静音状态由 webAudio 单例自己判断，这里不再重复判断。
 */
export function playCueFor(event: StageEvent): void {
  try {
    switch (event.kind) {
      case 'bidPlaced':
        // 木牌敲桌：短促敲击感
        webAudio.playTick();
        break;
      case 'landlordDecided':
        // 金元宝落定"叮"：现有音色里最接近的是翻牌的亮响
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
        // 捷报展开"纸张哗啦" + 胜负音：现有胜利音色承接
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
