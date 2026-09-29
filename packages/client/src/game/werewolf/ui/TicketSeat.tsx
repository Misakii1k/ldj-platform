import React from 'react';
import { UserAvatar } from '../../../user/UserAvatar.tsx';
import type { WerewolfSeatModel } from '../presentation.ts';
import './theatre-stage.css';

/**
 * 剧场票根席位卡（视觉契约 §4.1）。像素参照 `docs/ui-preview/werewolf/directions/_ticket.css`
 * 与 `A2-box-wings.html`：左侧大号衬线座位号作票根，虚线齿孔割开，右侧头像 + 名字 + 状态；
 * 出局时票根被撕掉一角。
 *
 * 深色悬疑表皮：1–1.5px 金色细边 + 贴纸阴影，**不上** 3px 粗墨边硬投影（DESIGN-DIRECTION C2）。
 *
 * 隐私红线（契约 §2）：本组件只渲染 `WerewolfSeatModel` 已有的字段，
 * 局中绝不显示死因；他人身份只在 `reveal`（game_over）时才允许进入 DOM。
 */

/** 夜间印章图案（契约 §4.4）；W04 接票根选中态，W05 复用做白痴翻牌。 */
export type TicketStamp = 'wolf' | 'paw' | 'seer' | 'witch' | 'guard' | 'hunter' | 'idiot';

/** 票根附加表现态（契约 §4.1 / §4.6 / §4.7）。 */
export type TicketTone =
  | 'default'
  /** 平票 · 加赛候选：橙边 */
  | 'candidate'
  /** 唱票最高票：金光锁定 */
  | 'top'
  /** 已放逐：原位留红色虚线空位 */
  | 'gone'
  /** 遗言：追光锁定 */
  | 'last-words'
  /** 终局胜方：金光 */
  | 'winner'
  /** 终局败方：62% 透明 */
  | 'loser';

export interface TicketSeatReveal {
  /** 身份小插画（`WEREWOLF_ROLE_ARTWORK`） */
  readonly artworkUrl: string;
  readonly team: 'wolves' | 'village';
  readonly roleLabel: string;
  /** 死因或「存活」，只在 game_over 传入 */
  readonly detail: string;
}

export interface TicketSeatProps {
  readonly seat: WerewolfSeatModel;
  /** 手机紧凑竖版：上票根 / 横向齿孔 / 下头像 + 名字 + 状态 */
  readonly compact?: boolean;
  /** 左票根上的大号衬线座位号（1 起）。缺省从 seat.seatLabel 解析。 */
  readonly seatNumber?: number;
  /** 已选中的印章（夜间 / 猎人 / 白痴翻牌）；未选中传 null */
  readonly stamp?: TicketStamp | null;
  /** 唱票票数徽章；null / 0 时不渲染 */
  readonly voteCount?: number | null;
  /** 终局揭晓态（game_over） */
  readonly reveal?: TicketSeatReveal | null;
  readonly tone?: TicketTone;
  /** 狼人视角的队友小狼爪标记 */
  readonly matePaw?: string | null;
  /** 覆盖状态行文案（发言中 / 下一位 / 已发言 / 待发言 / 已投 …） */
  readonly statusText?: string | null;
  /** 夜间标记：被刀红光（女巫视角可见） */
  readonly nightMark?: 'victim' | null;
  /** 唱票落定后的撕票坠落动画（放逐瞬间） */
  readonly torn?: boolean;
  /** 本地两步选中的「待确认」态（金色选中框 + 印章），与 seat.isMyTarget（服务端已确认）分离 */
  readonly picked?: boolean;
  /** 该席位当前可点选（有 targetActions）；仅控制指针与悬停反馈 */
  readonly pickable?: boolean;
  /** 明确不可点（如守卫昨晚已守） */
  readonly disabledTarget?: boolean;
  readonly onSelect?: (seat: WerewolfSeatModel) => void;
  readonly busy?: boolean;
  readonly synced?: boolean;
}

