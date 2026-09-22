/**
 * 飞行预设：五种飞行"性格" + 真 3D 景深。共享版。
 *
 * 为什么是预设性格而不是物理模拟：飞行物必须在服务端给的阶段时长内准确落到
 * 目标位置，模拟求解落点既不稳也难压时长。这里改成每件随机抽一种预设轨迹，
 * 靠"性格各异 + 参数随机 + 同叠不连抽同种"来避免整叠齐刷刷的假象。
 *
 * 纸张 / 卡牌感的来源：
 * - 绕 X 轴翻面（翻到背面压暗、翻回正面高光扫过）与绕 Z 轴摇摆；
 * - 近大远小：以离桌高度映射 translateZ，由飞行层的 perspective 自然放大，
 *   不是假的 scale；
 * - 地面阴影单独一层留在桌面上，越高越淡越散。
 *
 * 本文件从 wits-wagers/stage/noteFlight.ts 上提。泛化改动只有命名：
 * note* → piece*（任何飞行物：钞票、牌、令牌、鹅卡），几何与关键帧逻辑未动。
 */

import type { Rect } from './flip.ts';

/** 飞行层的透视距离，必须与 .stage-flight-layer 的 perspective 一致 */
export const FLIGHT_PERSPECTIVE = 700;
/** 离桌高度 → translateZ 的换算；最高点约放大 1.4~1.5× */
const Z_PER_PX = 0.9;

export interface FlightPose {
  /** 屏幕坐标（左上角），已含落点错位与横向飘移 */
  readonly x: number;
  readonly y: number;
  /** 朝镜头的位移（px），由离桌高度换算 */
  readonly z: number;
  readonly rotX: number;
  readonly rotY: number;
  readonly rotZ: number;
  /** 归一化的离桌高度 0..1，用于阴影浓淡 */
  readonly lift: number;
  /** 阴影在桌面上的位置（左上角） */
  readonly shadowX: number;
  readonly shadowY: number;
  readonly offset: number;
}

interface StyleSample {
  /** 位移进度 0..1 */
  readonly move: number;
  /** 抬升，单位为 lift 的倍数 */
  readonly height: number;
  /** 朝镜头的高度，单位为 lift 的倍数 */
  readonly depth: number;
  /** 横向摆动（px） */
  readonly sway: number;
  readonly rotX: number;
  readonly rotY: number;
  readonly rotZ: number;
}

type Rand = (lo: number, hi: number) => number;
type StyleFn = (t: number) => StyleSample;

export interface FlightStyle {
  readonly name: string;
  /** 时长倍率：有的性格天生慢（羽落）有的快（滑翔） */
  readonly durationScale: number;
  readonly make: (r: Rand) => StyleFn;
}

/**
 * 五种飞行性格。每件飞行物随机抽一种，同一叠里混着飞才像自然散落。
 */
