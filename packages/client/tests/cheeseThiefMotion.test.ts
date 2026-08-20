import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveDiceCupMotionProfile,
  shouldRunDiceCupFrame,
} from '../src/shared-ui/ThreeDiceCupCanvas.tsx';

test('奶酪大盗 3D 骰盅按 MotionContext 档位逐级降级', () => {
  const full = resolveDiceCupMotionProfile('full', 'large');
  const reduced = resolveDiceCupMotionProfile('reduced', 'large');
  const minimal = resolveDiceCupMotionProfile('minimal', 'large');
  const off = resolveDiceCupMotionProfile('off', 'large');

  assert.ok(full.motionScale > reduced.motionScale);
  assert.ok(reduced.motionScale > minimal.motionScale);
  assert.equal(off.motionScale, 0);
  assert.ok(full.pixelRatioCap > reduced.pixelRatioCap);
  assert.ok(reduced.pixelRatioCap > minimal.pixelRatioCap);
  assert.equal(minimal.shadowsEnabled, false);
  assert.equal(off.knockAudioEnabled, false);
});

test('奶酪大盗 3D 骰盅仅在页面、元素可见且动画活跃时持续渲染', () => {
  assert.equal(shouldRunDiceCupFrame(true, true, true), true);
  assert.equal(shouldRunDiceCupFrame(false, true, true), false);
  assert.equal(shouldRunDiceCupFrame(true, false, true), false);
  assert.equal(shouldRunDiceCupFrame(true, true, false), false);
});

test('紧凑骰盅使用更低的渲染资源上限', () => {
  const large = resolveDiceCupMotionProfile('full', 'large');
  const compact = resolveDiceCupMotionProfile('full', 'compact');

  assert.ok(compact.pixelRatioCap < large.pixelRatioCap);
  assert.ok(compact.shadowMapSize < large.shadowMapSize);
});
