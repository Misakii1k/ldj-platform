import React, { useState } from 'react';
import type { CSSProperties } from 'react';
import type { PlayerCount } from '@ldj/shared';

interface HomePartySceneProps {
  selectedCount: PlayerCount | null;
}

interface SeatPosition {
  left: string;
  top: string;
  rotate: string;
  zIndex: number;
}

const CHARACTER_PROFILES = [
  { id: 0, name: '小雅' },
  { id: 1, name: '阿杰' },
  { id: 2, name: '晓涵' },
  { id: 3, name: '浩宇' },
  { id: 4, name: '婷婷' },
  { id: 5, name: '东东' },
  { id: 6, name: '若曦' },
  { id: 7, name: '小龙' },
  { id: 8, name: '美琪' },
  { id: 9, name: '志鹏' },
  { id: 10, name: '思琪' },
  { id: 11, name: '凯文' },
] as const;

// 任意人数（2~12人）对称均分极坐标席位分布
const SEAT_LAYOUTS: Record<number, SeatPosition[]> = {
  2: [
    { left: '20%', top: '30%', rotate: '-12deg', zIndex: 2 },
    { left: '80%', top: '30%', rotate: '12deg', zIndex: 2 },
  ],
  3: [
    { left: '20%', top: '30%', rotate: '-12deg', zIndex: 2 },
    { left: '50%', top: '9%', rotate: '0deg', zIndex: 2 },
    { left: '80%', top: '30%', rotate: '12deg', zIndex: 2 },
  ],
  4: [
    { left: '17%', top: '32%', rotate: '-16deg', zIndex: 2 },
    { left: '35%', top: '12%', rotate: '-6deg', zIndex: 2 },
    { left: '65%', top: '12%', rotate: '6deg', zIndex: 2 },
    { left: '83%', top: '32%', rotate: '16deg', zIndex: 2 },
  ],
  5: [
    { left: '16%', top: '35%', rotate: '-16deg', zIndex: 2 },
    { left: '32%', top: '15%', rotate: '-8deg', zIndex: 2 },
    { left: '50%', top: '9%', rotate: '0deg', zIndex: 2 },
    { left: '68%', top: '15%', rotate: '8deg', zIndex: 2 },
    { left: '84%', top: '35%', rotate: '16deg', zIndex: 2 },
  ],
  6: [
    { left: '15%', top: '34%', rotate: '-18deg', zIndex: 2 },
    { left: '27%', top: '17%', rotate: '-11deg', zIndex: 2 },
    { left: '42%', top: '10%', rotate: '-4deg', zIndex: 2 },
    { left: '58%', top: '10%', rotate: '4deg', zIndex: 2 },
    { left: '73%', top: '17%', rotate: '11deg', zIndex: 2 },
    { left: '85%', top: '34%', rotate: '18deg', zIndex: 2 },
  ],
  7: [
    { left: '15%', top: '34%', rotate: '-18deg', zIndex: 2 },
    { left: '27%', top: '17%', rotate: '-11deg', zIndex: 2 },
    { left: '42%', top: '10%', rotate: '-4deg', zIndex: 2 },
    { left: '58%', top: '10%', rotate: '4deg', zIndex: 2 },
    { left: '73%', top: '17%', rotate: '11deg', zIndex: 2 },
    { left: '85%', top: '34%', rotate: '18deg', zIndex: 2 },
    { left: '50%', top: '70%', rotate: '0deg', zIndex: 4 },
  ],
  8: [
    { left: '15%', top: '33%', rotate: '-18deg', zIndex: 2 },
    { left: '26%', top: '16%', rotate: '-11deg', zIndex: 2 },
    { left: '42%', top: '9%', rotate: '-4deg', zIndex: 2 },
    { left: '58%', top: '9%', rotate: '4deg', zIndex: 2 },
    { left: '74%', top: '16%', rotate: '11deg', zIndex: 2 },
    { left: '85%', top: '33%', rotate: '18deg', zIndex: 2 },
    { left: '65%', top: '68%', rotate: '6deg', zIndex: 4 },
    { left: '35%', top: '68%', rotate: '-6deg', zIndex: 4 },
  ],
  9: [
    { left: '15%', top: '32%', rotate: '-18deg', zIndex: 2 },
    { left: '26%', top: '15%', rotate: '-11deg', zIndex: 2 },
    { left: '42%', top: '9%', rotate: '-4deg', zIndex: 2 },
    { left: '58%', top: '9%', rotate: '4deg', zIndex: 2 },
    { left: '74%', top: '15%', rotate: '11deg', zIndex: 2 },
    { left: '85%', top: '32%', rotate: '18deg', zIndex: 2 },
    { left: '70%', top: '62%', rotate: '10deg', zIndex: 4 },
    { left: '50%', top: '70%', rotate: '0deg', zIndex: 4 },
    { left: '30%', top: '62%', rotate: '-10deg', zIndex: 4 },
  ],
  10: [
    { left: '15%', top: '31%', rotate: '-18deg', zIndex: 2 },
    { left: '25%', top: '15%', rotate: '-12deg', zIndex: 2 },
    { left: '41%', top: '9%', rotate: '-5deg', zIndex: 2 },
    { left: '59%', top: '9%', rotate: '5deg', zIndex: 2 },
    { left: '75%', top: '15%', rotate: '12deg', zIndex: 2 },
    { left: '85%', top: '31%', rotate: '18deg', zIndex: 2 },
    { left: '75%', top: '57%', rotate: '12deg', zIndex: 4 },
    { left: '60%', top: '68%', rotate: '6deg', zIndex: 4 },
    { left: '40%', top: '68%', rotate: '-6deg', zIndex: 4 },
    { left: '25%', top: '57%', rotate: '-12deg', zIndex: 4 },
  ],
  11: [
    { left: '15%', top: '31%', rotate: '-18deg', zIndex: 2 },
    { left: '25%', top: '15%', rotate: '-12deg', zIndex: 2 },
    { left: '37%', top: '9%', rotate: '-6deg', zIndex: 2 },
    { left: '50%', top: '7%', rotate: '0deg', zIndex: 2 },
    { left: '63%', top: '9%', rotate: '6deg', zIndex: 2 },
    { left: '75%', top: '15%', rotate: '12deg', zIndex: 2 },
    { left: '85%', top: '31%', rotate: '18deg', zIndex: 2 },
    { left: '75%', top: '57%', rotate: '12deg', zIndex: 4 },
    { left: '60%', top: '68%', rotate: '6deg', zIndex: 4 },
    { left: '40%', top: '68%', rotate: '-6deg', zIndex: 4 },
    { left: '25%', top: '57%', rotate: '-12deg', zIndex: 4 },
  ],
  12: [
    { left: '15%', top: '31%', rotate: '-18deg', zIndex: 2 },
    { left: '25%', top: '15%', rotate: '-12deg', zIndex: 2 },
    { left: '37%', top: '9%', rotate: '-6deg', zIndex: 2 },
    { left: '50%', top: '7%', rotate: '0deg', zIndex: 2 },
    { left: '63%', top: '9%', rotate: '6deg', zIndex: 2 },
    { left: '75%', top: '15%', rotate: '12deg', zIndex: 2 },
    { left: '85%', top: '31%', rotate: '18deg', zIndex: 2 },
    { left: '76%', top: '55%', rotate: '14deg', zIndex: 4 },
    { left: '63%', top: '68%', rotate: '8deg', zIndex: 4 },
    { left: '50%', top: '72%', rotate: '0deg', zIndex: 4 },
    { left: '37%', top: '68%', rotate: '-8deg', zIndex: 4 },
    { left: '24%', top: '55%', rotate: '-14deg', zIndex: 4 },
  ],
};

