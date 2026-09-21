import type { RefObject } from 'react';
import { GameDrawer } from '../../tabletop/GameDrawer.tsx';

export interface WitsRulesDrawerProps {
  readonly triggerRef: RefObject<HTMLElement | null>;
  readonly onClose: () => void;
}

export function WitsRulesDrawer({ triggerRef, onClose }: WitsRulesDrawerProps) {
  return (
    <GameDrawer kind="rules" title="一智千金 · 游戏规则" triggerRef={triggerRef} onClose={onClose}>
      <h4>一局七轮，每轮四步</h4>
      <p>
        1. <strong>秘密作答</strong>：所有人对同一道数字题写下自己的估数（正整数）。在全员提交前谁都看不到别人的答案，
        你也可以反复修改。超时未答的人由系统补上 1，且不获得作者奖励、不计入答对次数。
      </p>
      <p>
        2. <strong>排列版图</strong>：答案牌按数值从小到大摊开成一排槽位，相同数值合并为同一张牌并叠放作者。
        最左侧额外有一个<strong>「全部猜高」</strong>特殊槽，代表正确答案比所有人的估数都小。
      </p>
      <p>
        3. <strong>赔率下注</strong>：你有 <strong>A、B 两枚筹码</strong>，可以押在同一张牌上，也可以分开押。
        每枚筹码本身免费，另可附加积分加注（加注部分押错会亏损，押对按该槽赔率翻倍）。
      </p>
      <p>
        4. <strong>揭晓结算</strong>：获胜槽位是<strong>不超过正确答案的最大估数</strong>；若所有人都猜高了，
        则「全部猜高」槽获胜。押中者按净赢倍率收钱，押错者失去附加注；获胜估数的作者额外 +3 分。
      </p>

      <h4>赔率怎么看</h4>
      <p>
        越靠近版图边缘（越可能被跳过）的槽位赔率越高，中间的槽位赔率越低。「全部猜高」槽固定为最高的 ×6。
        每张牌上都标着「净赢 ×N」，这就是押中时每 1 分能净赚的倍数。
      </p>

      <h4>怎样赢下整局</h4>
      <p>
        七轮结束后积分最高者获胜。积分相同时比较<strong>获胜估数次数</strong>（你写的数被判为获胜槽位的次数）；
        仍然相同则并列获胜。即使积分归零，下一轮你依然拿到两枚免费筹码，随时可以翻盘。
      </p>

      <h4>保密与公平</h4>
      <p>
        作答阶段服务端只公开「谁已交牌」，不公开任何人的数字；标准答案与出处在结算前不下发到任何客户端。
        所有结算以服务端账本为准，界面上的「预计收益」仅供参考。
      </p>
    </GameDrawer>
  );
}
