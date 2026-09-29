import test from 'node:test';
import assert from 'node:assert/strict';
import {
  checkModuleGraph,
  scanClientDist,
  scanClientSource,
  runBoundaryVerification,
  QUESTION_BANK_SENTINELS,
} from '../verify-wits-wagers-client-boundary.mjs';

test('boundary: checkModuleGraph 内存图合法依赖通过', () => {
  const cleanModules = [
    {
      id: 'client/src/game/wits-wagers/WitsWagersGamePage.tsx',
      dependencies: ['@ldj/shared', 'react'],
      code: 'export function WitsWagersGamePage() {}',
    },
    {
      id: 'client/src/game/wits-wagers/types.ts',
      dependencies: [],
      code: 'export type WitsWagersPhase = "answering";',
    },
  ];
  const violations = checkModuleGraph(cleanModules);
  assert.equal(violations.length, 0);
});

test('boundary: checkModuleGraph 能够捕获非法服务端依赖与题库泄露', () => {
  const badDependencyModule = [
    {
      id: 'client/src/bad.ts',
      dependencies: ['@ldj/game-wits-wagers/server'],
      code: '',
    },
  ];
  const depViolations = checkModuleGraph(badDependencyModule);
  assert.equal(depViolations.length, 1);
  assert.match(depViolations[0], /非法服务端依赖/);

  const leakingModule = [
    {
      id: 'client/src/leak.ts',
      dependencies: [],
      code: `const secret = "${QUESTION_BANK_SENTINELS[0]}";`,
    },
  ];
  const leakViolations = checkModuleGraph(leakingModule);
  assert.equal(leakViolations.length, 1);
  assert.match(leakViolations[0], /未公开题库内容/);
});

test('boundary: 真实工作区源码零游戏包依赖（契约 C01）', () => {
  const violations = scanClientSource('packages/client/src');
  assert.equal(violations.length, 0, `客户端源码存在游戏包依赖: ${violations.join(', ')}`);
});

test('boundary: 真实已构建产物 dist 零泄露与零服务端引用', () => {
  const violations = scanClientDist('packages/client/dist');
  assert.equal(violations.length, 0, `客户端 dist 存在泄露: ${violations.join(', ')}`);
});

test('boundary: 全量验证入口 runBoundaryVerification 返回空违规列表', () => {
  const allViolations = runBoundaryVerification('.');
  assert.equal(allViolations.length, 0);
});
