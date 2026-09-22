import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { useMotion } from '../../motion/MotionContext.tsx';
import { createCheeseGeometry } from './cheeseModelGeometry.ts';

export interface CheeseModel3DCanvasProps {
  /** 奶酪是否已被偷走 */
  isStolen?: boolean;
  /** 是否可交互（例如夜间偷取） */
  interactive?: boolean;
  /** 点击偷取回调 */
  onSteal?: () => void;
  /** 是否禁用交互/提交中 */
  disabled?: boolean;
  /** 外部容器类名 */
  className?: string;
  /** 尺寸大小（像素，默认 320） */
  size?: number;
}

/** Subtle surface grain only: the large pores are actual recessed geometry. */
function createCheeseGrain(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, 256, 256);
  let seed = 43;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (let i = 0; i < 3500; i++) {
    const x = random() * 256, y = random() * 256;
    ctx.fillStyle = random() > 0.5 ? 'rgba(255,255,255,.1)' : 'rgba(0,0,0,.1)';
    ctx.fillRect(x, y, 1, 1);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

/**
 * 亚麻餐垫织物纹理
 */
function createClothTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#f6f4ed';
  ctx.fillRect(0, 0, 256, 256);

  // 编织经纬线细微噪点
  ctx.fillStyle = 'rgba(160, 140, 120, 0.08)';
  for (let i = 0; i < 256; i += 3) {
    ctx.fillRect(i, 0, 1.5, 256);
    ctx.fillRect(0, i, 256, 1.5);
  }

  // 边缘淡灰环纹
  ctx.strokeStyle = 'rgba(180, 160, 140, 0.25)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(128, 128, 120, 0, Math.PI * 2);
  ctx.stroke();

  const texture = new THREE.CanvasTexture(canvas);
  return texture;
}

