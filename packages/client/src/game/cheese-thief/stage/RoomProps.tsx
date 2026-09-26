/**
 * 奶酪大盗 · 「夜里的房间」三件道具（V04）
 *
 * - MouseSeatRing：左区老鼠席位环。夜晚、黎明、投票、终局都在，围成一道向奶酪弯过去的弧。
 * - HourDial：右区六小时钟面。conic-gradient 画 6 格表盘，当前小时整格点亮，指针转过去。
 * - MoonArt：装饰层月亮 + 窗格剪影（currentColor，交给 .stage-art 12% 透明度）。
 *
 * 只读公开视图，不引入任何新字段；夜里谁醒着是秘密，所以夜间席位一律「沉睡」。
 */
import type { CSSProperties, ReactNode } from 'react';
import { UserAvatar } from '../../../user/UserAvatar.tsx';
import { GameIcon } from '../../../shared-ui/GameIcon.tsx';
import type { CheeseThiefPhase } from '../types.ts';
import { BallotIcon, CatIcon, CheeseIcon, DogIcon, MoonIcon, SunIcon } from './CheeseIcons.tsx';

export interface RoomSeat {
  readonly playerId: string;
  readonly name: string;
  /** 已解析好的头像标识（resolveMemberAvatar 的结果） */
  readonly avatar: string;
  /** 当前行动者（投票阶段被狗指定先投、尚未投的人） */
  readonly active: boolean;
  /** 淘汰态：终局被抓获的大盗 */
  readonly out: boolean;
  readonly status: string;
  readonly role: 'cat' | 'dog' | 'thief' | 'accomplice' | null;
  readonly winner: boolean;
  /** 投票阶段收到的票数；其他阶段为 null */
  readonly votes: number | null;
}

export interface MouseSeatRingProps {
  readonly seats: readonly RoomSeat[];
  readonly phase: CheeseThiefPhase;
}

const ROLE_TEXT: Record<NonNullable<RoomSeat['role']>, string> = {
  cat: '猫',
  dog: '狗',
  thief: '大盗',
  accomplice: '共犯',
};

function RoleGlyph({ role }: { readonly role: NonNullable<RoomSeat['role']> }) {
  if (role === 'cat') return <CatIcon />;
  if (role === 'dog') return <DogIcon />;
  return <CheeseIcon />;
}