function getSceneStage(count: PlayerCount | null): 'small' | 'cozy' | 'lively' | 'full' {
  if (count !== null && count <= 4) return 'small';
  if (count === null || count <= 5) return 'cozy';
  if (count <= 8) return 'lively';
  return 'full';
}

export function HomePartyScene({ selectedCount }: HomePartySceneProps) {
  const visibleCount = selectedCount ?? 5;
  const stage = getSceneStage(selectedCount);
  const [hoveredPerson, setHoveredPerson] = useState<number | null>(null);

  // 获取当前人数对应的均衡席位布局
  const activeSeats = SEAT_LAYOUTS[visibleCount] || SEAT_LAYOUTS[5];

  return (
    <div
      className={`home-party-scene home-party-scene--${stage}`}
      data-player-count={selectedCount ?? 'all'}
      data-scene-stage={stage}
      aria-hidden="true"
    >
      {/* 暖色环境氛围光晕 */}
      <div className="home-party-scene__glow" />

      {/* 绘本风落地灯与灯罩暖光 */}
      <div className="home-party-scene__lamp-wrap">
        <div className="home-party-scene__lamp-light" />
        <img
          src="/home-scene/lamp.png"
          alt=""
          className="home-party-scene__lamp-img"
          draggable={false}
        />
      </div>

      {/* 派对吊旗彩带 */}
      <span className="home-party-scene__garland home-party-scene__garland--one" />
      <span className="home-party-scene__garland home-party-scene__garland--two" />

      {/* 核心桌台与地毯大画幅 (z-index: 3) */}
      <div className="home-party-scene__table-wrap">
        <img
          src="/home-scene/table.png"
          alt=""
          className="home-party-scene__table-img"
          draggable={false}
        />
      </div>

      {/* 围坐的朋友人物图层：所有 12 位人物常驻挂载，处于当前人数内的平滑过渡到对应均分席位，多余人物优雅收敛隐匿 */}
      <div className="home-party-scene__people-layer">
        {CHARACTER_PROFILES.map((profile, index) => {
          const isSeatActive = index < visibleCount;
          const fallbackPos = { left: '50%', top: '48%', rotate: '0deg', zIndex: 1 };
          const seatPos = (isSeatActive && activeSeats && activeSeats[index])
            ? activeSeats[index]
            : fallbackPos;
          const isHovered = hoveredPerson === index;

          return (
            <div
              key={profile.id}
              className={`home-party-scene__character ${isSeatActive ? 'is-visible' : 'is-hidden'} ${isHovered ? 'is-hovered' : ''}`}
              style={{
                '--person-index': index,
                '--person-left': seatPos.left,
                '--person-top': seatPos.top,
                '--person-rotate': seatPos.rotate,
                '--person-z': seatPos.zIndex,
              } as CSSProperties}
              onMouseEnter={() => isSeatActive && setHoveredPerson(index)}
              onMouseLeave={() => setHoveredPerson(null)}
            >
              <img
                src={`/home-scene/person_${profile.id}.png`}
                alt={profile.name}
                className="home-party-scene__character-img"
                draggable={false}
              />
              {/* 悬浮气泡 */}
              <span className="home-party-scene__bubble" aria-hidden="true">
                {profile.name}
              </span>
            </div>
          );
        })}
      </div>

      {/* 治愈系绿植龟背竹盆栽 */}
      <div className="home-party-scene__plant-wrap">
        <img
          src="/home-scene/plant.png"
          alt=""
          className="home-party-scene__plant-img"
          draggable={false}
        />
      </div>

      {/* 漂浮的微光粒子 */}
      <span className="home-party-scene__spark home-party-scene__spark--one" aria-hidden="true">✦</span>
      <span className="home-party-scene__spark home-party-scene__spark--two" aria-hidden="true">✦</span>
      <span className="home-party-scene__spark home-party-scene__spark--three" aria-hidden="true">·</span>
    </div>
  );
}
