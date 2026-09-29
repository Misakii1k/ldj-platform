import type { ReactNode } from 'react';
import type { MemberLike } from '../../useGameAction.ts';
import type {
  BetPairView,
  BoardTargetView,
  ChipId,
  QuestionBrief,
  TargetId,
  WitsWagersPhase,
} from '../types.ts';
import { playerColorFor, PLAYER_COLORS } from '../seats.ts';
import { StageCountdownRing } from '../../../shared-ui/stage/StageCountdownRing.tsx';
import { WitsPokerCard } from './WitsPokerCard.tsx';
import { WitsQuestion } from './WitsQuestion.tsx';
import { WitsChipStack, type WitsChipStackItem } from './WitsChipStack.tsx';

export interface WitsTableStageProps {
  readonly phase: WitsWagersPhase;
  readonly question: QuestionBrief | null;
  /** 题目上方的小字（如作答阶段「写下你的估数」） */
  readonly questionKicker?: string;
  /** 阶段胶囊文案（手机竖屏：阶段横幅太占高度，胶囊收进桌沿行） */
  readonly phaseLabel?: string;
  /** 演出进行中：牌与赔率牌的入场动画只在这个窗口内播（落终态不重播） */
  readonly dealing?: boolean;
  readonly board: readonly BoardTargetView[];
  readonly members?: readonly MemberLike[];
  /** 尚未翻牌时桌上背面牌的数量（= 参赛人数） */
  readonly faceDownCount?: number;
  /** 已交牌的人数，用于作答阶段的桌面进度 */
  readonly submittedCount?: number;
  /** 获胜槽位；等距双胜时两个都要高亮 */
  readonly winningTargetIds?: readonly TargetId[];
  /** 演出编排给出的已翻开槽位；未列入的牌保持背面 */
  readonly revealedTargets?: ReadonlySet<TargetId>;
  /** 我的下注草稿，未保存时以半透明预览呈现 */
  readonly myDraft?: BetPairView | null;
  readonly myAcceptedBets?: BetPairView | null;
  /** 全员公开下注（betting 起公开）；桌上渲染他人筹码摞，我的那一份由 myDraft/accepted 呈现 */
  readonly publicBets?: Readonly<Record<string, BetPairView>>;
  readonly activeChipId?: ChipId | null;
  /** 我的 playerId：给桌上属于我的筹码取与座位章一致的玩家色 */
  readonly myPlayerId?: string | null;
  readonly onSelectTarget?: (targetId: TargetId) => void;
  readonly interactive?: boolean;
  /** 结算演出：桌上筹码已飞回主人，格内筹码摞隐藏 */
  readonly chipsHidden?: boolean;
  /** 服务端截止时刻，交给舞台上的倒计时 */
  readonly deadlineAt?: number | null;
  /** 倒计时的阶段标识，变化时重新测满格时长 */
  readonly phaseKey?: string;
  readonly stageRef?: React.RefObject<HTMLDivElement | null>;
  /**
   * 席位轨道插槽（X03）：渲染在题目行与毡面之间。
   * 桌面端它是绝对定位的左右围坐（不占布局）；手机端是题目下的 3×2 网格（在文档流里）。
   */
  readonly seatsRail?: ReactNode;
  /** 结算阶段的黄铜答案牌匾（渲染在题目与席位之间） */
  readonly answerPlaque?: ReactNode;
  readonly children?: ReactNode;
}

/**
 * 贵宾厅毡面牌桌舞台（正视，无 3D 倾斜——01-CONTRACT.md §1）。
 *
 * 槽位结构 = 顶部黄铜赔率牌 + 象牙扑克牌 + 底部筹码摞。
 * 场景纵深（房间 / 吊灯 / 椭圆桌）由 WitsLoungeScene 垫在最底层，
 * 这里的毡面本体透明，只承担布局与锚点（data-stage-anchor）。
 */
