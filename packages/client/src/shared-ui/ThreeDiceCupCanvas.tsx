import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { useMotion } from '../motion/MotionContext.tsx';
import type { MotionLevel } from '../motion/motionPolicy.ts';
import { webAudio } from './WebAudioManager.ts';
import { createDiceCupShellGeometry } from './diceCupGeometry.ts';

export type ThreeDiceCupTheme = 'wood' | 'felt' | 'metal';

export interface ThreeDiceCupCanvasProps {
  /** 骰子点数数组（1~6） */
  diceValues?: number[];
  /** 是否掀开 */
  isLifted: boolean;
  /** 是否正在摇骰 */
  isShaking: boolean;
  /** 材质主题 */
  theme?: ThreeDiceCupTheme;
  /** 尺寸变体 */
  variant?: 'large' | 'compact';
  /** 容器类名 */
  className?: string;
}

export interface DiceCupMotionProfile {
  motionScale: number;
  settleDuration: number;
  pixelRatioCap: number;
  shadowMapSize: number;
  shadowsEnabled: boolean;
  knockAudioEnabled: boolean;
}

export function resolveDiceCupMotionProfile(
  level: MotionLevel,
  variant: 'large' | 'compact',
): DiceCupMotionProfile {
  const compact = variant === 'compact';
  switch (level) {
    case 'off':
      return {
        motionScale: 0,
        settleDuration: 0.08,
        pixelRatioCap: 1,
        shadowMapSize: compact ? 256 : 512,
        shadowsEnabled: false,
        knockAudioEnabled: false,
      };
    case 'minimal':
      return {
        motionScale: 0.25,
        settleDuration: SETTLE_DURATION * 0.45,
        pixelRatioCap: 1,
        shadowMapSize: compact ? 256 : 512,
        shadowsEnabled: false,
        knockAudioEnabled: false,
      };
    case 'reduced':
      return {
        motionScale: 0.55,
        settleDuration: SETTLE_DURATION * 0.7,
        pixelRatioCap: compact ? 1.25 : 1.5,
        shadowMapSize: compact ? 512 : 1024,
        shadowsEnabled: true,
        knockAudioEnabled: true,
      };
    case 'full':
    default:
      return {
        motionScale: 1,
        settleDuration: SETTLE_DURATION,
        pixelRatioCap: compact ? 1.5 : 2,
        shadowMapSize: compact ? 1024 : 2048,
        shadowsEnabled: true,
        knockAudioEnabled: true,
      };
  }
}

export function shouldRunDiceCupFrame(
  pageVisible: boolean,
  elementVisible: boolean,
  animationActive: boolean,
): boolean {
  return pageVisible && elementVisible && animationActive;
}

/* ══════════════════════ 朝向数学（纯函数，可单测） ══════════════════════ */

/**
 * BoxGeometry 材质槽位为 [+X, -X, +Y, -Y, +Z, -Z]，对应点数 [1, 6, 2, 5, 3, 4]。
 */
export const DIE_FACE_NORMALS: Record<number, readonly [number, number, number]> = {
  1: [1, 0, 0],
  6: [-1, 0, 0],
  2: [0, 1, 0],
  5: [0, -1, 0],
  3: [0, 0, 1],
  4: [0, 0, -1],
};

/** 将目标点数面旋转到 +Y（朝上）的基础欧拉角（修正旧版 1↔6、3↔4 互换的镜像错误） */
const FACE_UP_EULERS: Record<number, THREE.Euler> = {
  1: new THREE.Euler(0, 0, Math.PI / 2), // +X -> +Y
  2: new THREE.Euler(0, 0, 0),
  3: new THREE.Euler(-Math.PI / 2, 0, 0), // +Z -> +Y
  4: new THREE.Euler(Math.PI / 2, 0, 0), // -Z -> +Y
  5: new THREE.Euler(Math.PI, 0, 0), // -Y -> +Y
  6: new THREE.Euler(0, 0, -Math.PI / 2), // -X -> +Y
};

/**
 * 落定四元数：使 value 面朝 +Y，并附加绕世界 Y 轴的自然偏转（不影响顶面）。
 */
export function settleQuaternion(value: number, yJitter = 0): THREE.Quaternion {
  const euler = FACE_UP_EULERS[value] ?? FACE_UP_EULERS[2] ?? new THREE.Euler();
  const q = new THREE.Quaternion().setFromEuler(euler);
  if (yJitter !== 0) {
    q.premultiply(
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yJitter)
    );
  }
  return q;
}

/* ══════════════════════ 缓动函数 ══════════════════════ */

function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  const x = t - 1;
  return 1 + c3 * x * x * x + c1 * x * x;
}

function easeOutBounce(t: number): number {
  const n1 = 7.5625;
  const d1 = 2.75;
  if (t < 1 / d1) return n1 * t * t;
  if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
  if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
  return n1 * (t -= 2.625 / d1) * t + 0.984375;
}

/* ══════════════════════ 程序化贴图 ══════════════════════ */

/**
 * 动态生成单个骰子面的 Canvas 贴图
 * 国标中式红 1 点、红 4 点，深青墨 2/3/5/6 点，内凹阴影与高光珠光质感
 */
