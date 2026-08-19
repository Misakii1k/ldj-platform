import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { webAudio } from './WebAudioManager.ts';

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
  const s = size / 256; // 相对 256 基准的缩放系数

  // 1. 象牙白微渐变底色
  const bgGrad = ctx.createRadialGradient(
    size / 2, size / 2, 10 * s,
    size / 2, size / 2, size * 0.7
  );
  bgGrad.addColorStop(0, '#ffffff');
  bgGrad.addColorStop(0.85, '#f8fafc');
  bgGrad.addColorStop(1, '#e2e8f0');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, size, size);

  // 2. 边缘微圆角反光暗角
  ctx.lineWidth = 14 * s;
  ctx.strokeStyle = 'rgba(203, 213, 225, 0.4)';
  ctx.strokeRect(7 * s, 7 * s, size - 14 * s, size - 14 * s);

  // 3. 点位坐标与色彩
  const isRed = value === 1 || value === 4;
  const dotColor = isRed ? '#dc2626' : '#1e293b';
  const dotGlow = isRed ? '#ef4444' : '#334155';

  const drawDot = (xPct: number, yPct: number, radius: number) => {
    const x = (xPct / 100) * size;
    const y = (yPct / 100) * size;

    // 内凹阴影
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    const grad = ctx.createRadialGradient(
      x - radius * 0.3, y - radius * 0.3, 1,
      x, y, radius
    );
    grad.addColorStop(0, dotGlow);
    grad.addColorStop(0.8, dotColor);
    grad.addColorStop(1, isRed ? '#991b1b' : '#0f172a');
    ctx.fillStyle = grad;
    ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
    ctx.shadowBlur = 6 * s;
    ctx.shadowOffsetX = 1 * s;
    ctx.shadowOffsetY = 2 * s;
    ctx.fill();

    // 内部高光小点
    ctx.beginPath();
    ctx.arc(x - radius * 0.35, y - radius * 0.35, radius * 0.22, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.shadowColor = 'transparent';
    ctx.fill();
    ctx.restore();
  };

  const bigR = 36 * s;
  const normalR = 22 * s;

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
 * 主题化程序化贴图：杯体 map / 底盘毡面 map（灰度×材质色）/ 金属拉丝 roughnessMap。
 * 全部 Canvas 生成，无外部静态资产，离线可用。
 */
function createThemedTextures(theme: ThreeDiceCupTheme, size: number): ThemedTextures {
  // ── 杯体贴图 ──
  const cupCanvas = document.createElement('canvas');
  cupCanvas.width = cupCanvas.height = size;
  const cc = cupCanvas.getContext('2d')!;

  if (theme === 'wood') {
    // 竖向木纹：基底 + 正弦扰动条纹 + 噪点
    const base = cc.createLinearGradient(0, 0, size, 0);
    base.addColorStop(0, '#8a4a1d');
    base.addColorStop(0.5, '#9a5a28');
    base.addColorStop(1, '#7a3f16');
    cc.fillStyle = base;
    cc.fillRect(0, 0, size, size);
    for (let x = 0; x < size; x += 2) {
      const alpha = 0.05 + 0.11 * Math.abs(Math.sin(x * 0.09 + Math.sin(x * 0.021) * 2));
      cc.strokeStyle = `rgba(52, 26, 7, ${alpha})`;
      cc.lineWidth = x % 9 === 0 ? 2 : 1;
      cc.beginPath();
      cc.moveTo(x + Math.sin(x * 0.12) * 4, 0);
      for (let y = 0; y <= size; y += 8) {
        cc.lineTo(x + Math.sin(y * 0.045 + x * 0.02) * 5, y);
      }
      cc.stroke();
    }
    sprayNoise(cc, size, size * 3, 0.05);
  } else if (theme === 'metal') {
    // 深灰金属基底 + 竖向微渐变（拉丝交给 roughnessMap）
    const grad = cc.createLinearGradient(0, 0, size, 0);
    grad.addColorStop(0, '#475569');
    grad.addColorStop(0.5, '#5b6b81');
    grad.addColorStop(1, '#3e4b5e');
    cc.fillStyle = grad;
    cc.fillRect(0, 0, size, size);
    sprayNoise(cc, size, size * 2, 0.04);
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

  // ── 金属拉丝 roughnessMap ──
  let roughnessMap: THREE.CanvasTexture | null = null;
  if (theme === 'metal') {
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
  }

  return { cupMap, matMap, roughnessMap };
}

/* ══════════════════════ 布局 ══════════════════════ */

/** 多粒骰子在底座上的排布（返回 [x, z] 坐标） */
function layoutPositionsFor(count: number): Array<readonly [number, number]> {
  switch (count) {
    case 1: return [[0, 0]];
    case 2: return [[-0.45, 0], [0.45, 0]];
    case 3: return [[0, -0.45], [-0.5, 0.4], [0.5, 0.4]];
    case 4: return [[-0.45, -0.45], [0.45, -0.45], [-0.45, 0.45], [0.45, 0.45]];
    case 5: return [[-0.5, -0.5], [0.5, -0.5], [0, 0], [-0.5, 0.5], [0.5, 0.5]];
    default: return [[-0.5, -0.6], [0.5, -0.6], [-0.5, 0], [0.5, 0], [-0.5, 0.6], [0.5, 0.6]];
  }
}

function dieSizeFor(count: number): number {
  if (count === 1) return 0.76;
  if (count <= 3) return 0.58;
  return 0.46;
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

const CUP_LIFT_Y = 1.9;
const CUP_LIFT_TILT = -0.35;
const GRAVITY = 26;
const SETTLE_DURATION = 0.5;
const KNOCK_MIN_INTERVAL_MS = 60;

export function ThreeDiceCupCanvas({
  diceValues = [4],
  isLifted,
  isShaking,
  theme = 'wood',
  variant = 'large',
  className = '',
}: ThreeDiceCupCanvasProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);

  // 动态状态经 ref 传入渲染帧，避免场景重建
  const stateRef = useRef({ isLifted, isShaking, theme, diceValues, variant });
  stateRef.current = { isLifted, isShaking, theme, diceValues, variant };

  // 唤醒按需渲染循环（组件每次渲染后调用）
  const wakeRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    wakeRef.current?.();
  });

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const isCompact = variant === 'compact';
    const width = isCompact ? 140 : 200;
    const height = isCompact ? 150 : 210;
    const texSize = isCompact ? 128 : 256;
    const shadowSize = isCompact ? 1024 : 2048;
    const pixelCap = isCompact ? 1.5 : 2;

    const reducedMotion =
      typeof matchMedia !== 'undefined' &&
      matchMedia('(prefers-reduced-motion: reduce)').matches;
    const motionScale = reducedMotion ? 0.4 : 1;
    const settleDuration = reducedMotion ? SETTLE_DURATION * 0.6 : SETTLE_DURATION;

    // ── 资源统一登记释放 ──
    const disposables: Array<{ dispose(): void }> = [];
    const track = <T extends { dispose(): void }>(res: T): T => {
      disposables.push(res);
      return res;
    };

    // 1. Scene & Camera
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 100);
    camera.position.set(0, 4.8, 6.8);
    camera.lookAt(0, 0.4, 0);

    // 2. WebGL Renderer
    const renderer = track(
      new THREE.WebGLRenderer({ antialias: true, alpha: true })
    );
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, pixelCap));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    container.appendChild(renderer.domElement);

    // 3. Lighting
    scene.add(new THREE.AmbientLight(0xffffff, 0.55));

    const mainLight = new THREE.DirectionalLight(0xfff5e6, 2.2);
    mainLight.position.set(4, 9, 5);
    mainLight.castShadow = true;
    mainLight.shadow.mapSize.set(shadowSize, shadowSize);
    mainLight.shadow.camera.left = -4;
    mainLight.shadow.camera.right = 4;
    mainLight.shadow.camera.top = 4;
    mainLight.shadow.camera.bottom = -4;
    mainLight.shadow.camera.near = 2;
    mainLight.shadow.camera.far = 20;
    mainLight.shadow.bias = -0.0008;
    scene.add(mainLight);

    const fillLight = new THREE.DirectionalLight(0x93c5fd, 0.8);
    fillLight.position.set(-5, 6, -3);
    scene.add(fillLight);

    const rimLight = new THREE.PointLight(0xfef08a, 1.2, 10);
    rimLight.position.set(0, 6, 2);
    scene.add(rimLight);

    // 4. 环境反射（PMREM + 手写简易灯箱场景，不依赖 addons）
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
      panel(7, 3, 0xfff2df, 3.2, 0, 6, 2); // 顶部暖光
      panel(5, 2, 0xdceaff, 1.8, -5, 2, -3); // 侧冷光
      panel(4, 3, 0xffe9b8, 1.5, 5, 1, -4); // 背光
      const envRT = track(pmrem.fromScene(envScene, 0.04));
      scene.environment = envRT.texture;
    }

    // 5. Table Mat & Rim Base（天鹅绒底盘 + 主题毡面 + 木质外框）
    const themed = createThemedTextures(theme, texSize);
    track(themed.cupMap);
    track(themed.matMap);
    if (themed.roughnessMap) track(themed.roughnessMap);

    const baseGroup = new THREE.Group();
    scene.add(baseGroup);

    const matColor = theme === 'felt' ? 0x700c36 : theme === 'metal' ? 0x1e293b : 0x164e2b;
    const matGeo = track(new THREE.CylinderGeometry(2.1, 2.1, 0.12, 48));
    const matMat = track(
      new THREE.MeshStandardMaterial({
        color: matColor,
        map: themed.matMap,
        roughness: 0.92,
        metalness: 0.02,
      })
    );
    const matMesh = new THREE.Mesh(matGeo, matMat);
    matMesh.position.y = -0.06;
    matMesh.receiveShadow = true;
    baseGroup.add(matMesh);

    const rimWoodColor = theme === 'felt' ? 0x4a0422 : theme === 'metal' ? 0x334155 : 0x542c13;
    const rimGeo = track(new THREE.TorusGeometry(2.12, 0.12, 16, 48));
    const rimMat = track(
      new THREE.MeshStandardMaterial({
        color: rimWoodColor,
        roughness: 0.35,
        metalness: 0.25,
      })
    );
    const rimMesh = new THREE.Mesh(rimGeo, rimMat);
    rimMesh.rotation.x = Math.PI / 2;
    rimMesh.position.y = 0.02;
    rimMesh.receiveShadow = true;
    baseGroup.add(rimMesh);

    // 6. Dice（单位立方体 + scale，支持数量动态增减）
    const faceTextures = [1, 2, 3, 4, 5, 6].map((num) =>
      track(createDiceFaceTexture(num, texSize))
    );
    const diceMaterials = [
      faceTextures[0], faceTextures[5], faceTextures[1],
      faceTextures[4], faceTextures[2], faceTextures[3],
    ].map(
      (map) =>
        track(
          new THREE.MeshPhysicalMaterial({
            map,
            roughness: 0.22,
            metalness: 0.02,
            clearcoat: 0.55,
            clearcoatRoughness: 0.28,
          })
        )
    );

    const dieGeo = track(new THREE.BoxGeometry(1, 1, 1));
    const diceGroup = new THREE.Group();
    scene.add(diceGroup);

    const dice: DieState[] = [];
    let dieSize = 0.76;
    let lastValuesKey = '';
    let wasShaking = false;
    let lastKnockAt = 0;

    const playKnock = (intensity: number) => {
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

    // 7. 3D Cup（Lathe 车削钟形杯体 + 金环 + 葫芦顶钮）
    const cupGroup = new THREE.Group();
    scene.add(cupGroup);

    const cupBodyMat = track(
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: themed.cupMap,
        ...(themed.roughnessMap ? { roughnessMap: themed.roughnessMap } : {}),
        metalness: theme === 'metal' ? 0.7 : 0.12,
        roughness: theme === 'metal' ? 0.34 : theme === 'felt' ? 0.8 : 0.5,
        side: THREE.DoubleSide,
      })
    );

    const goldMat = track(
      new THREE.MeshStandardMaterial({
        color: 0xf59e0b,
        metalness: 0.9,
        roughness: 0.2,
      })
    );

    // 钟形杯壁（底部 r1.70 → 收腰 → 顶部 r1.18，杯口内折呈薄壁）
    const cupProfile = [
      [1.7, 0.0],
      [1.62, 0.22],
      [1.48, 0.6],
      [1.34, 1.05],
      [1.26, 1.55],
      [1.22, 2.0],
      [1.18, 2.3],
      [1.1, 2.3],
      [1.08, 2.2],
    ].map(([x, y]) => new THREE.Vector2(x, y));
    const cupBodyGeo = track(new THREE.LatheGeometry(cupProfile, 48));
    const cupBodyMesh = new THREE.Mesh(cupBodyGeo, cupBodyMat);
    cupBodyMesh.castShadow = true;
    cupGroup.add(cupBodyMesh);

    // 杯顶盖
    const cupTopGeo = track(new THREE.CylinderGeometry(1.17, 1.17, 0.09, 48));
    const cupTopMesh = new THREE.Mesh(cupTopGeo, cupBodyMat);
    cupTopMesh.position.y = 2.345;
    cupGroup.add(cupTopMesh);

    // 葫芦顶钮：环托 + 球
    const knobRingGeo = track(new THREE.TorusGeometry(0.15, 0.045, 12, 32));
    const knobRingMesh = new THREE.Mesh(knobRingGeo, goldMat);
    knobRingMesh.rotation.x = Math.PI / 2;
    knobRingMesh.position.y = 2.45;
    cupGroup.add(knobRingMesh);

    const knobGeo = track(new THREE.SphereGeometry(0.24, 24, 24));
    const knobMesh = new THREE.Mesh(knobGeo, goldMat);
    knobMesh.position.y = 2.62;
    knobMesh.castShadow = true;
    cupGroup.add(knobMesh);

    // 金质边缘饰环（顶口 / 底口）
    const topRingGeo = track(new THREE.TorusGeometry(1.2, 0.05, 12, 48));
    const topRingMesh = new THREE.Mesh(topRingGeo, goldMat);
    topRingMesh.rotation.x = Math.PI / 2;
    topRingMesh.position.y = 2.39;
    cupGroup.add(topRingMesh);

    const bottomRingGeo = track(new THREE.TorusGeometry(1.7, 0.06, 12, 48));
    const bottomRingMesh = new THREE.Mesh(bottomRingGeo, goldMat);
    bottomRingMesh.rotation.x = Math.PI / 2;
    bottomRingMesh.position.y = 0.05;
    cupGroup.add(bottomRingMesh);

    // 8. 动画与物理循环（按需渲染）
    let lastTime = performance.now();
    let rafId = 0;
    let running = false;
    let idleFrames = 0;

    // 杯体弹簧状态（欠阻尼 → 轻微过冲回弹）
    let cupY = 0;
    let cupVelY = 0;
    let cupRotX = 0;
    let cupRotVelX = 0;
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
        syncDice(st.diceValues, false);
      }

      // 杯体升降弹簧
      const targetY = st.isLifted ? CUP_LIFT_Y : 0;
      [cupY, cupVelY] = spring(cupY, cupVelY, targetY, dt, 90, 11);
      cupGroup.position.y = cupY;

      const targetRotX = st.isLifted ? CUP_LIFT_TILT : 0;
      [cupRotX, cupRotVelX] = spring(cupRotX, cupRotVelX, targetRotX, dt, 70, 10);
      cupGroup.rotation.x = cupRotX;

      if (st.isShaking) {
        // 摇晃：手腕复合摇动轨迹 + 惯性带动骰子
        shakeT += dt;
        const amp = motionScale;
        const ax = -0.25 * amp * 2.2 * 2.2 * Math.sin(shakeT * 2.2);
        const az = -0.22 * amp * 2.8 * 2.8 * Math.cos(shakeT * 2.8);

        cupGroup.position.x = Math.sin(shakeT * 2.2) * 0.25 * amp;
        cupGroup.position.z = Math.cos(shakeT * 2.8) * 0.22 * amp;
        cupGroup.rotation.z = Math.sin(shakeT * 3.1) * 0.18 * amp;

        const half = dieSize / 2;
        const maxR = Math.max(0.1, 1.15 - half * 0.9);
        for (const d of dice) {
          d.settle = null;
          // 惯性力 + 重力
          d.vel.x += ax * dt * 1.7;
          d.vel.z += az * dt * 1.7;
          d.vel.y -= GRAVITY * dt;
          d.mesh.position.x += d.vel.x * dt;
          d.mesh.position.y += d.vel.y * dt;
          d.mesh.position.z += d.vel.z * dt;

          // 底盘碰撞
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

          // 杯壁径向碰撞
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

          // 翻滚积分
          d.mesh.rotation.x += d.angVel.x * dt;
          d.mesh.rotation.y += d.angVel.y * dt;
          d.mesh.rotation.z += d.angVel.z * dt;
        }
      } else {
        // 摇骰结束沿 → 全部骰子进入落定动画
        if (wasShaking) {
          for (const d of dice) startSettle(d);
        }
        shakeT = 0;

        // 杯体回正
        const lerp = Math.min(1, dt * 8);
        cupGroup.position.x += (0 - cupGroup.position.x) * lerp;
        cupGroup.position.z += (0 - cupGroup.position.z) * lerp;
        cupGroup.rotation.z += (0 - cupGroup.rotation.z) * lerp;

        for (const d of dice) {
          if (d.settle) {
            d.settle.t += dt;
            const p = Math.min(1, d.settle.t / d.settle.duration);
            d.mesh.quaternion.slerpQuaternions(
              d.settle.fromQuat,
              d.settle.toQuat,
              easeOutBack(p)
            );
            const half = dieSize / 2;
            d.mesh.position.y =
              d.settle.fromY + (half - d.settle.fromY) * easeOutBounce(p);
            if (p >= 1) d.settle = null;
          } else {
            // 残余角速度衰减
            d.angVel.multiplyScalar(Math.max(0, 1 - dt * 10));
            if (d.angVel.lengthSq() > 1e-4) {
              d.mesh.rotation.x += d.angVel.x * dt;
              d.mesh.rotation.y += d.angVel.y * dt;
              d.mesh.rotation.z += d.angVel.z * dt;
            }
            const half = dieSize / 2;
            d.mesh.position.y += (half - d.mesh.position.y) * Math.min(1, dt * 10);
          }
          // 水平位置渐近布局点
          const lerpXz = Math.min(1, dt * 6);
          d.mesh.position.x += (d.targetX - d.mesh.position.x) * lerpXz;
          d.mesh.position.z += (d.targetZ - d.mesh.position.z) * lerpXz;
        }
      }
      wasShaking = st.isShaking;
    };

    /** 是否仍有活跃动画（用于按需渲染挂起判定） */
    const isAnimating = (): boolean => {
      const st = stateRef.current;
      if (st.isShaking) return true;
      const targetY = st.isLifted ? CUP_LIFT_Y : 0;
      if (Math.abs(cupY - targetY) > 1e-3 || Math.abs(cupVelY) > 2e-2) return true;
      const targetRotX = st.isLifted ? CUP_LIFT_TILT : 0;
      if (Math.abs(cupRotX - targetRotX) > 1e-3 || Math.abs(cupRotVelX) > 2e-2) return true;
      if (
        Math.abs(cupGroup.position.x) > 1e-3 ||
        Math.abs(cupGroup.position.z) > 1e-3 ||
        Math.abs(cupGroup.rotation.z) > 1e-3
      ) return true;
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
      rafId = requestAnimationFrame(tick);
      const now = performance.now();
      const dt = Math.min((now - lastTime) / 1000, 0.033);
      lastTime = now;
      update(dt);
      renderer.render(scene, camera);
      if (!isAnimating()) {
        if (++idleFrames >= 5) {
          cancelAnimationFrame(rafId);
          running = false;
        }
      } else {
        idleFrames = 0;
      }
    };

    const stopLoop = () => {
      if (running) {
        cancelAnimationFrame(rafId);
        running = false;
      }
    };

    const wake = () => {
      idleFrames = 0;
      if (running) return;
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
      if (document.visibilityState === 'hidden') {
        stopLoop();
      } else {
        wake();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    wakeRef.current = wake;
    wake();

    // 9. Cleanup
    return () => {
      wakeRef.current = null;
      stopLoop();
      document.removeEventListener('visibilitychange', onVisibility);
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
      renderer.domElement.removeEventListener('webglcontextrestored', onContextRestored);
      for (const res of disposables) res.dispose();
      renderer.forceContextLoss();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [theme, variant]);

  return (
    <div
      ref={mountRef}
      className={`three-dice-cup-canvas-wrapper ${className}`}
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
