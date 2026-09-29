import React from 'react';

function LanternSvg() {
  return (
    <svg viewBox="0 0 60 100" aria-hidden="true" style={{ width: '100%', height: 'auto', display: 'block' }}>
      <line x1="30" y1="0" x2="30" y2="14" stroke="var(--gp-ink)" strokeWidth="3" />
      <rect x="17" y="11" width="26" height="9" rx="2" fill="var(--th-gold)" stroke="var(--gp-ink)" strokeWidth="3" />
      <ellipse cx="30" cy="48" rx="27" ry="30" fill="var(--th-lantern-body, var(--th-red))" stroke="var(--gp-ink)" strokeWidth="4" />
      <ellipse cx="22" cy="40" rx="6" ry="12" fill="var(--th-lantern-accent, var(--th-red-dark))" opacity="0.7" />
      <path d="M30 18 V78 M15 24 Q6 48 15 72 M45 24 Q54 48 45 72" stroke="var(--th-red-dark)" strokeWidth="3" fill="none" />
      <text
        x="30"
        y="56"
        textAnchor="middle"
        fontFamily="var(--gp-font-display, serif)"
        fontWeight="700"
        fontSize="20"
        fill="var(--th-gold)"
        stroke="var(--gp-ink)"
        strokeWidth="0.8"
      >
        茶
      </text>
      <rect x="17" y="76" width="26" height="9" rx="2" fill="var(--th-gold)" stroke="var(--gp-ink)" strokeWidth="3" />
      <path d="M24 85 V99 M30 85 V100 M36 85 V99" stroke="var(--th-lantern-body, var(--th-red))" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function TeapotSvg() {
  return (
    <svg viewBox="0 0 120 70" aria-hidden="true" style={{ width: '100%', height: 'auto', display: 'block' }}>
      <ellipse cx="60" cy="56" rx="54" ry="11" fill="var(--gp-surface, var(--th-card-inner-white))" stroke="var(--gp-ink)" strokeWidth="4" />
      <ellipse cx="60" cy="54" rx="34" ry="5" fill="var(--th-wall-dark)" />
      <path d="M26 26 Q26 54 60 54 Q94 54 94 26 Z" fill="var(--gp-surface, var(--th-card-inner-white))" stroke="var(--gp-ink)" strokeWidth="4" strokeLinejoin="round" />
      <path d="M34 34 Q60 42 86 34" stroke="var(--th-jade)" strokeWidth="5" fill="none" strokeLinecap="round" />
      <path d="M52 40 q4 -6 8 0 q4 6 8 0" stroke="var(--th-jade)" strokeWidth="3" fill="none" />
      <ellipse cx="60" cy="24" rx="37" ry="8" fill="var(--gp-surface, var(--th-card-inner-white))" stroke="var(--gp-ink)" strokeWidth="4" />
      <circle cx="60" cy="16" r="6" fill="var(--gp-surface, var(--th-card-inner-white))" stroke="var(--gp-ink)" strokeWidth="3.5" />
      <path d="M48 8 q3 -6 0 -10 M66 6 q3 -6 0 -10" stroke="var(--gp-ink-subtle)" strokeWidth="2.5" fill="none" strokeLinecap="round" opacity="0.7" />
    </svg>
  );
}

/**
 * 斗地主茶馆正堂全景装饰（纯展示，aria-hidden）。
 *
 * 包含：墙面、墙裙、大梁、梁托、花窗、对联、牌匾、灯笼、八仙桌、盖碗茶。
 */
export function TeahouseScene() {
  return (
    <div className="th-scene" aria-hidden="true">
      <div className="th-wall" />
      <div className="th-wainscot" />
      <div className="th-beam" />
      <span className="th-bracket is-left" />
      <span className="th-bracket is-right" />
      <div className="th-win is-left" />
      <div className="th-win is-right" />
      <div className="th-couplet is-left">春风得意</div>
      <div className="th-couplet is-right">四海来财</div>
      <div className="th-plaque">聚乐茶馆</div>
      <div className="th-lantern is-left">
        <LanternSvg />
      </div>
      <div className="th-lantern is-right">
        <LanternSvg />
      </div>
      <div className="th-table-wrap">
        <div className="th-table" />
        <div className="th-table-edge" />
      </div>
      <div className="th-teapot">
        <TeapotSvg />
      </div>
    </div>
  );
}