export const FLIGHT_STYLES: readonly FlightStyle[] = [
  {
    // 抛出去后像纸片一样翻着飘下来
    name: 'tumble',
    durationScale: 1,
    make(r) {
      const flips = r(1.0, 1.6) * (r(0, 1) < 0.5 ? 1 : -1);
      const ph = r(0, Math.PI * 2);
      const sway = r(10, 18);
      const yaw = r(14, 24);
      return (t) => {
        const settle = 1 - Math.pow(t, 4);
        return {
          move: t < 0.45 ? (t / 0.45) * 0.75 : 0.75 + 0.25 * (1 - Math.pow(1 - (t - 0.45) / 0.55, 2.2)),
          height: Math.sin(Math.PI * Math.pow(t, 0.8)) * (1 - t * 0.25),
          depth: Math.sin(Math.PI * t) * 0.9,
          sway: Math.sin(ph + t * Math.PI * 3) * sway * Math.sin(Math.PI * t),
          rotX: 360 * flips * t * settle,
          rotY: Math.sin(t * Math.PI) * 12 * settle,
          rotZ: Math.sin(ph + t * Math.PI * 2.5) * yaw * settle + 6 * t,
        };
      };
    },
  },
  {
    // 像树叶一样左右大幅荡着落下，翻转少、摆动多
    name: 'leaf',
    durationScale: 1.1,
    make(r) {
      const ph = r(0, Math.PI * 2);
      const sway = r(26, 40);
      const tilt = r(30, 45);
      const dir = r(0, 1) < 0.5 ? 1 : -1;
      const wobble = r(-25, 25);
      return (t) => {
        const settle = 1 - Math.pow(t, 3);
        const swing = Math.sin(ph + t * Math.PI * 4);
        return {
          move: t < 0.35 ? (t / 0.35) * 0.6 : 0.6 + 0.4 * (1 - Math.pow(1 - (t - 0.35) / 0.65, 2.6)),
          height: Math.sin(Math.PI * Math.pow(t, 0.7)) * (1 - t * 0.35),
          depth: Math.sin(Math.PI * t) * 0.6,
          sway: swing * sway * Math.sin(Math.PI * t) * dir,
          rotX: wobble * settle,
          rotY: -swing * tilt * settle,
          rotZ: swing * 10 * settle + 4 * t,
        };
      };
    },
  },
  {
    // 一路螺旋自转着飞过去，抛得最高，近大远小最明显
    name: 'spin',
    durationScale: 0.95,
    make(r) {
      const turns = r(1.5, 2.5) * (r(0, 1) < 0.5 ? 1 : -1);
      const ph = r(0, Math.PI * 2);
      const wobble = r(10, 16);
      return (t) => {
        const settle = 1 - Math.pow(t, 5);
        return {
          move: 1 - Math.pow(1 - t, 2.4),
          height: Math.sin(Math.PI * t) * 0.8,
          depth: Math.sin(Math.PI * t) * 1.2,
          sway: Math.sin(ph + t * Math.PI * 2) * 6,
          rotX: Math.sin(ph + t * Math.PI * 3) * wobble * settle,
          rotY: Math.sin(t * Math.PI) * 18 * settle,
          rotZ: 360 * turns * t * settle,
        };
      };
    },
  },
  {
    // 低平快，几乎不翻，像顺手推过去的一张，末了轻轻一挑
    name: 'glide',
    durationScale: 0.85,
    make(r) {
      const ph = r(0, Math.PI * 2);
      const lift = r(0.25, 0.4);
      const flick = r(18, 30) * (r(0, 1) < 0.5 ? 1 : -1);
      return (t) => {
        const settle = 1 - Math.pow(t, 6);
        return {
          move: t < 0.6 ? (t / 0.6) * 0.85 : 0.85 + 0.15 * (1 - Math.pow(1 - (t - 0.6) / 0.4, 2)),
          height: Math.sin(Math.PI * t) * lift,
          depth: Math.sin(Math.PI * t) * 0.35,
          sway: Math.sin(ph + t * Math.PI * 1.5) * 5,
          rotX: Math.sin(t * Math.PI) * 14 * settle,
          rotY: Math.sin(t * Math.PI * 2) * 10 * settle,
          rotZ: Math.sin(Math.PI * Math.pow(t, 1.6)) * flick * settle + 3 * t,
        };
      };
    },
  },
  {
    // 抛高后先悬一下再像羽毛似的慢慢晃下来，最慢最轻
    name: 'float',
    durationScale: 1.25,
    make(r) {
      const ph = r(0, Math.PI * 2);
      const sway = r(16, 26);
      const turns = r(0.5, 0.9) * (r(0, 1) < 0.5 ? 1 : -1);
      return (t) => {
        const settle = 1 - Math.pow(t, 3);
        const fall = t < 0.3 ? 0 : (t - 0.3) / 0.7;
        const rise = Math.sin((Math.PI * t) / 0.6);
        return {
          move: t < 0.3 ? (t / 0.3) * 0.55 : 0.55 + 0.45 * (1 - Math.pow(1 - fall, 3)),
          height: t < 0.3 ? rise : 1 - Math.pow(fall, 1.6),
          depth: (t < 0.3 ? rise : 1 - Math.pow(fall, 1.4)) * 1.0,
          sway: Math.sin(ph + fall * Math.PI * 3.5) * sway * Math.sin(Math.PI * Math.min(1, t * 1.2)),
          rotX: 360 * turns * t * settle,
          rotY: Math.sin(ph + fall * Math.PI * 3) * 28 * settle,
          rotZ: Math.cos(ph + fall * Math.PI * 2) * 14 * settle,
        };
      };
    },
  },
];

/**
 * 给一叠飞行物分配飞行性格：同一叠里不连续抽到同一种，
 * 否则相邻两件的轨迹几乎重合，一眼就看出是复制的。
 */
export function pickFlightStyles(count: number, random: () => number = Math.random): FlightStyle[] {
  const out: FlightStyle[] = [];
  let last = -1;
  for (let i = 0; i < count; i += 1) {
    let k = Math.floor(random() * FLIGHT_STYLES.length);
    if (k === last && FLIGHT_STYLES.length > 1) {
      k = (k + 1 + Math.floor(random() * (FLIGHT_STYLES.length - 1))) % FLIGHT_STYLES.length;
    }
    out.push(FLIGHT_STYLES[k]!);
    last = k;
  }
  return out;
}

export interface BuildPosesOptions {
  readonly from: Rect;
  readonly to: Rect;
  readonly style: FlightStyle;
  /** 叠内序号，决定落点错位 */
  readonly index: number;
  /** 抛物线拱高基准（px） */
  readonly arc: number;
  readonly pieceWidth: number;
  readonly pieceHeight: number;
  /** 采样点数：36 帧足够平滑，又不会让关键帧数组过大 */
  readonly steps?: number;
  readonly random?: () => number;
}

/**
 * 按性格把一件飞行物的整条轨迹采成关键帧姿态。
 *
 * 起终点都用屏幕坐标（getBoundingClientRect 的投影），所以飞行层必须在
 * 3D 变换祖先之外——否则 fixed 定位会退化，落点全错。
 */
