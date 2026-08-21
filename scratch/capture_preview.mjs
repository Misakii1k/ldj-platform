import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const artifactDir = 'C:\\Users\\87850\\.gemini\\antigravity\\brain\\62d2856a-d39c-47c4-ba46-493928fc7228';
const stylesCss = fs.readFileSync('d:/项目/packages/client/src/styles.css', 'utf-8');
const threeCjs = fs.readFileSync('d:/项目/node_modules/three/build/three.cjs', 'utf-8');

const htmlContent = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>WebGL 3D 骰盅与豪华桌游翻牌引擎实机呈现</title>
  <style>
    ${stylesCss}
    
    body {
      background: #060911;
      color: #f8fafc;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
      margin: 0;
      padding: 40px;
    }
    
    .showcase-header {
      text-align: center;
      margin-bottom: 40px;
    }
    
    .showcase-header h1 {
      font-size: 2.2rem;
      color: #fef08a;
      margin: 0 0 8px;
      text-shadow: 0 0 20px rgba(254, 240, 138, 0.4);
    }
    
    .showcase-header p {
      color: #94a3b8;
      font-size: 1.1rem;
      margin: 0;
    }

    .section-title {
      font-size: 1.4rem;
      color: #38bdf8;
      border-bottom: 2px solid rgba(56, 189, 248, 0.3);
      padding-bottom: 8px;
      margin: 40px 0 24px;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    
    .preview-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 32px;
      justify-items: center;
    }

    .preview-card-item {
      background: rgba(15, 23, 42, 0.75);
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 20px;
      padding: 24px 20px;
      width: 100%;
      max-width: 320px;
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      align-items: center;
      box-shadow: 0 16px 36px rgba(0,0,0,0.6), inset 0 1px 2px rgba(255, 255, 255, 0.15);
    }
    
    .preview-label {
      font-size: 0.95rem;
      font-weight: 800;
      color: #e2e8f0;
      margin-bottom: 16px;
      text-align: center;
    }
    
    .webgl-holder {
      width: 200px;
      height: 210px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
  </style>
  <script>
    var module = { exports: {} };
    var exports = module.exports;
  </script>
  <script>
    ${threeCjs}
  </script>
  <script>
    window.THREE = module.exports;
  </script>
</head>
<body>
  <div class="showcase-header">
    <h1>🎲 WebGL 3D 拟真物理骰盅与顶级桌游翻牌引擎</h1>
    <p>Three.js 硬件级 3D 倒角立方体 · 真实光影阴影 · 3D 视差微倾斜 · 全息流光烫金暗纹</p>
  </div>

  <h2 class="section-title">一、WebGL 3D 真实拟真骰盅（Three.js）各状态与多骰效果</h2>
  <div class="preview-grid">
    <!-- 1. 木质扣盖态 -->
    <div class="preview-card-item">
      <div class="preview-label">1. 经典车削木质（扣盖私密态）</div>
      <div class="webgl-holder" id="canvas-wood-closed"></div>
      <div class="shared-cup-info" style="margin-top: 10px; text-align: center;">
        <div class="shared-cup-owner" style="font-weight:700; color:#fef08a;">我的骰盅（点数保护中）</div>
        <div class="shared-cup-hint" style="color:#38bdf8; font-size:0.85rem; margin-top:4px;">👆 按住掀开 3D 骰盅查看</div>
      </div>
    </div>

    <!-- 2. 掀开 1 骰（中式红 4 点） -->
    <div class="preview-card-item">
      <div class="preview-label">2. 长按掀起（单骰 · 4 点醒来）</div>
      <div class="webgl-holder" id="canvas-wood-open"></div>
      <div class="shared-cup-info" style="margin-top: 10px; text-align: center;">
        <div class="shared-cup-hint" style="color:#4ade80; font-weight:800; font-size:0.9rem;">👀 松开手指自动扣盖（4 点醒来）</div>
      </div>
    </div>

    <!-- 3. 绒布皮革主题（多骰 3 粒） -->
    <div class="preview-card-item">
      <div class="preview-label">3. 尊贵洋红绒布（多骰 · 3 粒立体阵列）</div>
      <div class="webgl-holder" id="canvas-felt-open"></div>
      <div class="shared-cup-info" style="margin-top: 10px; text-align: center;">
        <div class="shared-cup-owner" style="font-weight:700; color:#f472b6;">大话骰 · 3 粒（共 6 点）</div>
        <div class="shared-cup-hint" style="color:#4ade80; font-size:0.85rem; margin-top:4px;">👀 松开手指自动扣盖</div>
      </div>
    </div>

    <!-- 4. 暗黑金属机甲（吹牛 5 粒） -->
    <div class="preview-card-item">
      <div class="preview-label">4. 暗黑拉丝金属（多骰 · 5 粒立体阵列）</div>
      <div class="webgl-holder" id="canvas-metal-open"></div>
      <div class="shared-cup-info" style="margin-top: 10px; text-align: center;">
        <div class="shared-cup-owner" style="font-weight:700; color:#94a3b8;">吹牛骰局 · 5 粒（共 16 点）</div>
        <div class="shared-cup-hint" style="color:#4ade80; font-size:0.85rem; margin-top:4px;">👀 松开手指自动扣盖</div>
      </div>
    </div>
  </div>

  <h2 class="section-title">二、豪华实体桌游翻牌引擎（3D 视差 Tilt + 全息流光 Holo Foil）</h2>
  <div class="preview-grid">
    <!-- 1. 谁是卧底（机密牛皮纸 · 烫金火漆封印） -->
    <div class="preview-card-item">
      <div class="preview-label">1. 谁是卧底（机密档案 · 烫金封印）</div>
      <div class="identity-flip-container theme-confidential camp-neutral" style="--tilt-x: 6deg; --tilt-y: -8deg; --glare-x: 35%; --glare-y: 25%;">
        <div class="identity-flip-card">
          <div class="identity-card-inner">
            <div class="identity-card-back">
              <div class="identity-card-holo-foil"></div>
              <div class="identity-card-back__border">
                <div class="identity-card-back__seal">
                  <span class="identity-card-back__emblem"></span>
                  <strong class="identity-card-back__badge">机密档案 · 阅后即焚</strong>
                </div>
                <div class="identity-card-back__action-tip">
                  <span class="tip-press"><span class="tip-finger">👆</span> 按住卡牌悄悄查看</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 2. 谁是卧底（3D 翻开 · 卧底词揭示态） -->
    <div class="preview-card-item">
      <div class="preview-label">2. 谁是卧底（3D 翻开 · 秘密词条）</div>
      <div class="identity-flip-container theme-confidential camp-neutral" style="--tilt-x: -4deg; --tilt-y: 6deg; --glare-x: 65%; --glare-y: 35%;">
        <div class="identity-flip-card is-revealed is-locked">
          <div class="identity-card-inner">
            <div class="identity-card-front">
              <div class="identity-card-front__aura"></div>
              <div class="identity-card-holo-foil"></div>
              <button class="identity-card-lock-btn is-locked">🔓 已常驻</button>
              <div class="identity-card-front__header">
                <span class="identity-card-front__camp-tag">秘密词条</span>
              </div>
              <div class="identity-card-front__content">
                <h3 class="identity-card-front__role-name">红富士苹果</h3>
                <div class="identity-card-front__secret-word-box">
                  <span class="secret-label">秘密词条</span>
                  <strong class="secret-word">红富士苹果</strong>
                </div>
                <div class="identity-card-front__hints">
                  <p class="identity-hint-text">牢记你的专属词条，在后续发言中适度描述，切勿直接念出。</p>
                </div>
              </div>
              <div class="identity-card-front__footer">
                <span class="identity-card-front__safe-hint">👀 离开页面将自动遮挡</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 3. 狼人杀（哥特暗夜 · 狼人阵营揭示态） -->
    <div class="preview-card-item">
      <div class="preview-label">3. 狼人杀（哥特暗夜 · 狼人阵营）</div>
      <div class="identity-flip-container theme-gothic camp-evil" style="--tilt-x: 5deg; --tilt-y: 5deg; --glare-x: 70%; --glare-y: 60%;">
        <div class="identity-flip-card is-revealed is-locked">
          <div class="identity-card-inner">
            <div class="identity-card-front">
              <div class="identity-card-front__aura"></div>
              <div class="identity-card-holo-foil"></div>
              <button class="identity-card-lock-btn is-locked">🔓 已常驻</button>
              <div class="identity-card-front__header">
                <span class="identity-card-front__camp-tag">狼人阵营 · 夜袭猎杀</span>
              </div>
              <div class="identity-card-front__content">
                <div class="identity-card-front__artwork-wrap">
                  <img src="/assets/roles/werewolf.png" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' viewBox=\\'0 0 64 64\\'><text y=\\'48\\' font-size=\\'48\\'>🐺</text></svg>'" alt="狼人" class="identity-card-front__artwork" />
                </div>
                <h3 class="identity-card-front__role-name">狼人</h3>
                <div class="identity-card-front__hints">
                  <p class="identity-hint-text">每晚与狼同伴商讨并袭击一名玩家；白天隐藏身份伪装好人。</p>
                </div>
              </div>
              <div class="identity-card-front__footer">
                <span class="identity-card-front__safe-hint">👀 松手瞬间自动遮扣防窥</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 4. 伪人测试（赛博终端 · 触发词揭示态） -->
    <div class="preview-card-item">
      <div class="preview-label">4. 伪人测试（赛博终端 · 触发词）</div>
      <div class="identity-flip-container theme-cyber camp-echo" style="--tilt-x: -6deg; --tilt-y: -6deg; --glare-x: 30%; --glare-y: 70%;">
        <div class="identity-flip-card is-revealed is-locked">
          <div class="identity-card-inner">
            <div class="identity-card-front">
              <div class="identity-card-front__aura"></div>
              <div class="identity-card-holo-foil"></div>
              <button class="identity-card-lock-btn is-locked">🔓 已常驻</button>
              <div class="identity-card-front__header">
                <span class="identity-card-front__camp-tag">异常伪人阵营</span>
              </div>
              <div class="identity-card-front__content">
                <h3 class="identity-card-front__role-name">伪人（Echo）</h3>
                <div class="identity-card-front__secret-word-box">
                  <span class="secret-label">秘密触发词</span>
                  <strong class="secret-word">闪电</strong>
                </div>
                <div class="identity-card-front__hints">
                  <p class="identity-hint-text">【绝密】你必须在回答中自然藏入触发词，切勿被判官察觉！</p>
                </div>
              </div>
              <div class="identity-card-front__footer">
                <span class="identity-card-front__safe-hint">👀 松手瞬间自动遮扣防窥</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <script>
    function createDiceFaceTexture(value) {
      const size = 256;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');

      const bgGrad = ctx.createRadialGradient(size / 2, size / 2, 10, size / 2, size / 2, size * 0.7);
      bgGrad.addColorStop(0, '#ffffff');
      bgGrad.addColorStop(0.85, '#f8fafc');
      bgGrad.addColorStop(1, '#e2e8f0');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, size, size);

      ctx.lineWidth = 14;
      ctx.strokeStyle = 'rgba(203, 213, 225, 0.4)';
      ctx.strokeRect(7, 7, size - 14, size - 14);

      const isRed = value === 1 || value === 4;
      const dotColor = isRed ? '#dc2626' : '#1e293b';
      const dotGlow = isRed ? '#ef4444' : '#334155';

      const drawDot = (xPct, yPct, radius) => {
        const x = (xPct / 100) * size;
        const y = (yPct / 100) * size;

        ctx.save();
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        const grad = ctx.createRadialGradient(x - radius * 0.3, y - radius * 0.3, 1, x, y, radius);
        grad.addColorStop(0, dotGlow);
        grad.addColorStop(0.8, dotColor);
        grad.addColorStop(1, isRed ? '#991b1b' : '#0f172a');
        ctx.fillStyle = grad;
        ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
        ctx.shadowBlur = 6;
        ctx.shadowOffsetX = 1;
        ctx.shadowOffsetY = 2;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(x - radius * 0.35, y - radius * 0.35, radius * 0.22, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
        ctx.shadowColor = 'transparent';
        ctx.fill();
        ctx.restore();
      };

      const bigR = 36;
      const normalR = 22;

      if (value === 1) drawDot(50, 50, bigR);
      else if (value === 2) { drawDot(28, 28, normalR); drawDot(72, 72, normalR); }
      else if (value === 3) { drawDot(28, 28, normalR); drawDot(50, 50, normalR); drawDot(72, 72, normalR); }
      else if (value === 4) { drawDot(30, 30, normalR); drawDot(70, 30, normalR); drawDot(30, 70, normalR); drawDot(70, 70, normalR); }
      else if (value === 5) { drawDot(28, 28, normalR); drawDot(72, 28, normalR); drawDot(50, 50, normalR); drawDot(28, 72, normalR); drawDot(72, 72, normalR); }
      else if (value === 6) {
        drawDot(30, 24, normalR * 0.95); drawDot(30, 50, normalR * 0.95); drawDot(30, 76, normalR * 0.95);
        drawDot(70, 24, normalR * 0.95); drawDot(70, 50, normalR * 0.95); drawDot(70, 76, normalR * 0.95);
      }

      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      return texture;
    }

    function init3DScene(containerId, { isLifted, theme, diceValues }) {
      const container = document.getElementById(containerId);
      if (!container || !window.THREE) return;
      const width = 200;
      const height = 210;

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 100);
      camera.position.set(0, 4.8, 6.8);
      camera.lookAt(0, 0.4, 0);

      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
      renderer.setSize(width, height);
      renderer.setPixelRatio(2);
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.15;
      container.appendChild(renderer.domElement);

      const ambientLight = new THREE.AmbientLight(0xffffff, 0.9);
      scene.add(ambientLight);

      const mainLight = new THREE.DirectionalLight(0xfff5e6, 2.2);
      mainLight.position.set(4, 9, 5);
      mainLight.castShadow = true;
      mainLight.shadow.bias = -0.001;
      scene.add(mainLight);

      const fillLight = new THREE.DirectionalLight(0x93c5fd, 1.0);
      fillLight.position.set(-5, 6, -3);
      scene.add(fillLight);

      const rimLight = new THREE.PointLight(0xfef08a, 1.5, 10);
      rimLight.position.set(0, 6, 2);
      scene.add(rimLight);

      const matColor = theme === 'felt' ? 0x700c36 : theme === 'metal' ? 0x1e293b : 0x164e2b;
      const matGeo = new THREE.CylinderGeometry(2.1, 2.1, 0.12, 48);
      const matMat = new THREE.MeshStandardMaterial({ color: matColor, roughness: 0.85, metalness: 0.05 });
      const matMesh = new THREE.Mesh(matGeo, matMat);
      matMesh.position.y = -0.06;
      matMesh.receiveShadow = true;
      scene.add(matMesh);

      const rimWoodColor = theme === 'felt' ? 0x4a0422 : theme === 'metal' ? 0x334155 : 0x542c13;
      const rimGeo = new THREE.TorusGeometry(2.12, 0.12, 16, 48);
      const rimMat = new THREE.MeshStandardMaterial({ color: rimWoodColor, roughness: 0.35, metalness: 0.25 });
      const rimMesh = new THREE.Mesh(rimGeo, rimMat);
      rimMesh.rotation.x = Math.PI / 2;
      rimMesh.position.y = 0.02;
      scene.add(rimMesh);

      const textures = [1, 2, 3, 4, 5, 6].map(num => createDiceFaceTexture(num));
      const diceMaterials = [
        new THREE.MeshStandardMaterial({ map: textures[0], roughness: 0.18, metalness: 0.05 }),
        new THREE.MeshStandardMaterial({ map: textures[5], roughness: 0.18, metalness: 0.05 }),
        new THREE.MeshStandardMaterial({ map: textures[1], roughness: 0.18, metalness: 0.05 }),
        new THREE.MeshStandardMaterial({ map: textures[4], roughness: 0.18, metalness: 0.05 }),
        new THREE.MeshStandardMaterial({ map: textures[2], roughness: 0.18, metalness: 0.05 }),
        new THREE.MeshStandardMaterial({ map: textures[3], roughness: 0.18, metalness: 0.05 }),
      ];

      const orientDie = (mesh, topValue) => {
        mesh.rotation.set(0, 0, 0);
        switch (topValue) {
          case 1: mesh.rotation.z = -Math.PI / 2; break;
          case 2: break;
          case 3: mesh.rotation.x = Math.PI / 2; break;
          case 4: mesh.rotation.x = -Math.PI / 2; break;
          case 5: mesh.rotation.x = Math.PI; break;
          case 6: mesh.rotation.z = Math.PI / 2; break;
        }
        mesh.rotation.y += 0.2;
      };

      const values = diceValues;
      const dieSize = values.length === 1 ? 0.76 : values.length <= 3 ? 0.58 : 0.46;
      const dieGeo = new THREE.BoxGeometry(dieSize, dieSize, dieSize);

      const layoutPositions = values.length === 1
        ? [[0, 0]]
        : values.length === 2
          ? [[-0.45, 0], [0.45, 0]]
          : values.length === 3
            ? [[0, -0.45], [-0.5, 0.4], [0.5, 0.4]]
            : [[-0.5, -0.5], [0.5, -0.5], [0, 0], [-0.5, 0.5], [0.5, 0.5]];

      values.forEach((val, idx) => {
        const dieMesh = new THREE.Mesh(dieGeo, diceMaterials);
        const pos = layoutPositions[idx] || [0, 0];
        dieMesh.position.set(pos[0], dieSize / 2, pos[1]);
        dieMesh.castShadow = true;
        dieMesh.receiveShadow = true;
        orientDie(dieMesh, val);
        scene.add(dieMesh);
      });

      const cupGroup = new THREE.Group();
      scene.add(cupGroup);

      const cupColor = theme === 'felt' ? 0x831843 : theme === 'metal' ? 0x334155 : 0x78350f;
      const cupMetalness = theme === 'metal' ? 0.65 : 0.15;
      const cupRoughness = theme === 'metal' ? 0.3 : 0.45;

      const cupBodyMat = new THREE.MeshStandardMaterial({ color: cupColor, metalness: cupMetalness, roughness: cupRoughness });
      const goldMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, metalness: 0.88, roughness: 0.22 });

      const cupBodyGeo = new THREE.CylinderGeometry(1.2, 1.7, 2.3, 40, 1, true);
      const cupBodyMesh = new THREE.Mesh(cupBodyGeo, cupBodyMat);
      cupBodyMesh.position.y = 1.15;
      cupBodyMesh.castShadow = true;
      cupGroup.add(cupBodyMesh);

      const cupTopGeo = new THREE.CylinderGeometry(1.2, 1.2, 0.1, 40);
      const cupTopMesh = new THREE.Mesh(cupTopGeo, cupBodyMat);
      cupTopMesh.position.y = 2.3;
      cupGroup.add(cupTopMesh);

      const knobGeo = new THREE.SphereGeometry(0.32, 24, 24);
      const knobMesh = new THREE.Mesh(knobGeo, goldMat);
      knobMesh.position.y = 2.55;
      knobMesh.castShadow = true;
      cupGroup.add(knobMesh);

      const topRingGeo = new THREE.TorusGeometry(1.22, 0.05, 12, 40);
      const topRingMesh = new THREE.Mesh(topRingGeo, goldMat);
      topRingMesh.rotation.x = Math.PI / 2;
      topRingMesh.position.y = 2.3;
      cupGroup.add(topRingMesh);

      const bottomRingGeo = new THREE.TorusGeometry(1.72, 0.06, 12, 40);
      const bottomRingMesh = new THREE.Mesh(bottomRingGeo, goldMat);
      bottomRingMesh.rotation.x = Math.PI / 2;
      bottomRingMesh.position.y = 0.06;
      cupGroup.add(bottomRingMesh);

      if (isLifted) {
        cupGroup.position.y = 1.9;
        cupGroup.rotation.x = -0.35;
      }

      renderer.render(scene, camera);
    }

    window.addEventListener('DOMContentLoaded', () => {
      init3DScene('canvas-wood-closed', { isLifted: false, theme: 'wood', diceValues: [4] });
      init3DScene('canvas-wood-open', { isLifted: true, theme: 'wood', diceValues: [4] });
      init3DScene('canvas-felt-open', { isLifted: true, theme: 'felt', diceValues: [1, 2, 3] });
      init3DScene('canvas-metal-open', { isLifted: true, theme: 'metal', diceValues: [2, 3, 4, 3, 4] });
    });
  </script>
</body>
</html>
`;

async function main() {
  const browser = await chromium.launch({
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist']
  });
  const page = await browser.newPage({ viewport: { width: 1360, height: 1250 } });
  await page.setContent(htmlContent, { waitUntil: 'load' });
  await page.waitForTimeout(1000);
  
  const shotPath = path.join(artifactDir, '3d_dice_and_card_engine_showcase.png');
  await page.screenshot({ path: shotPath, fullPage: true });
  console.log('Screenshot saved to:', shotPath);
  await browser.close();
}

main().catch(console.error);