export function MouseSeatRing({ seats, phase }: MouseSeatRingProps) {
  const n = Math.max(seats.length, 1);
  return (
    <div className="ct-ring" aria-label="老鼠席位">
      <span className="stage-eyebrow">{phase === 'night' ? 'Asleep at the table' : 'Around the table'}</span>
      <ol className="ct-ring__list">
        {seats.map((seat, i) => {
          // 弧度：两端贴边、中间向奶酪凸出——sin 曲线 0→1→0
          const arc = Math.sin(Math.PI * ((i + 0.5) / n));
          return (
            <li
              key={seat.playerId}
              className="ct-seat stage-chip"
              data-active={seat.active ? 'true' : undefined}
              data-out={seat.out ? 'true' : undefined}
              data-winner={seat.winner ? 'true' : undefined}
              style={{ ['--arc' as string]: arc.toFixed(3) } as CSSProperties}
            >
              <span className="ct-seat__avatar">
                <UserAvatar
                  avatar={seat.avatar}
                  nickname={seat.name}
                  size={32}
                />
                {phase === 'night' && (
                  <span className="ct-seat__sleep" aria-hidden="true"><MoonIcon /></span>
                )}
              </span>
              <span className="ct-seat__body">
                <span className="ct-seat__name stage-numeral" title={seat.name}>{seat.name}</span>
                <span className="ct-seat__status">
                  {seat.role && (
                    <span className="ct-seat__role" data-role={seat.role}>
                      <RoleGlyph role={seat.role} />
                      {ROLE_TEXT[seat.role]}
                    </span>
                  )}
                  {seat.status}
                </span>
              </span>
              {seat.votes !== null && (
                <span className="ct-seat__votes stage-numeral" aria-label={`${seat.votes} 票`}>{seat.votes}</span>
              )}
              {seat.winner && <GameIcon name="crown" size={18} className="ct-seat__crown" alt="胜利" />}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export interface HourDialProps {
  readonly phase: CheeseThiefPhase;
  readonly currentHour: number;
  /** 终局揭晓的案发时刻（无人偷窃为 null） */
  readonly stealHour: number | null;
  readonly voted: number;
  readonly total: number;
}

type SegState = 'idle' | 'past' | 'current' | 'crime';

const SEG_COLOR: Record<SegState, string> = {
  idle: 'var(--ct-dial-idle)',
  past: 'var(--ct-dial-past)',
  current: 'var(--ct-cheese)',
  crime: 'var(--ct-alert)',
};

function segStates(phase: CheeseThiefPhase, currentHour: number, stealHour: number | null): SegState[] {
  return [1, 2, 3, 4, 5, 6].map((h) => {
    if (phase === 'night') {
      if (h === currentHour) return 'current';
      return h < currentHour ? 'past' : 'idle';
    }
    if (phase === 'hour_choice') return 'idle';
    if (phase === 'game_over' && stealHour === h) return 'crime';
    return 'past';
  });
}

/**
 * 六小时钟面：表盘 6 格，每格 60°，1 点在正上方。
 * 背景 conic-gradient 由 JS 按状态拼出（每格之间留 2° 墨线当刻度），
 * 指针只做 rotate 过渡——transform-only，reduced 档由全局时长令牌缩短。
 */
export function HourDial({ phase, currentHour, stealHour, voted, total }: HourDialProps) {
  const states = segStates(phase, currentHour, stealHour);
  const stops = states
    .map((s, i) => {
      const a = i * 60;
      return `var(--ct-dial-line) ${a}deg ${a + 1}deg, ${SEG_COLOR[s]} ${a + 1}deg ${a + 59}deg, var(--ct-dial-line) ${a + 59}deg ${a + 60}deg`;
    })
    .join(', ');
  const face: CSSProperties = { background: `conic-gradient(from -30deg, ${stops})` };

  const handHour = phase === 'night' && currentHour >= 1 ? currentHour : phase === 'game_over' && stealHour ? stealHour : null;

  let hub: ReactNode;
  let caption: string;
  if (phase === 'night' && currentHour >= 1) {
    hub = <span className="ct-dial__numeral stage-numeral">{currentHour}</span>;
    caption = `夜间 · 第 ${currentHour} 时刻`;
  } else if (phase === 'night' || phase === 'hour_choice') {
    hub = <MoonIcon className="ct-dial__glyph" />;
    caption = phase === 'night' ? '夜幕降临 · 即将报时' : '各自选定醒来时刻';
  } else if (phase === 'accomplice_select') {
    hub = <MoonIcon className="ct-dial__glyph" />;
    caption = '六个时刻已过 · 大盗物色同伙';
  } else if (phase === 'dawn') {
    hub = <SunIcon className="ct-dial__glyph" />;
    caption = '天亮了 · 自由讨论';
  } else if (phase === 'vote') {
    hub = (
      <span className="ct-dial__numeral ct-dial__numeral--tally stage-numeral">
        {voted}<small>/{total}</small>
      </span>
    );
    caption = '投票进度';
  } else {
    hub = stealHour
      ? <span className="ct-dial__numeral stage-numeral">{stealHour}</span>
      : <CheeseIcon className="ct-dial__glyph" />;
    caption = stealHour ? `案发时刻：第 ${stealHour} 时刻` : '整夜无人得手';
  }

  return (
    <div className="ct-clock" aria-label={caption}>
      <span className="stage-eyebrow">{phase === 'vote' ? 'Ballots' : 'Six o’clock night'}</span>
      <div className="ct-dial" data-phase={phase}>
        <div className="ct-dial__face" style={face} aria-hidden="true" />
        <ol className="ct-dial__marks" aria-hidden="true">
          {states.map((s, i) => (
            <li
              key={i}
              className="ct-dial__mark stage-numeral"
              data-state={s}
              style={{ ['--a' as string]: `${i * 60}deg` } as CSSProperties}
            >
              <span>{i + 1}</span>
            </li>
          ))}
        </ol>
        {handHour !== null && (
          <span
            className="ct-dial__hand"
            aria-hidden="true"
            style={{ transform: `rotate(${(handHour - 1) * 60}deg)` }}
          />
        )}
        <div className="ct-dial__hub">
          {phase === 'vote' ? <BallotIcon className="ct-dial__hub-icon" /> : null}
          {hub}
        </div>
      </div>
      <p className="ct-clock__caption">{caption}</p>
    </div>
  );
}

/** 装饰层：一轮月亮挂在窗格里，窗台下一块奶酪剪影。 */
export function MoonArt() {
  return (
    <svg viewBox="0 0 640 400" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
      <defs>
        <pattern id="ct-hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(-32)">
          <line x1="0" y1="0" x2="0" y2="8" stroke="currentColor" strokeWidth="1.3" />
        </pattern>
      </defs>
      {/* 窗框 */}
      <rect x="170" y="30" width="300" height="250" rx="140" fill="none" stroke="currentColor" strokeWidth="10" />
      <line x1="320" y1="34" x2="320" y2="280" stroke="currentColor" strokeWidth="6" />
      <line x1="174" y1="170" x2="466" y2="170" stroke="currentColor" strokeWidth="6" />
      {/* 月亮：大圆减去偏移圆 */}
      <path d="M392 72a62 62 0 1 0 38 104 50 50 0 1 1-38-104Z" fill="currentColor" />
      {/* 窗台 */}
      <rect x="140" y="280" width="360" height="18" rx="6" fill="currentColor" />
      {/* 奶酪楔块 + 斜线阴影 */}
      <path d="M232 360 L408 318 L408 372 L232 372 Z" fill="currentColor" />
      <path d="M250 362 L396 328 L396 364 L250 364 Z" fill="url(#ct-hatch)" opacity="0.6" />
    </svg>
  );
}
