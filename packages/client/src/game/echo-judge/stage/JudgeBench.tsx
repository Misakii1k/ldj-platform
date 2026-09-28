/**
 * 审判席：顶部高木台，审判长深色卡骑在席顶，席面刻「审 判 席」，右侧木槌。
 * 像素参照：docs/ui-preview/echo-judge/directions/B-courtroom.css（.bench / .gavel）。
 */
import type { RefObject } from 'react';
import { SeatBust } from './CourtSeats.tsx';

export interface JudgeBenchProps {
  /** 审判长姓名 */
  readonly name: string;
  /** 座位号 */
  readonly seatNo: number;
  /** 玩家色（头像填充） */
  readonly color: string;
  /** 状态小字（选题中 / 聆听中 / 斟酌中…） */
  readonly status: string;
  readonly isMe?: boolean;
  /** 敲一下（立案 / 交棒 / 宣判），演完即清 */
  readonly striking?: boolean;
  /** 审判阶段旁听席视角：木槌持续举起放下（1.6s 循环） */
  readonly raising?: boolean;
  readonly stageRef?: RefObject<HTMLDivElement | null>;
}

export function JudgeBench({ name, seatNo, color, status, isMe = false, striking = false, raising = false, stageRef }: JudgeBenchProps) {
  return (
    <div className="ej-bench" ref={stageRef} data-stage-anchor="bench">
      <div className={`ej-seat ej-seat--judge${isMe ? ' is-me' : ''}`} style={{ ['--seat-c' as string]: color }}>
        <span className="ej-seat__no" aria-hidden="true">{seatNo}</span>
        <div className="ej-seat__av" style={{ color }}>
          <SeatBust />
        </div>
        <div className="ej-seat__nm">
          {name}
          {isMe && <em className="ej-seat__you">你</em>}
        </div>
        <div className="ej-seat__st">{status}</div>
      </div>
      <span className="ej-bench__plate">审 判 席</span>
      <svg
        className="ej-gavel"
        data-striking={striking ? 'true' : undefined}
        data-raising={raising ? 'true' : undefined}
        viewBox="0 0 80 60"
        aria-hidden="true"
      >
        <rect x="6" y="6" width="44" height="24" rx="6" fill="var(--ej-wood-d)" stroke="var(--game-ink)" strokeWidth="4" />
        <rect x="14" y="4" width="6" height="28" fill="var(--ej-wood)" stroke="var(--game-ink)" strokeWidth="3" />
        <rect x="36" y="4" width="6" height="28" fill="var(--ej-wood)" stroke="var(--game-ink)" strokeWidth="3" />
        <path d="M44 22 L76 52" stroke="var(--game-ink)" strokeWidth="10" strokeLinecap="round" />
        <path d="M44 22 L76 52" stroke="var(--ej-wood)" strokeWidth="4" strokeLinecap="round" />
      </svg>
    </div>
  );
}
