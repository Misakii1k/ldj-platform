/**
 * 阁楼世界 · 圆章席位卡两列（B2 定稿）。
 *
 * 每张卡：左上圆形座位号章、统一老鼠剪影（--cta-m1..m8 按座次取色，你=黄）、
 * 名字（+「你」小牌）、骰盅/骰子、睡着 Zz、已投小标、「就是你！」小卡、
 * 身份章与得票数（④ 翻面）、seat-loot 小奶酪落点。
 *
 * data-player-id 必须保留：演出层（useCheeseThiefStage）靠它量飞行落点。
 */
import { splitSeats } from './atticModel.ts';
import { CheeseWheel } from './AtticCenter.tsx';

/** 老鼠剪影（定稿统一形状，currentColor 上色；睁眼/闭眼两组切换） */
function MouseArt({ awake }: { readonly awake: boolean }) {
  return (
    <svg className="cta-mouse" viewBox="0 0 100 92" aria-hidden="true">
      <circle cx="22" cy="26" r="19" fill="currentColor" stroke="#292722" strokeWidth="4" />
      <circle cx="22" cy="26" r="9" fill="#f6b7cf" opacity=".8" />
      <circle cx="78" cy="26" r="19" fill="currentColor" stroke="#292722" strokeWidth="4" />
      <circle cx="78" cy="26" r="9" fill="#f6b7cf" opacity=".8" />
      <path d="M50 22 C78 22 90 44 90 58 C90 76 72 88 50 88 C28 88 10 76 10 58 C10 44 22 22 50 22 Z" fill="currentColor" stroke="#292722" strokeWidth="4" />
      {awake ? (
        <g>
          <circle cx="36" cy="54" r="5.5" fill="#292722" />
          <circle cx="64" cy="54" r="5.5" fill="#292722" />
          <circle cx="38" cy="52" r="1.8" fill="#fff" />
          <circle cx="66" cy="52" r="1.8" fill="#fff" />
        </g>
      ) : (
        <g stroke="#292722" strokeWidth="3.5" strokeLinecap="round" fill="none">
          <path d="M30 55 q6 5 12 0" />
          <path d="M58 55 q6 5 12 0" />
        </g>
      )}
      <ellipse cx="50" cy="68" rx="6" ry="4.5" fill="#292722" />
      <g stroke="#292722" strokeWidth="2.5" strokeLinecap="round">
        <path d="M40 70 L20 66" /><path d="M40 74 L22 78" />
        <path d="M60 70 L80 66" /><path d="M60 74 L78 78" />
      </g>
    </svg>
  );
}

/** 九点骰（PIPS 与方向稿一致） */
const PIPS: Record<number, readonly number[]> = {
  1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8],
};

export function DieFace({ value, className }: { readonly value: number; readonly className?: string }) {
  const on = PIPS[value] ?? [];
  return (
    <div className={`cta-die${className ? ` ${className}` : ''}`} aria-label={`${value} 点`} role="img">
      {Array.from({ length: 9 }, (_, i) => (
        <i key={i} className={on.includes(i) ? 'on' : undefined} />
      ))}
    </div>
  );
}

export type SeatRole = 'thief' | 'accomplice' | 'village';

export interface AtticSeatModel {
  readonly id: string;
  readonly seatNo: number;
  readonly name: string;
  readonly isMe: boolean;
  /** 老鼠色下标 1–8（--cta-m1..m8） */
  readonly tone: number;
  /** 夜里睡着（闭眼 + Zz）；白天全员睁眼 */
  readonly asleep: boolean;
  /** 醒来高亮（黄圈 + 上浮） */
  readonly awake: boolean;
  /** 显示点数的骰子；null = 不显示 */
  readonly die: number | null;
  /** 显示扣着的骰盅 */
  readonly cupped: boolean;
  /** 偷到的奶酪落在卡片左下角 */
  readonly hasLoot: boolean;
  /** 偷看/共犯挑选中：可点（虚线框 + 摇摆） */
  readonly pickable: boolean;
  /** 选中态（黄圈上浮） */
  readonly selected: boolean;
  /** 「已投」小标 */
  readonly hasVoted: boolean;
  /** 「就是你！」小卡（仅自己屏幕贴在目标上） */
  readonly voteTag: boolean;
  /** ④ 翻面后的身份章 */
  readonly revealedRole: SeatRole | null;
  /** ④ 翻面后的得票数 */
  readonly votesGot: number | null;
  /** ④ 被投出（灰卡 + 删除线） */
  readonly out: boolean;
  /** ④ 胜方高光 */
  readonly win: boolean;
  /** ④ 翻面动画类 */
  readonly flip: '' | 'out' | 'in';
  /** ③ 投票可点（挂 .cheese-vote-candidate-card 供动效脚本识别） */
  readonly voteCandidate: boolean;
}

