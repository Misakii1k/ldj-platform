import React from 'react';
import './theatre-stage.css';

/**
 * 终局揭晓中央场景（视觉契约 §4.7 / 剧场 W07）。像素参照 R-reveal.html step=end。
 * 中央：kicker「第 N 天 · 游戏结束」+ 胜负大字盖章（砸落）+「你是 X，你赢了/你输了」
 * + 胜方角色插画并排（逐个升起）+ 逐日票型小条。
 * 两侧票根的逐张翻面、胜方金光/败方压暗由 WerewolfStage 的终局播放驱动。
 */

export interface FinaleLineupEntry {
  readonly role: string;
  readonly roleLabel: string;
  readonly artworkUrl: string;
  readonly seatLabels: readonly string[];
}

export interface FinaleDayEntry {
  readonly key: string;
  readonly label: string;
  readonly text: string;
}

export interface FinaleRevealProps {
  /** 胜方阵营；中止局为 null */
  readonly winner: 'village' | 'wolves' | null;
  readonly aborted: boolean;
  readonly day: number;
  /** 「好人胜利」/「狼人胜利」/「本局已中止」 */
  readonly banner: string;
  /** 副行：胜因 + 你的输赢（仅玩家视角；观战只显示胜因） */
  readonly line?: React.ReactNode;
  readonly lineup: readonly FinaleLineupEntry[];
  readonly days: readonly FinaleDayEntry[];
  /** 大字盖章动画 key（重进终局时重播） */
  readonly slamKey?: string | number | null;
}

export function FinaleReveal({ winner, aborted, day, banner, line = null, lineup, days, slamKey = null }: FinaleRevealProps) {
  return (
    <div className="ww-finale" key={slamKey}>
      <span className="ww-rcenter__kicker">
        {aborted ? '对局中止' : `第 ${day} 天 · 游戏结束`}
      </span>
      <strong className={`ww-finale__banner ${winner ?? 'village'}${aborted ? ' aborted' : ''}`}>{banner}</strong>
      {line ? <span className="ww-rcenter__line">{line}</span> : null}
      {lineup.length > 0 && (
        <span className="ww-finale__lineup">
          {lineup.map((entry, i) => (
            <figure key={entry.role} style={{ animationDelay: `${i * 90}ms` }}>
              <img src={entry.artworkUrl} alt={entry.roleLabel} draggable={false} />
              <figcaption><b>{entry.seatLabels.join('、').replace(/ 号/g, '')}</b> 号 {entry.roleLabel}</figcaption>
            </figure>
          ))}
        </span>
      )}
      {days.length > 0 && (
        <span className="ww-finale__days" aria-label="逐日票型">
          {days.map((d) => (
            <span key={d.key} className="ww-finale__day">
              <b>{d.label}</b> · {d.text}
            </span>
          ))}
        </span>
      )}
    </div>
  );
}
