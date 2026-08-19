import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  settleQuaternion,
  DIE_FACE_NORMALS,
} from '../src/shared-ui/ThreeDiceCupCanvas.tsx';

const WORLD_UP = new THREE.Vector3(0, 1, 0);

/** 断言 q 使 value 面的法向旋转后与 +Y 对齐 */
function assertFaceUp(value: number, q: THREE.Quaternion) {
  const [x, y, z] = DIE_FACE_NORMALS[value];
  const rotated = new THREE.Vector3(x, y, z).applyQuaternion(q);
  assert.ok(
    rotated.distanceTo(WORLD_UP) < 1e-6,
    `value ${value}: 面法向旋转后为 (${rotated.x.toFixed(4)}, ${rotated.y.toFixed(4)}, ${rotated.z.toFixed(4)})，应为 +Y`
  );
}

test('settleQuaternion 使每个点数（1~6）的面朝上（+Y）', () => {
  for (let v = 1; v <= 6; v++) {
    assertFaceUp(v, settleQuaternion(v));
  }
});

test('settleQuaternion 附加 Y 轴偏转后顶面不变（自然微偏转安全性）', () => {
  for (let v = 1; v <= 6; v++) {
    for (const jitter of [-0.35, -0.1, 0, 0.2, 0.35]) {
      assertFaceUp(v, settleQuaternion(v, jitter));
    }
  }
});

test('settleQuaternion 结果为单位四元数（可直接用于 slerp）', () => {
  for (let v = 1; v <= 6; v++) {
    const q = settleQuaternion(v, 0.25);
    assert.ok(Math.abs(q.length() - 1) < 1e-6, `value ${v}: |q| = ${q.length()}`);
  }
});

test('settleQuaternion 对非法点数回退为 2 点朝上（恒等姿态）', () => {
  const q = settleQuaternion(99);
  const rotated = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
  assert.ok(rotated.distanceTo(WORLD_UP) < 1e-6);
});

test('回归：修正旧版 orientDie 的 1↔6、3↔4 镜像 bug', () => {
  // 旧实现的欧拉（已验证实际把 1 显示成 6、3 显示成 4 等）
  const legacy = {
    1: new THREE.Euler(0, 0, -Math.PI / 2),
    3: new THREE.Euler(Math.PI / 2, 0, 0),
    4: new THREE.Euler(-Math.PI / 2, 0, 0),
    6: new THREE.Euler(0, 0, Math.PI / 2),
  };
  for (const [valueStr, euler] of Object.entries(legacy)) {
    const value = Number(valueStr);
    const q = new THREE.Quaternion().setFromEuler(euler);
    const [x, y, z] = DIE_FACE_NORMALS[value];
    const rotated = new THREE.Vector3(x, y, z).applyQuaternion(q);
    // 旧实现该面不朝上 → 新实现必须朝上
    assert.ok(rotated.y < 0.99, `value ${value}: 旧实现本就不朝上，前提成立`);
    assertFaceUp(value, settleQuaternion(value));
  }
});