const ROLE_TEXT: Record<SeatRole, string> = { thief: '大盗', accomplice: '共犯', village: '村民' };

function SeatCard({ seat, onSeatClick }: { readonly seat: AtticSeatModel; readonly onSeatClick?: (id: string) => void }) {
  const clickable = Boolean(onSeatClick) && (seat.pickable || seat.voteCandidate);
  const cls = [
    'cta-seat',
    seat.isMe ? 'is-me' : '',
    seat.awake ? 'is-awake' : '',
    seat.pickable ? 'is-pickable' : '',
    seat.selected ? 'is-target' : '',
    seat.hasVoted ? 'has-voted' : '',
    seat.revealedRole ? 'is-shown' : '',
    seat.out ? 'is-out' : '',
    seat.win ? 'is-win' : '',
    seat.flip ? `flip-${seat.flip}` : '',
    seat.voteCandidate ? 'cheese-vote-candidate-card' : '',
  ].filter(Boolean).join(' ');
  return (
    <div
      className={cls}
      data-player-id={seat.id}
      style={{ color: `var(--cta-m${seat.tone})` }}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={clickable ? () => onSeatClick!(seat.id) : undefined}
      onKeyDown={clickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSeatClick!(seat.id); } } : undefined}
      aria-pressed={clickable ? seat.selected : undefined}
    >
      <span className="cta-seat-no">{seat.seatNo}</span>
      {seat.asleep ? <span className="cta-zzz">Zz</span> : null}
      <div className="cta-mouse-box"><MouseArt awake={!seat.asleep} /></div>
      <div className="cta-seat-name">
        {seat.name}
        {seat.isMe ? <em className="cta-you">你</em> : null}
      </div>
      <div className="cta-seat-dice">
        {seat.cupped ? <div className="cta-cup" aria-hidden="true" /> : null}
        {seat.die !== null ? <DieFace value={seat.die} /> : null}
      </div>
      <span className="cta-seat-loot">{seat.hasLoot ? <CheeseWheel /> : null}</span>
      {seat.hasVoted ? <span className="cta-voted-mark">已投</span> : null}
      {seat.voteTag ? <span className="cta-vote-tag is-stuck">就是你！</span> : null}
      {seat.revealedRole ? (
        <span className={`cta-role cta-role--${seat.revealedRole}`}>{ROLE_TEXT[seat.revealedRole]}</span>
      ) : null}
      {seat.votesGot !== null ? <span className="cta-votes">得 {seat.votesGot} 票</span> : null}
    </div>
  );
}

interface AtticSeatsProps {
  /** 按 view.players 顺序的席位模型 */
  readonly seats: readonly AtticSeatModel[];
  readonly onSeatClick?: (id: string) => void;
}

export function AtticSeats({ seats, onSeatClick }: AtticSeatsProps) {
  const { left, right } = splitSeats(seats.map((s) => s.id));
  const byId = new Map(seats.map((s) => [s.id, s]));
  const renderCol = (ids: readonly string[], side: 'left' | 'right') => (
    <div className={`cta-col cta-col--${side}`}>
      {ids.map((id) => {
        const seat = byId.get(id);
        return seat ? <SeatCard key={id} seat={seat} onSeatClick={onSeatClick} /> : null;
      })}
    </div>
  );
  return (
    <>
      {renderCol(left, 'left')}
      {renderCol(right, 'right')}
    </>
  );
}
