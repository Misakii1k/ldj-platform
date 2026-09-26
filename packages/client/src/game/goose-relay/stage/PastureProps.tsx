import type { CSSProperties, ReactNode } from 'react';
import { GOOSE_CARD_MAP } from '../cardCatalog.ts';

/**
 * V05 牧场道具：装饰层剪影、鹅卡头像分配、牧场跑道。
 *
 * 80 张鹅卡插画此前只在弹窗里露出 9 张，毡面上一只鹅都没有。
 * 这里把它们派给每位玩家当「跑道上的那只鹅」，传递飞行也飞这张卡。
 */

/** 全部 80 张鹅卡图，按编号排序保证各端顺序一致 */
const GOOSE_IMAGES: readonly string[] = Object.values(GOOSE_CARD_MAP)
  .slice()
  .sort((a, b) => a.id.localeCompare(b.id))
  .map((card) => card.image);

/** FNV-1a：短字符串足够均匀，且不依赖任何运行时随机 */
function hashId(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i += 1) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * 按 playerId 哈希给每人派一张鹅卡当头像。
 * 同桌撞图时线性探测到下一张空位；按 id 排序后再分配，结果与座次顺序无关，
 * 所以同一局里所有客户端看到的是同一群鹅。
 */
export function assignGooseAvatars(playerIds: readonly string[]): ReadonlyMap<string, string> {
  const out = new Map<string, string>();
  const taken = new Set<number>();
  const total = GOOSE_IMAGES.length;
  for (const id of [...playerIds].sort()) {
    let slot = hashId(id) % total;
    for (let probe = 0; probe < total && taken.has(slot); probe += 1) {
      slot = (slot + 1) % total;
    }
    taken.add(slot);
    out.set(id, GOOSE_IMAGES[slot]!);
  }
  return out;
}

/** 单人兜底（不在名单里时用） */
export function gooseAvatarFor(playerId: string): string {
  return GOOSE_IMAGES[hashId(playerId) % GOOSE_IMAGES.length]!;
}

/**
 * 牧场剪影：远山云朵 + 近处一排木篱笆。currentColor 着色，
 * 由 .stage-art 压到 12% 透明度；刻痕用 <pattern> 斜线伪装木纹。
 */
export function PastureArt() {
  return (
    <svg viewBox="0 0 640 400" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
      <defs>
        <pattern id="gr-woodgrain" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(80)">
          <line x1="0" y1="0" x2="0" y2="6" stroke="currentColor" strokeWidth="1.2" />
        </pattern>
      </defs>
      {/* 云朵：三团叠圆，越远越淡 */}
      <g fill="currentColor">
        <g opacity="0.55">
          <circle cx="112" cy="84" r="26" />
          <circle cx="144" cy="72" r="34" />
          <circle cx="182" cy="86" r="24" />
          <rect x="96" y="84" width="104" height="26" rx="13" />
        </g>
        <g opacity="0.4">
          <circle cx="446" cy="60" r="20" />
          <circle cx="474" cy="50" r="28" />
          <circle cx="506" cy="62" r="20" />
          <rect x="432" y="60" width="90" height="22" rx="11" />
        </g>
        <g opacity="0.28">
          <circle cx="306" cy="118" r="14" />
          <circle cx="326" cy="110" r="20" />
          <circle cx="348" cy="120" r="14" />
          <rect x="294" y="118" width="66" height="16" rx="8" />
        </g>
      </g>
      {/* 远处起伏的草坡 */}
      <path d="M0 250 Q120 206 250 236 T500 226 T640 238 L640 270 L0 270 Z" fill="currentColor" opacity="0.35" />
      {/* 近处篱笆：两道横杆 + 一排尖顶木桩 */}
      <g fill="currentColor">
        <rect x="0" y="292" width="640" height="12" rx="4" />
        <rect x="0" y="332" width="640" height="12" rx="4" />
        {Array.from({ length: 11 }, (_, i) => {
          const x = 14 + i * 60;
          return <path key={x} d={`M${x} 360 L${x} 282 L${x + 11} 266 L${x + 22} 282 L${x + 22} 360 Z`} />;
        })}
      </g>
      <g fill="url(#gr-woodgrain)" opacity="0.6">
        <rect x="0" y="292" width="640" height="12" />
        <rect x="0" y="332" width="640" height="12" />
      </g>
      {/* 草地前沿 */}
      <path d="M0 360 Q160 346 320 356 T640 352 L640 400 L0 400 Z" fill="currentColor" opacity="0.5" />
    </svg>
  );
}

export type GooseTrackState = 'idle' | 'active' | 'done';

export interface GooseTrackSeat {
  readonly playerId: string;
  readonly label: string;
  /** 卡角徽标：棒次 / 头鹅 / ✓ */
  readonly badge: ReactNode;
  readonly state: GooseTrackState;
  readonly isHead: boolean;
  readonly isMe: boolean;
  readonly avatar: string;
}

export interface GooseTrackProps {
  readonly seats: readonly GooseTrackSeat[];
  readonly label: string;
  /** 指认阶段倒着走：跑道方向箭头反转 */
  readonly reverse?: boolean;
}

/**
 * 牧场跑道：一条弧形草径，每个席位是一枚鹅卡缩略。
 * 当前持棒者放大 1.15 + 静态光晕（不循环，颜色之外还有尺寸信号）；
 * 已传完的卡压暗并打 ✓。弧度由 --gr-arc（0..1）逐个下发，中间最高。
 *
 * data-gr-seat 供演出层测量：传递飞行从这张卡飞到下一张卡。
 */
export function GooseTrack({ seats, label, reverse = false }: GooseTrackProps) {
  const last = Math.max(1, seats.length - 1);
  return (
    <ol
      className="gr-track"
      aria-label={label}
      data-direction={reverse ? 'reverse' : 'forward'}
      style={{ ['--gr-n' as string]: Math.max(1, seats.length) } as CSSProperties}
    >
      {seats.map((seat, index) => {
        const t = seats.length > 1 ? index / last : 0.5;
        const style = { ['--gr-arc' as string]: Math.sin(Math.PI * t).toFixed(3) } as CSSProperties;
        return (
          <li
            key={seat.playerId}
            className="gr-track__seat"
            data-state={seat.state}
            data-head={seat.isHead || undefined}
            data-me={seat.isMe || undefined}
            aria-current={seat.state === 'active' ? 'step' : undefined}
            style={style}
          >
            <span className="gr-track__card" data-gr-seat={seat.playerId}>
              <img className="gr-track__img" src={seat.avatar} alt="" loading="lazy" draggable={false} />
              <span className="gr-track__badge">{seat.badge}</span>
            </span>
            <span className="gr-track__name">{seat.label}</span>
          </li>
        );
      })}
    </ol>
  );
}
