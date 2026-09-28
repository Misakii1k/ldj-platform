/**
 * 法庭小道具：天平剪影、卷宗、身份条、立案三卷宗、身份二选一、宣判告示牌与账单。
 * 像素参照：docs/ui-preview/echo-judge/directions/{B-courtroom,S1-setup,S3-judgment,S4-verdict}.html
 */
import { useState, type ReactNode } from 'react';
import type { TopicCardView } from '../types.ts';
import { SeatBust } from './CourtSeats.tsx';

/** 墙上的天平剪影（.stage-art 12% 透明度，手机隐藏由 CSS 控制） */
export function ScalesArt() {
  return (
    <div className="stage-art ej-art" aria-hidden="true">
      <svg viewBox="0 0 100 90" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round">
        <path d="M50 8v70M30 82h40M14 24h72" />
        <path d="M14 24l-10 26h20z" />
        <path d="M86 24l-10 26h20z" />
        <circle cx="50" cy="8" r="4" />
      </svg>
    </div>
  );
}

/** 左上卡纸告示牌：游戏名 + 轮次/阶段 */
export function HeadPlacard({ round, rounds, phaseText }: { round: number; rounds: number; phaseText: string }) {
  return (
    <header className="ej-head">
      <h1 className="ej-head__title">伪人测试</h1>
      <p className="ej-head__eyebrow">
        第 {round} / {rounds} 轮 · {phaseText}
      </p>
    </header>
  );
}

export interface DossierProps {
  /** 页签文字（「卷宗 · 第 N 案」）；null 不带页签 */
  readonly tab?: string | null;
  /** 选中展开（立案 pop 动画） */
  readonly opened?: boolean;
  readonly children: ReactNode;
}

/** 证人席上的卷宗：页签 + 奶油纸 + 墨线 + 硬投影 */
export function Dossier({ tab = null, opened = false, children }: DossierProps) {
  return (
    <div className={`ej-dossier${opened ? ' is-opened' : ''}`} data-tab={tab ?? undefined}>
      {children}
    </div>
  );
}

/** 卷宗右下角的章（口 述 / 立 案） */
export function DossierStamp({ text, tone = 'coral' }: { text: string; tone?: 'coral' | 'dark' }) {
  return <span className={`ej-stamp ej-stamp--${tone}`}>{text}</span>;
}

/** 分段发言进度条：每段一人，已说 = 该玩家色，当前 = 黄色脉动 */
export function ProgressPips({
  order,
  colorOf,
  answeredCount,
  currentId,
}: {
  order: readonly string[];
  colorOf: (id: string) => string;
  answeredCount: number;
  currentId: string | null;
}) {
  return (
    <div className="ej-progress">
      <span className="ej-progress__numeral">
        {answeredCount}/{order.length}
      </span>
      <span className="ej-progress__label">已作答</span>
      <div className="ej-progress__pips">
        {order.map((id, i) => (
          <span
            key={id}
            className={`ej-pip${i < answeredCount ? ' is-done' : ''}${id === currentId ? ' is-now' : ''}`}
            style={{ ['--seat-c' as string]: colorOf(id) }}
          />
        ))}
      </div>
    </div>
  );
}

/** 底栏黑色身份条：点击遮挡 / 显示（参照 _shared.css 的 .secret blur 方案） */
export function SecretStrip({
  isJudge,
  role,
  triggerWord,
}: {
  isJudge: boolean;
  role: 'human' | 'impostor' | null;
  triggerWord: string | null;
}) {
  const [hidden, setHidden] = useState(false);
  const tag = isJudge ? '你是审判长' : role === 'impostor' ? '你是伪人' : '你是人类';
  const word = isJudge ? '主持开庭 · 聆听指认' : role === 'impostor' && triggerWord ? `暗号「${triggerWord}」` : '如实作答';
  return (
    <button
      type="button"
      className={`ej-secret${hidden ? ' is-hidden' : ''}`}
      onClick={() => setHidden((v) => !v)}
      title="点击遮挡 / 显示"
    >
      <span className="ej-secret__meta">
        <span className="ej-secret__tag">{tag}</span>
        <small>点击遮挡</small>
      </span>
      <span className="ej-secret__word">{word}</span>
    </button>
  );
}

