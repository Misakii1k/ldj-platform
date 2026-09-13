/**
 * 抽卡仪式：洗牌演出覆盖层。
 *
 * 只负责「法官正在洗牌」这一段一次性演出（约 1.2 秒），结束后自动卸载，
 * 把同一张 IdentityFlipCard 交还给玩家点击翻牌。
 * 因此整段抽卡只有两个真实步骤：洗牌（自动一次）→ 点牌翻开（唯一交互出口）。
 */
import { useEffect } from 'react';

const SHUFFLE_DURATION_MS = 1200;

interface DealCeremonyProps {
  /** 洗牌演出结束（只回调一次） */
  readonly onFinished: () => void;
}

export function DealCeremony({ onFinished }: DealCeremonyProps) {
  useEffect(() => {
    const timer = window.setTimeout(onFinished, SHUFFLE_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [onFinished]);

  return (
    <div className="mod-deal-ceremony" role="status" aria-live="polite">
      <div className="mod-deal-deck" aria-hidden="true">
        <span className="mod-deal-card" />
        <span className="mod-deal-card" />
        <span className="mod-deal-card" />
      </div>
      <p className="mod-deal-caption">法官正在洗牌分发身份牌…</p>
    </div>
  );
}