export function buildFlightPoses(options: BuildPosesOptions): FlightPose[] {
  const {
    from,
    to,
    style,
    index,
    arc,
    pieceWidth,
    pieceHeight,
    steps = 36,
    random = Math.random,
  } = options;

  const r: Rand = (lo, hi) => lo + random() * (hi - lo);
  const sample = style.make(r);

  const ax = from.x + from.width / 2;
  const ay = from.y + from.height / 2;
  const bx = to.x + to.width / 2;
  const by = to.y + to.height / 2;
  const dx = bx - ax;
  const dy = by - ay;
  const dist = Math.hypot(dx, dy);

  // 落点错位：同叠的飞行物不落在同一点，堆成一小摞。
  // 错位序列以 0 开头（0, +5, -5, …），这样单件飞行落点正中目标，
  // 不会因为"叠内第一件"就先偏出去 5px。
  const ox = (((index + 1) % 3) - 1) * 5;
  const oy = -index * 2.5;
  // 抛得越远抬得越高
  const lift = arc * r(0.85, 1.15) + dist * 0.08;

  const poses: FlightPose[] = [];
  for (let s = 0; s <= steps; s += 1) {
    const t = s / steps;
    const p = sample(t);
    const height = p.height * lift;
    const x = ax + dx * p.move - pieceWidth / 2 + ox * t + p.sway;
    const y = ay + dy * p.move - pieceHeight / 2 + oy * t - height;
    const z = Math.max(0, p.depth) * lift * Z_PER_PX;

    poses.push({
      x,
      y,
      z,
      rotX: p.rotX,
      rotY: p.rotY,
      rotZ: p.rotZ,
      lift: Math.min(1, Math.max(0, p.height)),
      // 阴影留在桌面：只跟平面位移与部分飘移，不跟抬升
      shadowX: ax + dx * p.move - pieceWidth / 2 + ox * t + p.sway * 0.6,
      shadowY: ay + dy * p.move - pieceHeight * 0.4 + oy * t + 6,
      offset: t,
    });
  }

  // 末帧钉死到目标，避免累积误差让飞行物停在半空
  const last = poses[poses.length - 1]!;
  poses[poses.length - 1] = {
    ...last,
    x: bx - pieceWidth / 2 + ox,
    y: by - pieceHeight / 2 + oy,
    z: 0,
    rotX: 0,
    rotY: 0,
    rotZ: 0,
    lift: 0,
  };

  return poses;
}

/** 姿态序列 → 飞行物本体的 WAAPI 关键帧。 */
export function poseKeyframes(poses: readonly FlightPose[]): Keyframe[] {
  return poses.map((p) => ({
    transform:
      `translate3d(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px, ${p.z.toFixed(1)}px) ` +
      `rotateX(${p.rotX.toFixed(1)}deg) rotateY(${p.rotY.toFixed(1)}deg) rotateZ(${p.rotZ.toFixed(1)}deg)`,
    opacity: p.offset < 0.04 ? 0.5 : 1,
    offset: p.offset,
  }));
}

/** 背面压暗：飞行物翻过去的时候不该还是正面那么亮。 */
export function shadeKeyframes(poses: readonly FlightPose[]): Keyframe[] {
  return poses.map((p) => {
    const facing = Math.cos((p.rotX * Math.PI) / 180) * Math.cos((p.rotY * Math.PI) / 180);
    return { opacity: facing < 0 ? 0.45 : 0, offset: p.offset };
  });
}

/** 高光：翻转到接近侧面时一道光扫过。 */
export function sheenKeyframes(poses: readonly FlightPose[]): Keyframe[] {
  return poses.map((p) => {
    const rx = (p.rotX * Math.PI) / 180;
    const ry = (p.rotY * Math.PI) / 180;
    const facing = Math.cos(rx) * Math.cos(ry);
    const edgeOn = Math.min(1, Math.abs(Math.sin(rx)) + Math.abs(Math.sin(ry)) * 0.6);
    return { opacity: Math.max(0, facing) * edgeOn * 0.9, offset: p.offset };
  });
}

/** 地面阴影：越高越淡越散。 */
export function shadowKeyframes(poses: readonly FlightPose[]): Keyframe[] {
  return poses.map((p) => ({
    transform: `translate(${p.shadowX.toFixed(1)}px, ${p.shadowY.toFixed(1)}px) scale(${(1 + p.lift * 0.9).toFixed(2)})`,
    opacity: 0.55 * (1 - p.lift * 0.85),
    offset: p.offset,
  }));
}

/**
 * 一叠飞行物的错峰间隔。
 *
 * 件数越多间隔越小，保证整叠仍在预算内飞完；但不能压到 0，
 * 否则所有件同时起飞，又变回"一块板"了。
 */
export function flightStagger(budgetMs: number, durationMs: number, count: number): number {
  if (count <= 1) return 0;
  return Math.min(70, Math.max(18, (budgetMs - durationMs) / (count - 1)));
}