/** 立案页签三色（用户 2026-09-28 确认）：米橙 / 浅绿 / 浅紫 */
const CASE_TAB_COLORS = ['#fde0c6', '#dfe9d6', '#e6ddf2'];
const CASE_TAB_NAMES = ['卷宗 · 甲', '卷宗 · 乙', '卷宗 · 丙'];

/** ① 立案：审判长三份卷宗 3 选 1。点击即提交（本阶段没有黄色按钮）。 */
export function CaseCards({
  cards,
  pickedId,
  onPick,
}: {
  cards: readonly TopicCardView[];
  pickedId: string | null;
  onPick: (cardId: string) => void;
}) {
  return (
    <div className="ej-cases" role="listbox" aria-label="三份候选卷宗">
      {cards.map((card, i) => (
        <button
          key={card.id}
          type="button"
          role="option"
          aria-selected={pickedId === card.id}
          className={`ej-case${pickedId !== null && pickedId !== card.id ? ' is-gone' : ''}`}
          data-tab={CASE_TAB_NAMES[i % CASE_TAB_NAMES.length]}
          style={{ ['--tab' as string]: CASE_TAB_COLORS[i % CASE_TAB_COLORS.length] }}
          onClick={() => onPick(card.id)}
          disabled={pickedId !== null}
        >
          <span className="ej-case__cat">{card.categoryLabel}</span>
          <span className="ej-case__txt">{card.text}</span>
          <span className="ej-case__pick">立这一案 →</span>
        </button>
      ))}
    </div>
  );
}

/** ① 立案：旁听席身份二选一大卡（选中伪人弹黄色暗号卡） */
export function RoleCards({
  role,
  triggerWord,
  onChoose,
}: {
  role: 'human' | 'impostor' | null;
  triggerWord: string | null;
  onChoose: (role: 'human' | 'impostor') => void;
}) {
  return (
    <div className="ej-roles">
      <button
        type="button"
        className="ej-role ej-role--human"
        aria-pressed={role === 'human'}
        onClick={() => onChoose('human')}
      >
        <span className="ej-role__av" aria-hidden="true">
          <SeatBust />
        </span>
        <strong>当人类</strong>
        <span>
          如实回答就好
          <br />
          审判长抓错你，他扣分
        </span>
      </button>
      <button
        type="button"
        className="ej-role ej-role--impostor"
        aria-pressed={role === 'impostor'}
        onClick={() => onChoose('impostor')}
      >
        <span className="ej-role__av" aria-hidden="true">
          <SeatBust />
        </span>
        <strong>当伪人</strong>
        <span>
          把暗号自然地说进回答里
          <br />
          没被抓 +2，被抓 −1
        </span>
        {role === 'impostor' && triggerWord && <em className="ej-role__word">暗号「{triggerWord}」</em>}
      </button>
    </div>
  );
}

/** ③ 审判：旁听席看到的「审判长正在斟酌」深色条 */
export function PonderStrip({ judgeName }: { judgeName: string }) {
  return (
    <div className="ej-ponder" role="status">
      <span className="ej-ponder__dots" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      <span>审判长 {judgeName} 正在斟酌……谁被点了你看不到</span>
    </div>
  );
}

export interface VerdictBanner {
  readonly kind: 'caught' | 'escaped';
  readonly title: string;
  readonly sub: string;
}

export interface VerdictLedgerRow {
  readonly name: string;
  readonly why: string;
  readonly delta: number;
}

/** ④ 宣判：中央结果告示牌 + 账单卡（盖在卷宗区上方） */
export function VerdictOverlay({
  banner,
  ledger,
}: {
  banner: VerdictBanner | null;
  ledger: readonly VerdictLedgerRow[] | null;
}) {
  if (!banner && !ledger) return null;
  return (
    <div className="ej-verdict" aria-live="polite">
      {banner && (
        <div className={`ej-verdict__banner is-${banner.kind}`}>
          {banner.title}
          {banner.sub && <small>{banner.sub}</small>}
        </div>
      )}
      {ledger && ledger.length > 0 && (
        <div className="ej-verdict__ledger">
          {ledger.map((row) => (
            <div className="ej-verdict__row" key={`${row.name}:${row.why}`}>
              <span>{row.name}</span>
              <span className="ej-verdict__why">{row.why}</span>
              <span className={`ej-verdict__d ${row.delta > 0 ? 'is-plus' : row.delta < 0 ? 'is-minus' : ''}`}>
                {row.delta > 0 ? '+' : row.delta < 0 ? '−' : '±'}
                {Math.abs(row.delta)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