export function CheeseModel3DCanvas({
  isStolen = false,
  interactive = false,
  onSteal,
  disabled = false,
  className = '',
  size = 320,
}: CheeseModel3DCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isHovered, setIsHovered] = useState(false);
  const { level } = useMotion();

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    // 1. 初始化场景与摄像机
    const scene = new THREE.Scene();

    const width = container.clientWidth || size;
    const height = container.clientHeight || size;
    const aspect = width / height;

    const camera = new THREE.PerspectiveCamera(38, aspect, 0.1, 50);
    camera.position.set(-0.5, 4.3, 6.2);
    camera.lookAt(0, 0.35, 0);

    // 2. 渲染器配置
    const pixelRatioCap = level === 'minimal' || level === 'off' ? 1 : Math.min(window.devicePixelRatio, 2);
    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: level !== 'off' && level !== 'minimal',
      alpha: true,
      powerPreference: 'default',
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(pixelRatioCap);
    renderer.shadowMap.enabled = level !== 'off' && level !== 'minimal';
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;

    // 3. 灯光系统（考究的餐桌聚光与轮廓光）
    const ambientLight = new THREE.HemisphereLight(0xfff8e9, 0x454752, 1.8);
    scene.add(ambientLight);

    const mainLight = new THREE.DirectionalLight(0xfff5e5, 2.5);
    mainLight.position.set(-3.5, 6.0, 4.2);
    mainLight.castShadow = renderer.shadowMap.enabled;
    mainLight.shadow.mapSize.width = 1024;
    mainLight.shadow.mapSize.height = 1024;
    mainLight.shadow.camera.near = 0.5;
    mainLight.shadow.camera.far = 15;
    mainLight.shadow.camera.left = -3;
    mainLight.shadow.camera.right = 3;
    mainLight.shadow.camera.top = 3;
    mainLight.shadow.camera.bottom = -3;
    mainLight.shadow.bias = -0.0002;
    mainLight.shadow.normalBias = 0.025;
    mainLight.shadow.radius = 3;
    scene.add(mainLight);

    const rimLight = new THREE.DirectionalLight(0xcde3ff, 0.85);
    rimLight.position.set(-4.0, 3.5, -2.5);
    scene.add(rimLight);

    const fillLight = new THREE.PointLight(0xffeedd, 0.6, 8);
    fillLight.position.set(0, 2.0, 2.5);
    scene.add(fillLight);

    // 4. 深胡桃木底盘 + 鎏金金属边圈 + 亚麻餐垫布
    const platterGroup = new THREE.Group();
    scene.add(platterGroup);

    // 托盘底座（深胡桃实木，微倒角分层）
    const woodGeo = new THREE.CylinderGeometry(2.1, 2.2, 0.24, 64);
    const woodMat = new THREE.MeshStandardMaterial({
      color: 0x543320, // 深深胡桃木色
      roughness: 0.42,
      metalness: 0,
    });
    const woodPlatter = new THREE.Mesh(woodGeo, woodMat);
    woodPlatter.position.y = -0.12;
    woodPlatter.receiveShadow = true;
    platterGroup.add(woodPlatter);

    // 托盘鎏金镶边外环
    const goldGeo = new THREE.TorusGeometry(2.16, 0.055, 16, 64);
    goldGeo.rotateX(Math.PI / 2);
    const goldMat = new THREE.MeshStandardMaterial({
      color: 0xc59b53,
      roughness: 0.36,
      metalness: 0.55,
    });
    const goldRim = new THREE.Mesh(goldGeo, goldMat);
    goldRim.position.y = 0.01;
    platterGroup.add(goldRim);

    // 亚麻餐垫布
    const clothGeo = new THREE.CylinderGeometry(1.92, 1.92, 0.03, 64);
    const clothTexture = createClothTexture();
    const clothMat = new THREE.MeshStandardMaterial({
      color: 0xf2e6ce, // 被盗时微带淡警示粉红
      map: clothTexture,
      roughness: 0.88,
      metalness: 0.02,
    });
    const cloth = new THREE.Mesh(clothGeo, clothMat);
    cloth.position.y = 0.015;
    cloth.receiveShadow = true;
    platterGroup.add(cloth);

    // 5. 经典瑞士大孔芝士切块
    const cheeseGroup = new THREE.Group();
    scene.add(cheeseGroup);

    const bumpMap = createCheeseGrain();
    const cheeseGeo = createCheeseGeometry();
    const cheeseMat = new THREE.MeshPhysicalMaterial({
      vertexColors: true,
      bumpMap, bumpScale: 0.009,
      roughness: 0.47, metalness: 0,
      clearcoat: 0.12, clearcoatRoughness: 0.48,
      sheen: 0.16, sheenColor: new THREE.Color('#ffdf93'), sheenRoughness: 0.8,
    });
    const cheeseMesh = new THREE.Mesh(cheeseGeo, cheeseMat);
    cheeseMesh.castShadow = true;
    cheeseMesh.receiveShadow = true;
    cheeseGroup.add(cheeseMesh);

    // 6. 被盗后留在托盘餐垫上的案发现场碎屑（3D Crumbs）
    const crumbsGroup = new THREE.Group();
    scene.add(crumbsGroup);

    const crumbMatGold = new THREE.MeshStandardMaterial({
      color: 0xfbbf24,
      roughness: 0.45,
      metalness: 0.05,
    });
    const crumbMatDark = new THREE.MeshStandardMaterial({
      color: 0xd97706,
      roughness: 0.5,
      metalness: 0.05,
    });

    // 随机但确定的案发现场碎屑碎片分布
    const crumbData = [
      { x: 0.2, z: 0.1, s: 0.12, r: 0.3, mat: crumbMatGold },
      { x: -0.25, z: 0.3, s: 0.09, r: 1.1, mat: crumbMatDark },
      { x: 0.45, z: -0.15, s: 0.08, r: 2.2, mat: crumbMatGold },
      { x: -0.4, z: -0.25, s: 0.11, r: 0.7, mat: crumbMatDark },
      { x: 0.05, z: -0.4, s: 0.07, r: 3.1, mat: crumbMatGold },
      { x: 0.6, z: 0.35, s: 0.06, r: 1.5, mat: crumbMatDark },
      { x: -0.65, z: 0.15, s: 0.08, r: 2.8, mat: crumbMatGold },
      { x: 0.1, z: 0.55, s: 0.06, r: 0.4, mat: crumbMatGold },
      { x: -0.15, z: -0.6, s: 0.05, r: 1.8, mat: crumbMatDark },
      { x: 0.35, z: 0.65, s: 0.05, r: 2.5, mat: crumbMatGold },
      { x: -0.3, z: 0.7, s: 0.04, r: 0.9, mat: crumbMatDark },
      { x: 0.75, z: -0.2, s: 0.04, r: 1.2, mat: crumbMatGold },
      { x: -0.7, z: -0.4, s: 0.05, r: 2.1, mat: crumbMatGold },
    ];

    crumbData.forEach(({ x, z, s, r, mat }) => {
      // 使用小十二面体模拟不规则奶酪碎块
      const cGeo = new THREE.DodecahedronGeometry(s, 0);
      const crumb = new THREE.Mesh(cGeo, mat);
      crumb.position.set(x, 0.03 + s * 0.45, z);
      crumb.rotation.set(r, r * 1.5, r * 0.7);
      crumb.castShadow = true;
      crumb.receiveShadow = true;
      crumbsGroup.add(crumb);
    });

    // Contact shadow is baked once, so low-motion devices still retain depth.
    const shadowCanvas = document.createElement('canvas');
    shadowCanvas.width = shadowCanvas.height = 128;
    const shadowCtx = shadowCanvas.getContext('2d')!;
    const shadowGradient = shadowCtx.createRadialGradient(64, 64, 10, 64, 64, 64);
    shadowGradient.addColorStop(0, 'rgba(57,32,12,0.30)');
    shadowGradient.addColorStop(0.65, 'rgba(57,32,12,0.13)');
    shadowGradient.addColorStop(1, 'rgba(57,32,12,0)');
    shadowCtx.fillStyle = shadowGradient;
    shadowCtx.fillRect(0, 0, 128, 128);
    const contactTexture = new THREE.CanvasTexture(shadowCanvas);
    const contactShadow = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 2.6),
      new THREE.MeshBasicMaterial({ map: contactTexture, transparent: true, depthWrite: false }));
    contactShadow.rotation.x = -Math.PI / 2;
    contactShadow.position.y = 0.033;
    scene.add(contactShadow);

    // 初始可见状态
    cheeseGroup.visible = !isStolen;
    crumbsGroup.visible = isStolen;
    contactShadow.visible = !isStolen;

    // 7. 动画与渲染循环
    let animationFrameId: number;
    const clock = new THREE.Clock();
    let isVisible = true;

    // 动画状态过渡变量
    let currentFloatY = 0;
    let targetCheeseScale = isStolen ? 0 : 1;
    let currentCheeseScale = isStolen ? 0 : 1;

    const animate = () => {
      if (!isVisible) return;

      const elapsed = clock.getElapsedTime();

      // 减弱动态控制
      const enableMotion = level !== 'off' && level !== 'minimal';

      // 奶酪偷窃/存在缩放过渡
      targetCheeseScale = isStolen ? 0.001 : 1;
      currentCheeseScale += (targetCheeseScale - currentCheeseScale) * 0.12;
      cheeseGroup.scale.setScalar(Math.max(0.001, currentCheeseScale));
      cheeseGroup.visible = currentCheeseScale > 0.02;
      crumbsGroup.visible = isStolen || currentCheeseScale < 0.98;

      // 未被偷时的温润微浮动呼吸动画
      if (!isStolen && enableMotion) {
        const floatDelta = Math.sin(elapsed * 1.8) * 0.04;
        currentFloatY += (floatDelta - currentFloatY) * 0.1;
        cheeseGroup.position.y = currentFloatY;
        cheeseGroup.rotation.y = Math.sin(elapsed * 0.8) * 0.025;
      } else {
        cheeseGroup.position.y = 0;
        cheeseGroup.rotation.y = 0;
      }

      renderer.render(scene, camera);
      animationFrameId = requestAnimationFrame(animate);
    };

    animationFrameId = requestAnimationFrame(animate);

    // 8. 窗口/容器尺寸调整与可见性监听
    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth || size;
      const h = container.clientHeight || size;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);

    const handleVisibilityChange = () => {
      if (document.hidden) {
        isVisible = false;
        cancelAnimationFrame(animationFrameId);
      } else {
        isVisible = true;
        clock.start();
        animationFrameId = requestAnimationFrame(animate);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // 9. 组件卸载资源释放
    return () => {
      cancelAnimationFrame(animationFrameId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      resizeObserver.disconnect();

      // 释放所有网格资源
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry?.dispose();
          if (Array.isArray(obj.material)) {
            obj.material.forEach((m) => m.dispose());
          } else if (obj.material) {
            obj.material.dispose();
          }
        }
      });

      bumpMap.dispose();
      clothTexture.dispose();
      contactTexture.dispose();
      mainLight.shadow.dispose();
      renderer.dispose();
    };
  }, [isStolen, level, size]);

  const handlePointerDown = () => {
    if (interactive && !disabled && !isStolen && onSteal) {
      onSteal();
    }
  };

  return (
    <div
      ref={containerRef}
      className={`cheese-model-3d-canvas-wrapper ${interactive ? 'is-interactive' : ''} ${
        isStolen ? 'is-stolen' : ''
      } ${disabled ? 'is-disabled' : ''} ${className}`}
      onClick={handlePointerDown}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      role={interactive && !isStolen ? 'button' : undefined}
      tabIndex={interactive && !isStolen && !disabled ? 0 : undefined}
      aria-label={isStolen ? '奶酪已被偷走，盘中留有碎屑' : '金黄诱人的大孔奶酪'}
      style={{
        position: 'relative',
        width: size ? `${size}px` : '100%',
        maxWidth: '100%',
        aspectRatio: '1',
        cursor: interactive && !isStolen && !disabled ? 'pointer' : 'default',
        touchAction: 'manipulation',
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          width: '100%',
          height: '100%',
          display: 'block',
          filter: isHovered && interactive && !isStolen ? 'brightness(1.06)' : 'none',
          transition: 'filter 0.15s ease',
        }}
      />
    </div>
  );
}
