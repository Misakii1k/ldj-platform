import React from 'react';
import type { WerewolfThemeKey } from './WerewolfThemeSwitcher.tsx';

interface WerewolfThemeArtProps {
  readonly theme: WerewolfThemeKey;
}

export function WerewolfThemeArt({ theme }: WerewolfThemeArtProps) {
  return (
    <div className={`ww-theme-art ww-theme-art--${theme}`} aria-hidden="true">
      {theme === 'woodcut' && (
        <div className="ww-art-woodcut">
          <svg className="ww-art-forest" viewBox="0 0 600 400">
            <defs>
              <pattern id="ww-cuts" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(23)">
                <path d="M0 0V8" stroke="currentColor" strokeWidth="2" />
              </pattern>
            </defs>
            <circle cx="308" cy="148" r="108" fill="currentColor" />
            <path
              d="M0 380L40 25 70 380M70 400L112 62 150 400M438 400L477 25 520 400M510 400L565 5 605 400"
              fill="var(--ww-bg, #161e20)"
              stroke="currentColor"
              strokeWidth="3"
            />
            <path
              d="M218 320L213 118 277 179 329 171 392 99 374 312 305 368Z"
              fill="var(--ww-bg, #161e20)"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              d="M230 142L276 191 240 246M374 126L330 193 361 247M240 257L279 270 265 243M363 257L325 270 340 243M277 307L304 326 331 305 305 350Z"
              fill="currentColor"
            />
            <path
              d="M226 290L283 340M228 302L273 348M370 286L327 338M367 302L337 345"
              stroke="currentColor"
              strokeWidth="2"
            />
            <path
              d="M0 380L40 25 70 380M438 400L477 25 520 400"
              fill="url(#ww-cuts)"
            />
            <path d="M140 370Q300 395 453 367" stroke="currentColor" fill="none" />
          </svg>
          <span className="ww-art-caption">没有人，能够置身故事之外。</span>
        </div>
      )}

      {theme === 'eclipse' && (
        <div className="ww-art-eclipse">
          <div className="ww-astral">
            <div className="ww-orbit ww-o1" />
            <div className="ww-orbit ww-o2" />
            <div className="ww-orbit ww-o3" />
            <span className="ww-star ww-s1">✦</span>
            <span className="ww-star ww-s2">✧</span>
            <div className="ww-moon" />
            <span className="ww-lunar-label">☽ &nbsp; III &nbsp; ☾</span>
          </div>
          <span className="ww-art-caption">月亮隐去的，是谁的秘密。</span>
        </div>
      )}

      {theme === 'theatre' && (
        <div className="ww-art-theatre">
          <div className="ww-theatre-stage">
            <div className="ww-drape ww-drape--left" />
            <div className="ww-drape ww-drape--right" />
            <div className="ww-beam" />
            <span className="ww-act">
              ACT<br />
              <b>III</b>
            </span>
          </div>
          <span className="ww-art-caption">幕布落下之前，真相还未谢幕。</span>
        </div>
      )}
    </div>
  );
}
