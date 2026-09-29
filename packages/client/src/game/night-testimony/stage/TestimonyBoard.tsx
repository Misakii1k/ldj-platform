/**
 * 谁是狱警 · 夹板审讯单（中央主物件）。
 *
 * 打字机纸：Courier 头行 + 衬线大问题 + 每人一个盖章格 + 页脚计数。
 * 隐私红线：cells 由 buildAnswerCells 提供，全员答完前只有 stamped/empty，
 * 翻开（flipping）时才出现 yes/no。
 */
import type { ReactNode } from 'react';
import type { MemberLike } from '../../useGameAction.ts';
import { nameFor } from '../../useGameAction.ts';
import type { AnswerCellModel } from './ArchiveProps.tsx';

export interface TestimonyBoardProps {
  /** 第几份审讯单（1 起） */
  readonly no: number;
  readonly askerName: string;
  readonly question: string;
  readonly cells: readonly AnswerCellModel[];
  readonly members: readonly MemberLike[];
  readonly maxYes: number;
  /** 全员答完同时翻开 */
  readonly flipping?: boolean;
}

export function TestimonyBoard({
  no,
  askerName,
  question,
  cells,
  members,
  maxYes,
  flipping = false,
}: TestimonyBoardProps): ReactNode {
  const answered = cells.filter((c) => c.state !== 'empty').length;
  return (
    <section className="nt-form" data-stage-anchor="board" aria-label={`审讯单 No.${no}：${question}`}>
      <div className="nt-form__row">
        <span>
          审讯单 No.<b>{String(no).padStart(3, '0')}</b>
        </span>
        <span>
          提问人：<b>{askerName}</b>
        </span>
      </div>
      <p className="nt-form__q">{question}</p>
      <div className="nt-form__answers">
        {cells.map((cell) => {
          const stateClass =
            cell.state === 'stamped'
              ? 'nt-chip--in'
              : cell.state === 'yes'
                ? 'nt-chip--flip nt-chip--yes'
                : cell.state === 'no'
                  ? 'nt-chip--flip nt-chip--no'
                  : '';
          return (
            <div key={cell.playerId} className={`nt-chip ${stateClass}`} data-nt-chip={cell.playerId}>
              <span className="nt-chip__face">
                {flipping && cell.state === 'yes' ? 'YES' : flipping && cell.state === 'no' ? 'NO' : ''}
              </span>
              <span className="nt-chip__name">{nameFor(members, cell.playerId)}</span>
            </div>
          );
        })}
      </div>
      <div className="nt-form__foot">
        <span className="nt-form__numeral">
          {answered}/{cells.length}
        </span>
        <span>已盖章 · 全员盖完同时揭开</span>
        <span className="nt-form__rule">满 {maxYes} 个 YES 章立刻投票</span>
      </div>
    </section>
  );
}
