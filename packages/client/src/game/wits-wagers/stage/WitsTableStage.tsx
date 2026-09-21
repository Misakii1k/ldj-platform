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
import { WitsAnswerCard } from './WitsAnswerCard.tsx';
import { WitsBankTray } from './WitsBankTray.tsx';
import { WitsChip } from './WitsChip.tsx';

export interface WitsTableStageProps {
  readonly phase: WitsWagersPhase;
  readonly question: QuestionBrief | null;
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
  readonly activeChipId?: ChipId | null;
  readonly onSelectTarget?: (targetId: TargetId) => void;
  readonly interactive?: boolean;
  readonly bankActive?: boolean;
  readonly stageRef?: React.RefObject<HTMLDivElement | null>;
  readonly children?: ReactNode;
}

/**
 * 3D 毡面牌桌舞台。
 *
 * 透视只作用在 .ww-felt 这一层：飞行幽灵层与手部层必须留在 preserve-3d 子树之外，
 * 否则 fixed 定位会被祖先的 transform 变成相对定位，落点全错。
 */
export function WitsTableStage({
  phase,
  question,
  board,
  members = [],
  faceDownCount = 0,
  submittedCount = 0,
  winningTargetIds = [],
  revealedTargets,
  myDraft = null,
  myAcceptedBets = null,
  activeChipId = null,
  onSelectTarget,
  interactive = false,
  bankActive = false,
  stageRef,
  children,
}: WitsTableStageProps) {
  const boardRevealed = board.length > 0;

  // 作答阶段：桌上只摆背面牌，数量反映已交牌人数，绝不暴露任何数值
  const faceDownCards = Array.from({ length: Math.max(0, faceDownCount) }, (_, index) => index);

  const chipsFor = (targetId: TargetId) => {
    const nodes: ReactNode[] = [];
    const draftPair = myDraft ?? myAcceptedBets;
    if (!draftPair) return nodes;

    (['A', 'B'] as const).forEach((chipId) => {
      const index = chipId === 'A' ? 0 : 1;
      const chip = draftPair[index];
      if (chip.targetId !== targetId) return;
      const accepted = myAcceptedBets?.[index];
      const isPending =
        accepted === undefined ||
        accepted.targetId !== chip.targetId ||
        accepted.extraStake !== chip.extraStake;
      nodes.push(
        <WitsChip
          key={chipId}
          chipId={chipId}
          extraStake={chip.extraStake}
          pending={isPending}
          size={36}
        />,
      );
    });

    return nodes;
  };

  return (
    <div className="ww-stage" ref={stageRef}>
      <div className="ww-stage__rail">
        <WitsBankTray active={bankActive} />

        {question && (
          <div className="ww-question-card">
            <h2 className="ww-question-card__prompt">{question.prompt}</h2>
            <div className="ww-question-card__unit">答案单位：{question.unit}</div>
          </div>
        )}
      </div>

      <div className="ww-felt" data-ww-anchor="felt">
        <div className="ww-felt__surface" aria-hidden="true" />

        {boardRevealed ? (
          <div className="ww-board" role="list">
            {board.map((target, index) => {
              const activeChip = activeChipId && (myDraft ?? myAcceptedBets)
                ? (myDraft ?? myAcceptedBets)![activeChipId === 'A' ? 0 : 1]
                : null;
              // 未提供 revealedTargets 时视为全部已翻开（落终态）
              const faceUp = revealedTargets ? revealedTargets.has(target.id) : true;

              return (
                <div className="ww-board__slot" key={target.id} role="listitem">
                  <WitsAnswerCard
                    target={target}
                    members={members}
                    faceUp={faceUp}
                    revealIndex={index}
                    isWinner={winningTargetIds.includes(target.id)}
                    isSelected={activeChip?.targetId === target.id}
                    interactive={interactive}
                    onActivate={() => onSelectTarget?.(target.id)}
                  >
                    {chipsFor(target.id)}
                  </WitsAnswerCard>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="ww-facedown-row" aria-label={`已交牌 ${submittedCount} 张`}>
            {faceDownCards.map((index) =>
              index < submittedCount ? (
                <div className="ww-facedown-row__slot" key={index}>
                  <WitsAnswerCard target={null} faceUp={false} revealIndex={index} />
                </div>
              ) : (
                // 还没交牌的位置留一个空槽轮廓，让"还差几个人"一眼可见
                <div className="ww-facedown-row__slot" key={index}>
                  <div className="ww-facedown-row__placeholder" aria-hidden="true" />
                </div>
              ),
            )}
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
