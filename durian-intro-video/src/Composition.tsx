import React from 'react';
import { AbsoluteFill, Composition, Sequence } from 'remotion';
import { TitleScene } from './scenes/TitleScene';
import { ForeheadRuleScene } from './scenes/ForeheadRuleScene';
import { PlacementRuleScene } from './scenes/PlacementRuleScene';
import { MonkeyCardsScene } from './scenes/MonkeyCardsScene';
import { ChallengeRuleScene } from './scenes/ChallengeRuleScene';
import { PenaltySystemScene } from './scenes/PenaltySystemScene';
import { DemoGameplayScene } from './scenes/DemoGameplayScene';
import { DeviceModesScene } from './scenes/DeviceModesScene';
import { OutroScene } from './scenes/OutroScene';
import { Subtitle } from './components/Subtitle';

export const MyComposition: React.FC = () => {
  return (
    <Composition
      id="DurianIntro"
      component={DurianIntroVideo}
      durationInFrames={1770}
      fps={30}
      width={1920}
      height={1080}
    />
  );
};

export const DurianIntroVideo: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: '#05180f' }}>
      {/* ═══════════════════════════════════════════════════════════
         场景层
         ═══════════════════════════════════════════════════════════ */}

      {/* 场景 1: 开场标题 (0~120 帧, 4s) */}
      <Sequence from={0} durationInFrames={120} name="Title">
        <TitleScene />
      </Sequence>

      {/* 场景 2: 核心机制·头顶暗牌 (120~300 帧, 6s) */}
      <Sequence from={120} durationInFrames={180} name="ForeheadCards">
        <ForeheadRuleScene />
      </Sequence>

      {/* 场景 3: 回合操作·二选一出牌 (300~510 帧, 7s) */}
      <Sequence from={300} durationInFrames={210} name="CardPlacement">
        <PlacementRuleScene />
      </Sequence>

      {/* 场景 4: 小猴功能牌 (510~720 帧, 7s) */}
      <Sequence from={510} durationInFrames={210} name="MonkeyCards">
        <MonkeyCardsScene />
      </Sequence>

      {/* 场景 5: 按铃质疑与店长查账 (720~960 帧, 8s) */}
      <Sequence from={720} durationInFrames={240} name="ChallengeAndShowdown">
        <ChallengeRuleScene />
      </Sequence>

      {/* 场景 6: 怒气值递增与淘汰机制 (960~1140 帧, 6s) */}
      <Sequence from={960} durationInFrames={180} name="PenaltySystem">
        <PenaltySystemScene />
      </Sequence>

      {/* 场景 7: 真实 4 人对局完整示范 (1140~1500 帧, 12s) */}
      <Sequence from={1140} durationInFrames={360} name="DemoGameplay">
        <DemoGameplayScene />
      </Sequence>

      {/* 场景 8: 实体模拟器与多端模式 (1500~1650 帧, 5s) */}
      <Sequence from={1500} durationInFrames={150} name="DeviceModes">
        <DeviceModesScene />
      </Sequence>

      {/* 场景 9: 尾声与号召 (1650~1770 帧, 4s) */}
      <Sequence from={1650} durationInFrames={120} name="Outro">
        <OutroScene />
      </Sequence>

      {/* ═══════════════════════════════════════════════════════════
         字幕层 — 覆盖在所有场景之上
         ═══════════════════════════════════════════════════════════ */}

      {/* ── 场景 1: Title (0~120) ── */}
      <Sequence from={10} durationInFrames={50} name="Sub-Title-1">
        <Subtitle text="欢迎来到《榴莲店长》！" />
      </Sequence>
      <Sequence from={60} durationInFrames={55} name="Sub-Title-2">
        <Subtitle text="一款丛林水果店里的暗牌心理博弈桌游" />
      </Sequence>

      {/* ── 场景 2: Forehead (120~300) ── */}
      <Sequence from={125} durationInFrames={55} name="Sub-Forehead-1">
        <Subtitle text="每位玩家头顶放置一张暗牌" />
      </Sequence>
      <Sequence from={185} durationInFrames={55} name="Sub-Forehead-2">
        <Subtitle text="你能看见所有人的牌，唯独看不见自己的" />
      </Sequence>
      <Sequence from={245} durationInFrames={50} name="Sub-Forehead-3">
        <Subtitle text="所有暗牌的水果总和 = 水果店的真实库存" />
      </Sequence>

      {/* ── 场景 3: Placement (300~510) ── */}
      <Sequence from={305} durationInFrames={65} name="Sub-Placement-1">
        <Subtitle text="轮到你时，从牌堆抽一张双拼水果卡" />
      </Sequence>
      <Sequence from={375} durationInFrames={65} name="Sub-Placement-2">
        <Subtitle text="选择其中一半生效，另一半作废" />
      </Sequence>
      <Sequence from={445} durationInFrames={60} name="Sub-Placement-3">
        <Subtitle text="生效的水果数量会累加到桌面采购看板" />
      </Sequence>

      {/* ── 场景 4: Monkey Cards (510~720) ── */}
      <Sequence from={515} durationInFrames={65} name="Sub-Monkey-1">
        <Subtitle text="牌堆中还混有四张特殊的猴子功能牌" />
      </Sequence>
      <Sequence from={585} durationInFrames={65} name="Sub-Monkey-2">
        <Subtitle text="它们可以翻转别人的牌、让出牌无效等" />
      </Sequence>
      <Sequence from={655} durationInFrames={60} name="Sub-Monkey-3">
        <Subtitle text="善用功能牌可以扭转局面！" />
      </Sequence>

      {/* ── 场景 5: Challenge (720~960) ── */}
      <Sequence from={725} durationInFrames={55} name="Sub-Challenge-1">
        <Subtitle text="当你觉得桌上的采购量已经超过库存……" />
      </Sequence>
      <Sequence from={785} durationInFrames={55} name="Sub-Challenge-2">
        <Subtitle text="拍下铃铛！猩猩店长会来查账" />
      </Sequence>
      <Sequence from={845} durationInFrames={55} name="Sub-Challenge-3">
        <Subtitle text="任意一种水果超卖 → 质疑成功，上家受罚" />
      </Sequence>
      <Sequence from={905} durationInFrames={50} name="Sub-Challenge-4">
        <Subtitle text="全部充足 → 质疑失败，你自己受罚" />
      </Sequence>

      {/* ── 场景 6: Penalty (960~1140) ── */}
      <Sequence from={965} durationInFrames={55} name="Sub-Penalty-1">
        <Subtitle text="每一轮的罚分等于当前轮数" />
      </Sequence>
      <Sequence from={1025} durationInFrames={55} name="Sub-Penalty-2">
        <Subtitle text="越到后面，罚分越重！累计超过 7 分直接淘汰" />
      </Sequence>
      <Sequence from={1085} durationInFrames={50} name="Sub-Penalty-3">
        <Subtitle text="存活到最后且罚分最低的玩家获胜" />
      </Sequence>

      {/* ── 场景 7: Demo (1140~1500) ── */}
      <Sequence from={1145} durationInFrames={65} name="Sub-Demo-1">
        <Subtitle text="让我们看一场真实的 4 人对局" />
      </Sequence>
      <Sequence from={1215} durationInFrames={65} name="Sub-Demo-2">
        <Subtitle text="玩家 A 看到桌上草莓需求为 4" />
      </Sequence>
      <Sequence from={1285} durationInFrames={65} name="Sub-Demo-3">
        <Subtitle text="但他看不到自己头上也有 2 个草莓" />
      </Sequence>
      <Sequence from={1355} durationInFrames={70} name="Sub-Demo-4">
        <Subtitle text="误判按铃！翻牌后发现库存充足，质疑失败！" />
      </Sequence>
      <Sequence from={1430} durationInFrames={65} name="Sub-Demo-5">
        <Subtitle text="信息盲区正是这款游戏最精彩的地方" />
      </Sequence>

      {/* ── 场景 8: Modes (1500~1650) ── */}
      <Sequence from={1505} durationInFrames={70} name="Sub-Modes-1">
        <Subtitle text="支持手机手牌端、平板桌面端、多端扫码联机" />
      </Sequence>
      <Sequence from={1580} durationInFrames={65} name="Sub-Modes-2">
        <Subtitle text="聚会面对面或远程跨屏，随时开局！" />
      </Sequence>

      {/* ── 场景 9: Outro (1650~1770) ── */}
      <Sequence from={1655} durationInFrames={55} name="Sub-Outro-1">
        <Subtitle text="快来开一局《榴莲店长》吧！" />
      </Sequence>
      <Sequence from={1715} durationInFrames={50} name="Sub-Outro-2">
        <Subtitle text="2-7人，约15-20分钟，心理盲区博弈的极致体验" />
      </Sequence>
    </AbsoluteFill>
  );
};