function createDiceFaceTexture(value: number, size: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const s = size / 256;

  // 1. 象牙白温润微渐变底色
  const bgGrad = ctx.createRadialGradient(
    size / 2, size / 2, 18 * s,
    size / 2, size / 2, size * 0.75
  );
  bgGrad.addColorStop(0, '#ffffff');
  bgGrad.addColorStop(0.7, '#faf7f2');
  bgGrad.addColorStop(1, '#eee6da');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, size, size);

  // 2. 边缘象牙微圆润暗角
  ctx.lineWidth = 10 * s;
  ctx.strokeStyle = 'rgba(215, 200, 180, 0.45)';
  ctx.strokeRect(5 * s, 5 * s, size - 10 * s, size - 10 * s);

  // 3. 点位坐标与立体阴刻色彩
  const isRed = value === 1 || value === 4;
  const dotColor = isRed ? '#dc2626' : '#0f172a';
  const dotGlow = isRed ? '#ef4444' : '#334155';
  const dotDeep = isRed ? '#7f1d1d' : '#020617';

  const drawDot = (xPct: number, yPct: number, radius: number) => {
    const x = (xPct / 100) * size;
    const y = (yPct / 100) * size;

    // 内凹立体阴刻阴影
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    const grad = ctx.createRadialGradient(
      x - radius * 0.35, y - radius * 0.35, 1,
      x, y, radius
    );
    grad.addColorStop(0, dotGlow);
    grad.addColorStop(0.75, dotColor);
    grad.addColorStop(1, dotDeep);
    ctx.fillStyle = grad;
    ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
    ctx.shadowBlur = 7 * s;
    ctx.shadowOffsetX = 1.2 * s;
    ctx.shadowOffsetY = 2.2 * s;
    ctx.fill();

    // 烤漆高光球
    ctx.beginPath();
    ctx.arc(x - radius * 0.36, y - radius * 0.36, radius * 0.24, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.shadowColor = 'transparent';
    ctx.fill();
    ctx.restore();
  };

  const bigR = 38 * s;
  const normalR = 23 * s;

  if (value === 1) {
    drawDot(50, 50, bigR);
  } else if (value === 2) {
    drawDot(28, 28, normalR);
    drawDot(72, 72, normalR);
  } else if (value === 3) {
    drawDot(28, 28, normalR);
    drawDot(50, 50, normalR);
    drawDot(72, 72, normalR);
  } else if (value === 4) {
    drawDot(30, 30, normalR);
    drawDot(70, 30, normalR);
    drawDot(30, 70, normalR);
    drawDot(70, 70, normalR);
  } else if (value === 5) {
    drawDot(28, 28, normalR);
    drawDot(72, 28, normalR);
    drawDot(50, 50, normalR);
    drawDot(28, 72, normalR);
    drawDot(72, 72, normalR);
  } else if (value === 6) {
    drawDot(30, 24, normalR * 0.95);
    drawDot(30, 50, normalR * 0.95);
    drawDot(30, 76, normalR * 0.95);
    drawDot(70, 24, normalR * 0.95);
    drawDot(70, 50, normalR * 0.95);
    drawDot(70, 76, normalR * 0.95);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

interface ThemedTextures {
  cupMap: THREE.CanvasTexture;
  matMap: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture | null;
  roughnessMap: THREE.CanvasTexture | null;
}

/** 在 canvas 上撒细密噪点 */
function sprayNoise(
  ctx: CanvasRenderingContext2D,
  size: number,
  count: number,
  alpha: number
): void {
  for (let i = 0; i < count; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const lum = Math.random() > 0.5 ? 255 : 0;
    ctx.fillStyle = `rgba(${lum},${lum},${lum},${alpha * Math.random()})`;
    ctx.fillRect(x, y, 1.5, 1.5);
  }
}

/**
 * 主题化程序化贴图：杯体 map / 底盘毡面 map / 木质或金属 bumpMap 与 roughnessMap。
 */
function createThemedTextures(theme: ThreeDiceCupTheme, size: number): ThemedTextures {
  // ── 杯体贴图 ──
  const cupCanvas = document.createElement('canvas');
  cupCanvas.width = cupCanvas.height = size;
  const cc = cupCanvas.getContext('2d')!;

  let bumpMap: THREE.CanvasTexture | null = null;
  let roughnessMap: THREE.CanvasTexture | null = null;

  if (theme === 'wood') {
    // 暖色黑胡桃木/花梨木：温润底色 + 真实自然年轮流动 + 导管微孔
    const base = cc.createLinearGradient(0, 0, size, 0);
    base.addColorStop(0, '#5a2b16');
    base.addColorStop(0.28, '#70371d');
    base.addColorStop(0.55, '#5d2c16');
    base.addColorStop(0.82, '#763b20');
    base.addColorStop(1, '#4a2211');
    cc.fillStyle = base;
    cc.fillRect(0, 0, size, size);

    const bCanvas = document.createElement('canvas');
    bCanvas.width = bCanvas.height = size;
    const bc = bCanvas.getContext('2d')!;
    bc.fillStyle = '#808080';
    bc.fillRect(0, 0, size, size);

    const rCanvas = document.createElement('canvas');
    rCanvas.width = rCanvas.height = size;
    const rc = rCanvas.getContext('2d')!;
    rc.fillStyle = '#555555';
    rc.fillRect(0, 0, size, size);

    for (let x = 0; x < size; x += 2) {
      const wave1 = Math.sin(x * 0.016) * 14;
      const wave2 = Math.sin(x * 0.045 + 1.2) * 6;
      const intensity = Math.abs(Math.sin(x * 0.03 + wave1 * 0.12)) * 0.14 + 0.025;

      cc.strokeStyle = `rgba(35, 14, 5, ${intensity})`;
      cc.lineWidth = x % 6 === 0 ? 2.5 : 1;
      cc.beginPath();
      cc.moveTo(x + wave1, 0);
      for (let y = 0; y <= size; y += 14) {
        const wobble = Math.sin(y * 0.014 + x * 0.018) * 4.5;
        cc.lineTo(x + wave1 + wave2 + wobble, y);
      }
      cc.stroke();

      // 金棕高光年轮微纹
      if (x % 14 === 0) {
        cc.strokeStyle = `rgba(230, 160, 110, ${intensity * 0.22})`;
        cc.lineWidth = 1;
        cc.beginPath();
        cc.moveTo(x + wave1 + 1, 0);
        for (let y = 0; y <= size; y += 14) {
          const wobble = Math.sin(y * 0.014 + x * 0.018) * 4.5;
          cc.lineTo(x + wave1 + wave2 + wobble + 1, y);
        }
        cc.stroke();
      }

      bc.strokeStyle = `rgba(0, 0, 0, ${intensity * 0.6})`;
      bc.lineWidth = 1;
      bc.beginPath();
      for (let y = 0; y <= size; y += 14) {
        const gx = x + wave1 + wave2 + Math.sin(y * 0.014 + x * 0.018) * 4.5;
        if (y === 0) bc.moveTo(gx, y); else bc.lineTo(gx, y);
      }
      bc.stroke();
    }

    // 导管微孔噪点（Wood pores）
    for (let i = 0; i < size * 4; i++) {
      const px = Math.random() * size;
      const py = Math.random() * size;
      const len = 3 + Math.random() * 8;
      cc.fillStyle = 'rgba(25, 10, 3, 0.16)';
      cc.fillRect(px, py, 1.2, len);
      bc.fillStyle = 'rgba(40, 40, 40, 0.5)';
      bc.fillRect(px, py, 1.2, len);
      rc.fillStyle = 'rgba(170, 170, 170, 0.3)';
      rc.fillRect(px, py, 1.2, len);
    }

    bumpMap = new THREE.CanvasTexture(bCanvas);
    roughnessMap = new THREE.CanvasTexture(rCanvas);
  } else if (theme === 'metal') {
    // 深灰金属基底 + 竖向微渐变（拉丝交给 roughnessMap）
    const grad = cc.createLinearGradient(0, 0, size, 0);
    grad.addColorStop(0, '#475569');
    grad.addColorStop(0.5, '#5b6b81');
    grad.addColorStop(1, '#3e4b5e');
    cc.fillStyle = grad;
    cc.fillRect(0, 0, size, size);
    sprayNoise(cc, size, size * 2, 0.04);

    const rc = document.createElement('canvas');
    rc.width = rc.height = size;
    const r2 = rc.getContext('2d')!;
    r2.fillStyle = '#4d4d4d';
    r2.fillRect(0, 0, size, size);
    for (let y = 0; y < size; y += 1) {
      const lum = 60 + Math.floor(Math.random() * 70);
      r2.fillStyle = `rgb(${lum},${lum},${lum})`;
      r2.fillRect(0, y, size, 1);
    }
    roughnessMap = new THREE.CanvasTexture(rc);
  } else {
    // felt 绒布：深绛红高频织物噪点
    cc.fillStyle = '#7c1d43';
    cc.fillRect(0, 0, size, size);
    sprayNoise(cc, size, size * 10, 0.08);
    sprayNoise(cc, size, size * 6, 0.06);
  }
  const cupMap = new THREE.CanvasTexture(cupCanvas);
  cupMap.colorSpace = THREE.SRGBColorSpace;

  // ── 底盘毡面（灰度噪声，由材质 color 上色） ──
  const matCanvas = document.createElement('canvas');
  matCanvas.width = matCanvas.height = size;
  const mc = matCanvas.getContext('2d')!;
  mc.fillStyle = '#e8e8e8';
  mc.fillRect(0, 0, size, size);
  sprayNoise(mc, size, size * 14, 0.1);
  sprayNoise(mc, size, size * 8, 0.07);
  const matMap = new THREE.CanvasTexture(matCanvas);
  matMap.colorSpace = THREE.SRGBColorSpace;

  return { cupMap, matMap, bumpMap, roughnessMap };
}

/* ══════════════════════ 布局 ══════════════════════ */

/** 多粒骰子在底座上的排布（返回 [x, z] 坐标） */
function layoutPositionsFor(count: number): Array<readonly [number, number]> {
  switch (count) {
    case 1: return [[0, 0]];
    case 2: return [[-0.5, 0], [0.5, 0]];
    case 3: return [[0, -0.5], [-0.55, 0.45], [0.55, 0.45]];
    case 4: return [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]];
    case 5: return [[-0.55, -0.55], [0.55, -0.55], [0, 0], [-0.55, 0.55], [0.55, 0.55]];
    default: return [[-0.55, -0.62], [0.55, -0.62], [-0.55, 0], [0.55, 0], [-0.55, 0.62], [0.55, 0.62]];
  }
}

function dieSizeFor(count: number): number {
  if (count === 1) return 1.12;
  if (count <= 3) return 0.78;
  if (count <= 5) return 0.64;
  return 0.56;
}

/* ══════════════════════ 主组件 ══════════════════════ */

interface DieState {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  angVel: THREE.Vector3;
  value: number;
  targetX: number;
  targetZ: number;
  settle: null | {
    fromQuat: THREE.Quaternion;
    toQuat: THREE.Quaternion;
    fromY: number;
    t: number;
    duration: number;
  };
}

// 掀盖 = 升起并挪向后侧（配合相机微距推进，完全让出顶视线）
const CUP_LIFT_Y = 3.8;
const CUP_LIFT_X = 1.8;
const CUP_LIFT_Z = -3.0;
const CUP_LIFT_TILT = -0.32;
const CUP_LIFT_LEAN = 0.38;
const GRAVITY = 26;
const SETTLE_DURATION = 0.5;
const KNOCK_MIN_INTERVAL_MS = 60;

const DEFAULT_CAM_POS = new THREE.Vector3(0, 5.4, 8.4);
const DEFAULT_LOOK_AT = new THREE.Vector3(0, 0.6, 0);

function getZoomCameraTarget(count: number, isCompact: boolean): {
  pos: THREE.Vector3;
  lookAt: THREE.Vector3;
  fov: number;
} {
  if (count <= 1) {
    return {
      pos: new THREE.Vector3(0, isCompact ? 3.0 : 2.7, 0.38),
      lookAt: new THREE.Vector3(0, 0.45, 0),
      fov: isCompact ? 42 : 38,
    };
  }
  if (count <= 3) {
    return {
      pos: new THREE.Vector3(0, isCompact ? 3.4 : 3.15, 0.44),
      lookAt: new THREE.Vector3(0, 0.44, 0),
      fov: isCompact ? 44 : 40,
    };
  }
  return {
    pos: new THREE.Vector3(0, isCompact ? 4.0 : 3.65, 0.52),
    lookAt: new THREE.Vector3(0, 0.42, 0),
    fov: isCompact ? 46 : 42,
  };
}

export function ThreeDiceCupCanvas({
  diceValues = [4],
  isLifted,
  isShaking,
  theme = 'wood',
  variant = 'large',
  className = '',
}: ThreeDiceCupCanvasProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const { level: motionLevel } = useMotion();
  const diceValuesKey = diceValues.join(',');

  // 动态状态经 ref 传入渲染帧，避免场景重建
  const stateRef = useRef({ isLifted, isShaking, theme, diceValues, variant, motionLevel });
  stateRef.current = { isLifted, isShaking, theme, diceValues, variant, motionLevel };

  // 仅在交互状态变化时唤醒按需渲染循环
  const wakeRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    wakeRef.current?.();
  }, [diceValuesKey, isLifted, isShaking, motionLevel]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const isCompact = variant === 'compact';
    const width = isCompact ? 140 : 240;
    const height = isCompact ? 150 : 250;
    const texSize = isCompact ? 256 : 512;
    const motionProfile = resolveDiceCupMotionProfile(motionLevel, variant);
    const {
      motionScale,
      settleDuration,
      pixelRatioCap,
      shadowMapSize,
      shadowsEnabled,
      knockAudioEnabled,
    } = motionProfile;

    // ── 资源统一登记释放 ──
    const disposables: Array<{ dispose(): void }> = [];
    const track = <T extends { dispose(): void }>(res: T): T => {
      disposables.push(res);
      return res;
    };

    // 1. Scene & Camera
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100);
    camera.position.copy(DEFAULT_CAM_POS);
    camera.lookAt(DEFAULT_LOOK_AT);

    // 2. WebGL Renderer
    const renderer = track(
      new THREE.WebGLRenderer({
        antialias: motionLevel === 'full' || motionLevel === 'reduced',
        alpha: true,
        powerPreference: 'default',
      })
    );
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, pixelRatioCap));
    renderer.shadowMap.enabled = shadowsEnabled;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    container.appendChild(renderer.domElement);

    // 3. Lighting
    scene.add(new THREE.HemisphereLight(0xfff3df, 0x26313c, 1.4));

    const mainLight = new THREE.DirectionalLight(0xfff4df, 2.15);
    mainLight.position.set(3.8, 9, 4.2);
    mainLight.castShadow = shadowsEnabled;
    mainLight.shadow.mapSize.set(shadowMapSize, shadowMapSize);
    const shadowCam = mainLight.shadow.camera as THREE.OrthographicCamera;
    shadowCam.left = -4;
    shadowCam.right = 4;
    shadowCam.top = 4;
    shadowCam.bottom = -4;
    shadowCam.near = 2;
    shadowCam.far = 20;
    mainLight.shadow.bias = -0.0003;
    mainLight.shadow.normalBias = 0.025;
    mainLight.shadow.radius = 3;
    scene.add(mainLight);

    const softFill = new THREE.DirectionalLight(0xffedd5, 0.7);
    softFill.position.set(0, 8, -4);
    scene.add(softFill);

    const fillLight = new THREE.DirectionalLight(0x93c5fd, 0.8);
    fillLight.position.set(-5, 6, -3);
    scene.add(fillLight);

    const rimLight = new THREE.PointLight(0xfef08a, 1.4, 12);
    rimLight.position.set(0, 6, 2.5);
    scene.add(rimLight);

    // 4. 环境反射
    {
      const pmrem = track(new THREE.PMREMGenerator(renderer));
      const envScene = new THREE.Scene();
      const panel = (
        w: number, h: number, color: number, intensity: number,
        x: number, y: number, z: number
      ) => {
        const mat = track(new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
        mat.color.set(color).multiplyScalar(intensity);
        const geo = track(new THREE.PlaneGeometry(w, h));
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(x, y, z);
        mesh.lookAt(0, 0, 0);
        envScene.add(mesh);
      };
      panel(7, 3, 0xfff2df, 3.2, 0, 6, 2);
      panel(5, 2, 0xdceaff, 1.8, -5, 2, -3);
      panel(4, 3, 0xffe9b8, 1.5, 5, 1, -4);
      const envRT = track(pmrem.fromScene(envScene, 0.04));
      scene.environment = envRT.texture;
    }

    // 5. Table Mat & Rim Base（天鹅绒底盘 + 主题毡面 + 木质托盘外框）
    const themed = createThemedTextures(theme, texSize);
    track(themed.cupMap);
    track(themed.matMap);
    if (themed.bumpMap) track(themed.bumpMap);
    if (themed.roughnessMap) track(themed.roughnessMap);

    const baseGroup = new THREE.Group();
    scene.add(baseGroup);

    const matColor = theme === 'felt' ? 0x700c36 : theme === 'metal' ? 0x1e293b : 0x0f3822;
    const matGeo = track(new THREE.CylinderGeometry(2.1, 2.1, 0.12, 48));
    const matMat = track(
      new THREE.MeshStandardMaterial({
        color: matColor,
        map: themed.matMap,
        roughness: 0.9,
        metalness: 0.02,
      })
    );
    const matMesh = new THREE.Mesh(matGeo, matMat);
    matMesh.position.y = -0.06;
    matMesh.receiveShadow = true;
    baseGroup.add(matMesh);

    const rimWoodColor = theme === 'felt' ? 0x4a0422 : theme === 'metal' ? 0x334155 : 0x2e1408;
    const rimGeo = track(new THREE.TorusGeometry(2.12, 0.12, 16, 48));
    const rimMat = track(
      new THREE.MeshStandardMaterial({
        color: rimWoodColor,
        roughness: 0.38,
        metalness: 0.18,
      })
    );
    const rimMesh = new THREE.Mesh(rimGeo, rimMat);
    rimMesh.rotation.x = Math.PI / 2;
    rimMesh.position.y = 0.02;
    rimMesh.receiveShadow = true;
    baseGroup.add(rimMesh);

    // 6. Dice（RoundedBoxGeometry 象牙圆角骰子，支持动态增减与点数自适应）
    const maxAnisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    const faceTextures = [1, 2, 3, 4, 5, 6].map((num) => {
      const tex = track(createDiceFaceTexture(num, texSize));
      tex.anisotropy = maxAnisotropy;
      return tex;
    });
    const diceMaterials = [
      faceTextures[0], faceTextures[5], faceTextures[1],
      faceTextures[4], faceTextures[2], faceTextures[3],
    ].map(
      (map) =>
        track(
          new THREE.MeshPhysicalMaterial({
            map,
            roughness: 0.16,
            metalness: 0.01,
            clearcoat: 0.85,
            clearcoatRoughness: 0.18,
          })
        )
    );

    const dieGeo = track(new RoundedBoxGeometry(1, 1, 1, 6, 0.12));
    const diceGroup = new THREE.Group();
    scene.add(diceGroup);

    const dice: DieState[] = [];
    let dieSize = 0.76;
    let lastValuesKey = '';
    let wasShaking = false;
    let lastKnockAt = 0;

    const playKnock = (intensity: number) => {
      if (!knockAudioEnabled) return;
      const now = performance.now();
      if (now - lastKnockAt < KNOCK_MIN_INTERVAL_MS) return;
      lastKnockAt = now;
      webAudio.playDiceKnock(intensity);
    };

    const startSettle = (d: DieState) => {
      d.settle = {
        fromQuat: d.mesh.quaternion.clone(),
        toQuat: settleQuaternion(d.value, (Math.random() - 0.5) * 0.35),
        fromY: d.mesh.position.y,
        t: 0,
        duration: settleDuration,
      };
      d.vel.set(0, 0, 0);
      d.angVel.set(0, 0, 0);
    };

    /** 同步骰子数量/点数/尺寸/布局目标；immediate 时直接就位（初始挂载） */
    const syncDice = (values: number[], immediate: boolean) => {
      const vals = values.length > 0 ? values : [4];
      while (dice.length > vals.length) {
        const d = dice.pop()!;
        diceGroup.remove(d.mesh);
      }
      while (dice.length < vals.length) {
        const mesh = new THREE.Mesh(dieGeo, diceMaterials);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        diceGroup.add(mesh);
        dice.push({
          mesh,
          vel: new THREE.Vector3(),
          angVel: new THREE.Vector3(),
          value: 2,
          targetX: 0,
          targetZ: 0,
          settle: null,
        });
      }
      dieSize = dieSizeFor(vals.length);
      const layout = layoutPositionsFor(vals.length);
      vals.forEach((val, idx) => {
        const d = dice[idx];
        if (!d) return;
        d.value = val;
        const pos = layout[idx] ?? [0, 0];
        d.targetX = pos[0];
        d.targetZ = pos[1];
        d.mesh.scale.setScalar(dieSize);
        if (immediate) {
          d.mesh.position.set(pos[0], dieSize / 2, pos[1]);
          d.mesh.quaternion.copy(settleQuaternion(val, (Math.random() - 0.5) * 0.35));
          d.settle = null;
        } else {
          startSettle(d);
        }
      });
    };

    // 初始挂载：直接就位
    const initialValues = stateRef.current.diceValues;
    syncDice(initialValues, true);
    lastValuesKey = initialValues.join(',');

    // 7. 3D Cup（S型流线收腰钟形杯壁 + 鎏金环圈 + 宝珠顶钮）
    const cupGroup = new THREE.Group();
    scene.add(cupGroup);

    const cupBodyMat = track(
      new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        map: themed.cupMap,
        ...(themed.bumpMap ? { bumpMap: themed.bumpMap, bumpScale: 0.015 } : {}),
        ...(themed.roughnessMap ? { roughnessMap: themed.roughnessMap } : {}),
        metalness: theme === 'metal' ? 0.78 : 0,
        roughness: theme === 'metal' ? 0.42 : theme === 'felt' ? 0.88 : 0.58,
        clearcoat: theme === 'wood' ? 0.32 : 0.08,
        clearcoatRoughness: 0.3,
        side: THREE.DoubleSide,
      })
    );

    const goldMat = track(
      new THREE.MeshPhysicalMaterial({
        color: theme === 'metal' ? 0xc3ced6 : 0xc59b53,
        metalness: 0.86,
        roughness: 0.3,
        clearcoat: 0.2,
        clearcoatRoughness: 0.28,
      })
    );

    const cupBodyGeo = track(createDiceCupShellGeometry());
    const cupBodyMesh = new THREE.Mesh(cupBodyGeo, cupBodyMat);
    cupBodyMesh.castShadow = true;
    cupBodyMesh.receiveShadow = true;
    cupGroup.add(cupBodyMesh);

    const ring = (radius: number, tube: number, y: number, material: THREE.Material = goldMat) => {
      const mesh = new THREE.Mesh(track(new THREE.TorusGeometry(radius, tube, 10, 80)), material);
      mesh.rotation.x = Math.PI / 2;
      mesh.position.y = y;
      mesh.castShadow = true;
      cupGroup.add(mesh);
    };
    // Fine brass inlay follows the turned profile, rather than a thick floating belt.
    ring(1.818, 0.036, 0.10);
    ring(1.79, 0.019, 0.245);
    ring(1.497, 0.022, 1.23);
    ring(1.478, 0.015, 1.29);
    ring(1.25, 0.032, 2.405);
    ring(1.10, 0.018, 2.50);

    // Low turned finial with a wooden crown and restrained brass collar.
    const knobProfile = [[0, 2.535], [0.31, 2.535], [0.34, 2.57],
      [0.30, 2.62], [0.18, 2.67], [0.18, 2.72], [0.25, 2.76],
      [0.29, 2.82], [0.275, 2.90], [0.22, 2.96], [0.12, 3.005], [0, 3.02]];
    const knobGeo = track(new THREE.LatheGeometry(knobProfile.map(([r, y]) => new THREE.Vector2(r, y)), 48));
    const knobMesh = new THREE.Mesh(knobGeo, cupBodyMat);
    knobMesh.castShadow = true;
    cupGroup.add(knobMesh);
    ring(0.315, 0.018, 2.57);
    ring(0.18, 0.016, 2.695);

    // Matching inlay in the tray makes the two pieces read as one crafted set.
    const trayInlay = new THREE.Mesh(track(new THREE.TorusGeometry(2.12, 0.022, 8, 80)), goldMat);
    trayInlay.rotation.x = Math.PI / 2;
    trayInlay.position.y = 0.13;
    baseGroup.add(trayInlay);

    // 8. 动画与物理循环（按需渲染 + 电影级相机微距推进）
    let lastTime = performance.now();
    let rafId = 0;
    let running = false;
    let pageVisible = document.visibilityState !== 'hidden';
    let elementVisible = typeof IntersectionObserver === 'undefined';
    let visibilityObserver: IntersectionObserver | null = null;

    // 相机微距推镜插值进度（0 = 全景扣盖，1 = 微距特写）
    let camProgress = 0;
    const currentCamPos = DEFAULT_CAM_POS.clone();
    const currentLookAt = DEFAULT_LOOK_AT.clone();

    // 杯体弹簧状态：位置 XYZ + 转角 XZ 全弹簧驱动
    let cupX = 0;
    let cupVelX = 0;
    let cupY = 0;
    let cupVelY = 0;
    let cupZ = 0;
    let cupVelZ = 0;
    let cupRotX = 0;
    let cupRotVelX = 0;
    let cupRotZ = 0;
    let cupRotVelZ = 0;
    // 摇晃抖动偏移
    let wobX = 0;
    let wobZ = 0;
    let wobRotZ = 0;
    let shakeT = 0;

    const spring = (
      pos: number, vel: number, target: number, dt: number, k: number, damp: number
    ): [number, number] => {
      const a = -k * (pos - target) - damp * vel;
      const nv = vel + a * dt;
      return [pos + nv * dt, nv];
    };

    const update = (dt: number) => {
      const st = stateRef.current;

      // diceValues 变化 → 布局与落定动画（不重建场景）
      const key = st.diceValues.join(',');
      if (key !== lastValuesKey) {
        lastValuesKey = key;
        syncDice(st.diceValues, st.motionLevel === 'off');
      }

      // ── 相机微距推镜插值 ──
      const lifted = st.isLifted;
      const targetCamProgress = lifted ? 1 : 0;
      if (st.motionLevel === 'off') {
        camProgress = targetCamProgress;
      } else {
        const camSpeed = lifted ? 8.0 : 9.5;
        const diff = targetCamProgress - camProgress;
        if (Math.abs(diff) > 1e-4) {
          camProgress += diff * Math.min(1, dt * camSpeed);
        } else {
          camProgress = targetCamProgress;
        }
      }

      // 平滑余弦缓动运镜
      const p = 0.5 - 0.5 * Math.cos(camProgress * Math.PI);
      const zoomTarget = getZoomCameraTarget(dice.length, isCompact);
      currentCamPos.lerpVectors(DEFAULT_CAM_POS, zoomTarget.pos, p);
      currentLookAt.lerpVectors(DEFAULT_LOOK_AT, zoomTarget.lookAt, p);
      camera.position.copy(currentCamPos);
      camera.lookAt(currentLookAt);
      camera.fov = THREE.MathUtils.lerp(40, zoomTarget.fov, p);
      camera.updateProjectionMatrix();

      // ── 杯体弹簧：掀盖顺畅飞出让出视野；扣盖回正 ──
      const targetY = lifted ? CUP_LIFT_Y : 0;
      const targetX = lifted ? CUP_LIFT_X : 0;
      const targetZ = lifted ? CUP_LIFT_Z : 0;
      const targetRotX = lifted ? CUP_LIFT_TILT : 0;
      const targetRotZ = lifted ? CUP_LIFT_LEAN : 0;
      if (st.motionLevel === 'off') {
        cupX = targetX;
        cupY = targetY;
        cupZ = targetZ;
        cupRotX = targetRotX;
        cupRotZ = targetRotZ;
        cupVelX = 0;
        cupVelY = 0;
        cupVelZ = 0;
        cupRotVelX = 0;
        cupRotVelZ = 0;
        wobX = 0;
        wobZ = 0;
        wobRotZ = 0;
      } else {
        [cupY, cupVelY] = spring(cupY, cupVelY, targetY, dt, 80, 11);
        [cupX, cupVelX] = spring(cupX, cupVelX, targetX, dt, 65, 10);
        [cupZ, cupVelZ] = spring(cupZ, cupVelZ, targetZ, dt, 65, 10);
        [cupRotX, cupRotVelX] = spring(cupRotX, cupRotVelX, targetRotX, dt, 65, 10);
        [cupRotZ, cupRotVelZ] = spring(cupRotZ, cupRotVelZ, targetRotZ, dt, 60, 9);
      }

      const shakingActive = st.isShaking && st.motionLevel !== 'off';
      if (shakingActive) {
        // 摇晃：手腕复合摇动轨迹 + 惯性带动骰子
        shakeT += dt;
        const amp = motionScale;
        const ax = -0.25 * amp * 2.2 * 2.2 * Math.sin(shakeT * 2.2);
        const az = -0.22 * amp * 2.8 * 2.8 * Math.cos(shakeT * 2.8);

        wobX = Math.sin(shakeT * 2.2) * 0.25 * amp;
        wobZ = Math.cos(shakeT * 2.8) * 0.22 * amp;
        wobRotZ = Math.sin(shakeT * 3.1) * 0.18 * amp;

        const half = dieSize / 2;
        const maxR = Math.max(0.1, 1.15 - half * 0.9);
        for (const d of dice) {
          d.settle = null;
          d.vel.x += ax * dt * 1.7;
          d.vel.z += az * dt * 1.7;
          d.vel.y -= GRAVITY * dt;
          d.mesh.position.x += d.vel.x * dt;
          d.mesh.position.y += d.vel.y * dt;
          d.mesh.position.z += d.vel.z * dt;

          if (d.mesh.position.y <= half) {
            d.mesh.position.y = half;
            if (Math.abs(d.vel.y) > 0.9) {
              playKnock(Math.min(1, Math.abs(d.vel.y) / 6));
              d.angVel.set(
                (Math.random() - 0.5) * 16,
                (Math.random() - 0.5) * 16,
                (Math.random() - 0.5) * 16
              );
            }
            d.vel.y = Math.abs(d.vel.y) > 0.5 ? -d.vel.y * 0.45 : 0;
            d.vel.x *= 0.72;
            d.vel.z *= 0.72;
          }

          const r = Math.hypot(d.mesh.position.x, d.mesh.position.z);
          if (r > maxR && r > 1e-4) {
            const nx = d.mesh.position.x / r;
            const nz = d.mesh.position.z / r;
            d.mesh.position.x = nx * maxR;
            d.mesh.position.z = nz * maxR;
            const vn = d.vel.x * nx + d.vel.z * nz;
            if (vn > 0) {
              d.vel.x -= 1.6 * vn * nx;
              d.vel.z -= 1.6 * vn * nz;
              d.angVel.set(
                (Math.random() - 0.5) * 18,
                (Math.random() - 0.5) * 18,
                (Math.random() - 0.5) * 18
              );
              playKnock(Math.min(1, vn / 5) * 0.7);
            }
          }

          d.mesh.rotation.x += d.angVel.x * dt;
          d.mesh.rotation.y += d.angVel.y * dt;
          d.mesh.rotation.z += d.angVel.z * dt;
        }
      } else {
        if (wasShaking) {
          for (const d of dice) startSettle(d);
        }
        shakeT = 0;

        const decay = Math.min(1, dt * 8);
        wobX += (0 - wobX) * decay;
        wobZ += (0 - wobZ) * decay;
        wobRotZ += (0 - wobRotZ) * decay;

        for (const d of dice) {
          if (d.settle) {
            d.settle.t += dt;
            const sp = Math.min(1, d.settle.t / d.settle.duration);
            d.mesh.quaternion.slerpQuaternions(
              d.settle.fromQuat,
              d.settle.toQuat,
              easeOutBack(sp)
            );
            const half = dieSize / 2;
            d.mesh.position.y =
              d.settle.fromY + (half - d.settle.fromY) * easeOutBounce(sp);
            if (sp >= 1) d.settle = null;
          } else {
            d.angVel.multiplyScalar(Math.max(0, 1 - dt * 10));
            if (d.angVel.lengthSq() > 1e-4) {
              d.mesh.rotation.x += d.angVel.x * dt;
              d.mesh.rotation.y += d.angVel.y * dt;
              d.mesh.rotation.z += d.angVel.z * dt;
            }
            const half = dieSize / 2;
            d.mesh.position.y += (half - d.mesh.position.y) * Math.min(1, dt * 10);
          }
          const lerpXz = Math.min(1, dt * 6);
          d.mesh.position.x += (d.targetX - d.mesh.position.x) * lerpXz;
          d.mesh.position.z += (d.targetZ - d.mesh.position.z) * lerpXz;
        }
      }

      cupGroup.position.set(cupX + wobX, cupY, cupZ + wobZ);
      cupGroup.rotation.set(cupRotX, 0, cupRotZ + wobRotZ);

      wasShaking = shakingActive;
    };

    /** 是否仍有活跃动画（用于按需渲染挂起判定） */
    const isAnimating = (): boolean => {
      const st = stateRef.current;
      if (st.isShaking && st.motionLevel !== 'off') return true;
      if (Math.abs(camProgress - (st.isLifted ? 1 : 0)) > 1e-3) return true;
      const lifted = st.isLifted;
      const targetY = lifted ? CUP_LIFT_Y : 0;
      if (Math.abs(cupY - targetY) > 1e-3 || Math.abs(cupVelY) > 2e-2) return true;
      const targetX = lifted ? CUP_LIFT_X : 0;
      if (Math.abs(cupX - targetX) > 1e-3 || Math.abs(cupVelX) > 2e-2) return true;
      const targetZ = lifted ? CUP_LIFT_Z : 0;
      if (Math.abs(cupZ - targetZ) > 1e-3 || Math.abs(cupVelZ) > 2e-2) return true;
      const targetRotX = lifted ? CUP_LIFT_TILT : 0;
      if (Math.abs(cupRotX - targetRotX) > 1e-3 || Math.abs(cupRotVelX) > 2e-2) return true;
      const targetRotZ = lifted ? CUP_LIFT_LEAN : 0;
      if (Math.abs(cupRotZ - targetRotZ) > 1e-3 || Math.abs(cupRotVelZ) > 2e-2) return true;
      if (Math.abs(wobX) > 1e-3 || Math.abs(wobZ) > 1e-3 || Math.abs(wobRotZ) > 1e-3) return true;
      for (const d of dice) {
        if (d.settle) return true;
        if (d.angVel.lengthSq() > 1e-4) return true;
        if (Math.abs(d.mesh.position.x - d.targetX) > 1e-3) return true;
        if (Math.abs(d.mesh.position.z - d.targetZ) > 1e-3) return true;
        if (Math.abs(d.mesh.position.y - dieSize / 2) > 1e-3) return true;
      }
      return false;
    };

    const tick = () => {
      if (!pageVisible || !elementVisible) {
        rafId = 0;
        running = false;
        return;
      }
      const now = performance.now();
      const dt = Math.min((now - lastTime) / 1000, 0.033);
      lastTime = now;
      update(dt);
      renderer.render(scene, camera);
      if (shouldRunDiceCupFrame(pageVisible, elementVisible, isAnimating())) {
        rafId = requestAnimationFrame(tick);
        return;
      }
      rafId = 0;
      running = false;
    };

    const stopLoop = () => {
      if (rafId !== 0) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }
      running = false;
    };

    const wake = () => {
      if (running || !pageVisible || !elementVisible) return;
      running = true;
      lastTime = performance.now(); // 丢弃挂起期间累积的时间
      rafId = requestAnimationFrame(tick);
    };

    // WebGL 上下文丢失 / 恢复
    const onContextLost = (e: Event) => {
      e.preventDefault();
      stopLoop();
    };
    const onContextRestored = () => {
      wake();
    };
    renderer.domElement.addEventListener('webglcontextlost', onContextLost);
    renderer.domElement.addEventListener('webglcontextrestored', onContextRestored);

    // 页面隐藏时挂起渲染（DiceCup 层的防窥扣盖与此互补）
    const onVisibility = () => {
      pageVisible = document.visibilityState !== 'hidden';
      if (!pageVisible) {
        stopLoop();
      } else {
        wake();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    if (typeof IntersectionObserver !== 'undefined') {
      visibilityObserver = new IntersectionObserver(([entry]) => {
        elementVisible = entry?.isIntersecting === true && entry.intersectionRatio > 0;
        if (elementVisible) wake();
        else stopLoop();
      }, { threshold: 0.01 });
      visibilityObserver.observe(container);
    }

    wakeRef.current = wake;
    wake();

    // 9. Cleanup
    return () => {
      wakeRef.current = null;
      stopLoop();
      visibilityObserver?.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
      renderer.domElement.removeEventListener('webglcontextrestored', onContextRestored);
      mainLight.shadow.dispose();
      for (const res of disposables) res.dispose();
      renderer.forceContextLoss();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [motionLevel, theme, variant]);

  return (
    <div
      ref={mountRef}
      className={`three-dice-cup-canvas-wrapper ${className}`}
      data-motion-level={motionLevel}
      data-render-policy="on-demand"
      aria-hidden="true"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        touchAction: 'none',
      }}
    />
  );
}
