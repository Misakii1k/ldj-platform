/**
 * 谁是狱警 · 旧审讯单小卡（右上角「已归档」一叠）。
 *
 * 每张：Q 编号 + 题目（两行截断）+ 答 YES 的人的小色章。
 * 最新一张带 drop-in 落入动画（由 newest 标记驱动）。
 */
import type { CSSProperties, ReactNode } from 'react';
import type { MemberLike } from '../../useGameAction.ts';
import type { QuestionRecord } from '../types.ts';
import { seatColor } from './ArchiveProps.tsx';

export interface TestimonyNoteProps {
  readonly record: QuestionRecord;
  readonly members: readonly MemberLike[];
  /** 全部玩家（答案人名 → 座次色 的映射用） */
  readonly players: readonly string[];
  /** 刚归档：播落入动画 */
  readonly newest?: boolean;
}

export function TestimonyNote({ record, members, players, newest = false }: TestimonyNoteProps): ReactNode {
  const yesPlayers = players.filter((id) => record.answers[id] === 'yes');
  const nameOf = (id: string) => members.find((m) => m.playerId === id)?.nickname ?? id;
  return (
    <div
      className={`nt-note${newest ? ' nt-note--new' : ''}`}
      aria-label={`第 ${record.questionIndex} 问：${record.question}，${yesPlayers.length} 人回答 YES`}
    >
      <span className="nt-note__no">Q{record.questionIndex}</span>
      <span className="nt-note__q">{record.question}</span>
      <span className="nt-note__yes">
        {yesPlayers.length > 0 ? (
          yesPlayers.map((id) => (
            <i
              key={id}
              style={{ '--seat-c': seatColor(players.indexOf(id)) } as CSSProperties}
              title={nameOf(id)}
            />
          ))
        ) : (
          <em>全员 NO</em>
        )}
      </span>
    </div>
  );
}