const STAMP_GLYPH: Readonly<Record<TicketStamp, string>> = {
  wolf: '🐾',
  paw: '🐾',
  seer: '👁',
  witch: '☠',
  guard: '🛡',
  hunter: '🎯',
  idiot: '🃏',
};

const STAMP_CLASS: Readonly<Record<TicketStamp, string>> = {
  wolf: 'is-wolf',
  paw: 'is-wolf',
  seer: 'is-seer',
  witch: 'is-witch',
  guard: 'is-guard',
  hunter: 'is-hunter',
  idiot: 'is-idiot',
};

function parseSeatNumber(seatLabel: string): number {
  const digits = seatLabel.replace(/\D/g, '');
  return digits ? Number(digits) : 1;
}

export function TicketSeat({
  seat,
  compact = false,
  seatNumber,
  stamp = null,
  voteCount = null,
  reveal = null,
  tone = 'default',
  matePaw = null,
  statusText = null,
  nightMark = null,
  torn = false,
  picked = false,
  pickable = false,
  disabledTarget = false,
  onSelect,
  busy = false,
  synced = true,
}: TicketSeatProps) {
  const no = seatNumber ?? parseSeatNumber(seat.seatLabel);
  const revealed = reveal !== null;
  // 局中出局只写「出局」，不写死因；身份只在终局揭晓后才进入 DOM（契约 §2 隐私红线）。
  const status = statusText
    ?? (revealed
      ? `${reveal.roleLabel} · ${reveal.detail}`
      : !seat.alive
        ? '出局'
        : seat.seerResultLabel
          ? `查验：${seat.seerResultLabel}`
          : seat.isMyTarget
            ? '已选择'
            : seat.statusLabel);
  const interactive = onSelect !== undefined && pickable && !busy && synced;

  const className = [
    'seat',
    'ticket',
    compact ? 'compact' : '',
    seat.isSelf ? 'is-self' : '',
    seat.isSpeaking ? 'is-speaking' : '',
    seat.isWolfTeammate ? 'is-mate' : '',
    !seat.alive ? 'is-dead' : '',
    seat.seerResultTeam ? `seer-${seat.seerResultTeam}` : '',
    seat.isMyTarget || picked ? 'is-picked' : '',
    nightMark === 'victim' ? 'is-victim' : '',
    torn ? 'torn' : '',
    pickable ? 'pickable' : '',
    disabledTarget ? 'unpickable' : '',
    revealed ? 'revealed' : '',
    revealed ? reveal.team : '',
    tone === 'default' ? '' : tone,
  ].filter(Boolean).join(' ');

  return (
    <button
      type="button"
      className={className}
      data-seat={no}
      disabled={busy || !synced}
      onClick={interactive ? () => onSelect(seat) : undefined}
      aria-label={`${seat.seatLabel} ${seat.name}，${
        revealed ? `${reveal.roleLabel}，${reveal.detail}` : !seat.alive ? '已出局' : seat.isSpeaking ? '正在发言' : '存活'
      }${seat.seerResultLabel ? `，查验为${seat.seerResultLabel}` : ''}`}
    >
      <span className="no">
        {revealed ? (
          <img src={reveal.artworkUrl} alt="" />
        ) : (
          <>
            <small>SEAT</small>
            {no}
          </>
        )}
      </span>

      <span className="body">
        <span className="ava">
          <UserAvatar avatar={seat.avatar} nickname={seat.name} size={compact ? 32 : 46} />
        </span>
        <span className="txt">
          <span className="name" title={seat.name}>{seat.name}</span>
          <span className="tag">{status}</span>
        </span>
      </span>

      {seat.isSelf && <span className="me">你</span>}
      {matePaw !== null && <span className="mate-paw" aria-hidden="true">{matePaw}</span>}
      {stamp !== null && (
        <span className={`stamp ${STAMP_CLASS[stamp]}`} aria-hidden="true">{STAMP_GLYPH[stamp]}</span>
      )}
      {voteCount !== null && voteCount > 0 && (
        <span key={voteCount} className="votes bump" aria-hidden="true">{voteCount}</span>
      )}
    </button>
  );
}