export function WitsTableStage({
  phase,
  question,
  questionKicker,
  dealing = false,
  board,
  members: _members = [],
  faceDownCount = 0,
  submittedCount = 0,
  winningTargetIds = [],
  revealedTargets,
  myDraft = null,
  myAcceptedBets = null,
  publicBets,
  activeChipId = null,
  myPlayerId = null,
  onSelectTarget,
  interactive = false,
  chipsHidden = false,
  deadlineAt = null,
  phaseKey = '',
  phaseLabel,
  stageRef,
  seatsRail,
  answerPlaque,
  children,
}: WitsTableStageProps) {
  const boardRevealed = board.length > 0;
  // 结算画面：胜出格升起、其余压暗（等距双胜两个都高亮，Q4 默认）
  const settled = winningTargetIds.length > 0 && (phase === 'settlement' || phase === 'game_over');
  // 翻牌入场动画只限排牌阶段的演出窗口：dealing 在下注/结算演出时也会为 true，
  // 若不按阶段收窄，ww-board--dealing 重新匹配会把所有已翻开的牌再翻一遍（实测：下注
  // 保存时整排重翻、结算入场时全桌闪回 0.3 透明度）。
  const dealActive = dealing && phase === 'arranging';

  // 作答阶段：桌上只摆背面牌，数量反映已交牌人数，绝不暴露任何数值
  const faceDownCards = Array.from({ length: Math.max(0, faceDownCount) }, (_, index) => index);

  const myColor = myPlayerId ? playerColorFor(myPlayerId) : PLAYER_COLORS[0];

  /** 押在某个槽位上的筹码摞：他人按 publicBets（服务端公开事实），我的按草稿/已接受（未保存半透明）。 */
  const chipsFor = (targetId: TargetId): WitsChipStackItem[] => {
    const items: WitsChipStackItem[] = [];

    if (publicBets) {
      for (const [pid, pair] of Object.entries(publicBets)) {
        if (pid === myPlayerId) continue; // 我的那份由草稿呈现，避免与服务端回声重复
        pair.forEach((chip) => {
          if (chip.targetId !== targetId) return;
          items.push({
            key: `${pid}:${chip.chipId}`,
            color: playerColorFor(pid),
            label: chip.chipId,
            chipId: chip.chipId,
            extraStake: chip.extraStake,
          });
        });
      }
    }

    const draftPair = myDraft ?? myAcceptedBets;
    if (draftPair) {
      (['A', 'B'] as const).forEach((chipId) => {
        const index = chipId === 'A' ? 0 : 1;
        const chip = draftPair[index];
        if (chip.targetId !== targetId) return;
        const accepted = myAcceptedBets?.[index];
        const isPending =
          accepted === undefined ||
          accepted.targetId !== chip.targetId ||
          accepted.extraStake !== chip.extraStake;
        items.push({
          key: chipId,
          color: myColor,
          label: chipId,
          chipId,
          extraStake: chip.extraStake,
          pending: isPending,
        });
      });
    }

    return items;
  };

  const handleSlotKeyDown = (targetId: TargetId) => (event: React.KeyboardEvent) => {
    if (!interactive || !onSelectTarget) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onSelectTarget(targetId);
    }
  };

  return (
    <div className="ww-stage" ref={stageRef} data-phase={phase}>
      <div className="ww-stage__rail ww-stage__rail--bare">
        {phaseLabel && <span className="ww-phase-pill">{phaseLabel}</span>}

        {/* 只有需要玩家行动的阶段才催时间；排牌与结算是纯展示 */}
        <StageCountdownRing
          deadlineAt={deadlineAt}
          phaseKey={phaseKey}
          active={phase === 'answering' || phase === 'betting'}
          className="ww-countdown"
        />
      </div>

      {question && (
        <WitsQuestion
          question={question}
          kicker={questionKicker}
          compact={phase === 'settlement'}
        />
      )}

      {answerPlaque}

      {seatsRail}

      <div className="ww-felt" data-stage-anchor="felt">
        <div className="ww-felt__surface" aria-hidden="true" />

        {boardRevealed ? (
          <div className={`ww-board ${dealActive ? 'ww-board--dealing' : ''}`.trim()} role="list">
            {board.map((target, index) => {
              const activeChip = activeChipId && (myDraft ?? myAcceptedBets)
                ? (myDraft ?? myAcceptedBets)![activeChipId === 'A' ? 0 : 1]
                : null;
              // 未提供 revealedTargets 时视为全部已翻开（落终态）
              const faceUp = revealedTargets ? revealedTargets.has(target.id) : true;
              const slotChips = chipsHidden ? [] : chipsFor(target.id);
              const isSelected = activeChip?.targetId === target.id;
              const isWinner = winningTargetIds.includes(target.id);

              const slotClasses = [
                'ww-board__slot',
                target.id === 'lower' ? 'ww-board__slot--lower' : '',
                // 胜出高亮：正式版只在结算出现；桌面模拟版亮答案后用它做提示（不判胜负）
                isWinner ? 'ww-board__slot--win' : '',
                !isWinner && settled ? 'ww-board__slot--lose' : '',
                isSelected ? 'ww-board__slot--selected' : '',
                interactive ? 'ww-board__slot--interactive' : '',
              ]
                .filter(Boolean)
                .join(' ');

              return (
                <div
                  className={slotClasses}
                  key={target.id}
                  role={interactive ? 'button' : 'listitem'}
                  tabIndex={interactive ? 0 : undefined}
                  onClick={interactive ? () => onSelectTarget?.(target.id) : undefined}
                  onKeyDown={interactive ? handleSlotKeyDown(target.id) : undefined}
                  data-stage-anchor={`target:${target.id}`}
                  style={{ ['--ww-reveal-index' as string]: String(index) }}
                  aria-label={
                    interactive
                      ? `把筹码押到 ${target.id === 'lower' ? '更低' : (target.value?.toLocaleString('zh-CN') ?? '')}`
                      : undefined
                  }
                >
                  {/* 黄铜赔率牌：净赢 ×N */}
                  <span className="ww-odds-plaque">
                    <small>净赢</small>×{target.odds}
                  </span>

                  {/* 未翻开的槽位渲染纯背面牌，DOM 里没有任何数值；
                      key 随正反面切换，让翻牌入场动画重新挂载播放 */}
                  <WitsPokerCard
                    key={faceUp ? `${target.id}-up` : `${target.id}-down`}
                    target={faceUp ? target : null}
                    authorColors={faceUp ? target.authors.map((a) => playerColorFor(a)) : []}
                    unit={faceUp ? question?.unit : undefined}
                  />

                  {slotChips.length > 0 && (
                    <span className="ww-board__chips">
                      <WitsChipStack items={slotChips} />
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className={`ww-pile ${dealing ? 'ww-pile--dealing' : ''}`.trim()} aria-label={`已交牌 ${submittedCount} 张`}>
            <div
              className="ww-pile__fan"
              style={{ ['--ww-fan-n' as string]: String(Math.max(1, faceDownCount)) }}
            >
              {faceDownCards.map((index) =>
                index < submittedCount ? (
                  <span
                    className="ww-pile__card"
                    key={index}
                    style={{ ['--ww-fan-i' as string]: String(index) }}
                  >
                    <WitsPokerCard target={null} />
                  </span>
                ) : null,
              )}
            </div>
            <div className="ww-pile__count">
              <b>{submittedCount}</b> / {faceDownCount} 已交
            </div>
            {faceDownCards.length === 0 && (
              <p className="ww-felt__hint">
                {phase === 'created' ? '等待开局' : '等待全员作答'}
              </p>
            )}
          </div>
        )}
      </div>

      {children}
    </div>
  );
}
