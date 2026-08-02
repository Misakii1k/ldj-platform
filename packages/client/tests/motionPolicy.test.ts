import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  assessFrameSample,
  lowerMotionLevel,
  parseMotionPreference,
  resolveInitialMotion,
} from '../src/motion/motionPolicy.ts';

test('motion policy：解析非法偏好时回退到自动模式', () => {
  assert.equal(parseMotionPreference('full'), 'full');
  assert.equal(parseMotionPreference('unexpected'), 'auto');
  assert.equal(parseMotionPreference(null), 'auto');
});

test('motion policy：系统减少动态效果优先于手动完整档', () => {
  assert.deepEqual(
    resolveInitialMotion('full', {
      prefersReducedMotion: true,
      saveData: false,
      hardwareConcurrency: 8,
      deviceMemory: 8,
    }),
    { level: 'minimal', reason: 'reduced-motion' },
  );
  assert.deepEqual(
    resolveInitialMotion('off', {
      prefersReducedMotion: true,
      saveData: false,
    }),
    { level: 'off', reason: 'user' },
  );
});

test('motion policy：自动模式根据节省流量和设备能力保守分档', () => {
  assert.deepEqual(
    resolveInitialMotion('auto', {
      prefersReducedMotion: false,
      saveData: true,
      hardwareConcurrency: 8,
      deviceMemory: 8,
    }),
    { level: 'minimal', reason: 'save-data' },
  );
  assert.deepEqual(
    resolveInitialMotion('auto', {
      prefersReducedMotion: false,
      saveData: false,
      hardwareConcurrency: 2,
      deviceMemory: 8,
    }),
    { level: 'minimal', reason: 'device' },
  );
  assert.deepEqual(
    resolveInitialMotion('auto', {
      prefersReducedMotion: false,
      saveData: false,
      hardwareConcurrency: 8,
      deviceMemory: 4,
    }),
    { level: 'reduced', reason: 'device' },
  );
  assert.deepEqual(
    resolveInitialMotion('auto', {
      prefersReducedMotion: false,
      saveData: false,
      hardwareConcurrency: 8,
      deviceMemory: 8,
    }),
    { level: 'full', reason: 'default' },
  );
});

test('motion policy：运行帧样本按阈值提出降级档位', () => {
  assert.deepEqual(assessFrameSample({ averageFps: 24, longFrameRatio: 0.1 }), {
    level: 'minimal',
    reason: 'runtime',
  });
  assert.deepEqual(assessFrameSample({ averageFps: 55, longFrameRatio: 0.45 }), {
    level: 'minimal',
    reason: 'runtime',
  });
  assert.deepEqual(assessFrameSample({ averageFps: 40, longFrameRatio: 0.1 }), {
    level: 'reduced',
    reason: 'runtime',
  });
  assert.equal(assessFrameSample({ averageFps: 58, longFrameRatio: 0.05 }), null);
});

test('motion policy：档位合并只允许保持或降低', () => {
  assert.equal(lowerMotionLevel('full', 'reduced'), 'reduced');
  assert.equal(lowerMotionLevel('reduced', 'full'), 'reduced');
  assert.equal(lowerMotionLevel('minimal', 'reduced'), 'minimal');
  assert.equal(lowerMotionLevel('off', 'full'), 'off');
});
