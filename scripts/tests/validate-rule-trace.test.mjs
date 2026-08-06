import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateRuleTrace, validateRuleTraces } from '../validate-rule-trace.mjs';

function validTrace() {
  return {
    schemaVersion: 1,
    rulesetId: 'sample_ruleset_v1',
    gameId: 'sample',
    kind: 'platform_variant',
    releaseStatus: 'internal_prototype',
    sourceDocuments: ['docs/superpowers/specs/2026-08-02-shared-game-engine-design.md'],
    policyVersions: { rulesetPolicy: 'sample-policy-v1' },
    digitalBoundaries: {},
    differences: [
      {
        differenceId: 'SAMPLE-DIFF-001',
        classification: 'KEEP_COMPAT',
        baselineRulesetId: 'legacy_sample_v1',
        baselineBehavior: 'The legacy baseline allowed a single legal play path.',
        targetBehavior: 'Retain the legacy legal play path in the house ruleset.',
        relatedClauseIds: ['SAMPLE-CLAUSE-001']
      }
    ],
    clauses: [
      {
        clauseId: 'SAMPLE-CLAUSE-001',
        sourceSection: 'Sample section (line 1)',
        sourceText: 'A sample clause that must be kept.',
        transitionIds: ['sample.transition.one'],
        plannedTestIds: ['sample_clause_test']
      }
    ]
  };
}

test('验证器接受最小合法规则追踪', () => {
  assert.deepEqual(validateRuleTrace(validTrace()), []);
});

test('验证器拒绝空的 clauses 数组', () => {
  const trace = validTrace();
  trace.clauses = [];
  assert.deepEqual(validateRuleTrace(trace), [
    'clauses must be a non-empty array',
    'difference SAMPLE-DIFF-001: relatedClauseIds references unknown clauseId SAMPLE-CLAUSE-001',
  ]);
});

test('验证器拒绝重复的 clauseId', () => {
  const trace = validTrace();
  trace.clauses.push(globalThis.structuredClone(trace.clauses[0]));
  assert.deepEqual(validateRuleTrace(trace), [
    'duplicate clauseId: SAMPLE-CLAUSE-001',
  ]);
});

test('验证器拒绝未知的 difference classification', () => {
  const trace = validTrace();
  trace.differences[0].classification = 'FANCY';
  assert.deepEqual(validateRuleTrace(trace), [
    'difference SAMPLE-DIFF-001: classification must be one of KEEP_COMPAT, CHANGE_RULESET, REMOVE_PLAYABLE',
  ]);
});

test('验证器拒绝引用缺失 clauseId 的 relatedClauseIds', () => {
  const trace = validTrace();
  trace.differences[0].relatedClauseIds = ['GHOST-CLAUSE'];
  assert.deepEqual(validateRuleTrace(trace), [
    'difference SAMPLE-DIFF-001: relatedClauseIds references unknown clauseId GHOST-CLAUSE',
  ]);
});

test('验证器拒绝无完整授权证据的 playable 状态', () => {
  const trace = validTrace();
  trace.releaseStatus = 'playable';
  assert.deepEqual(validateRuleTrace(trace), [
    'releaseStatus playable requires approvedEvidence with rightsStatus=approved and non-empty recordId, scope, expiresAt, rightsApprover, rulesApprover',
  ]);
});

test('验证器接受带完整授权证据的 playable 状态', () => {
  const trace = validTrace();
  trace.releaseStatus = 'playable';
  trace.approvedEvidence = {
    rightsStatus: 'approved',
    recordId: 'RIGHTS-REC-001',
    scope: 'cn-platform',
    expiresAt: '2027-01-01',
    rightsApprover: 'legal-team',
    rulesApprover: 'rules-board'
  };
  assert.deepEqual(validateRuleTrace(trace), []);
});

test('验证器拒绝与文件名字不匹配的 rulesetId', () => {
  const trace = validTrace();
  assert.deepEqual(validateRuleTrace(trace, 'other_file_v1'), [
    'rulesetId does not match file name other_file_v1',
  ]);
});

test('validateRuleTraces 扫描根目录并带文件名前缀报告每个文件的错误', async () => {
  const root = await mkdtemp(join(tmpdir(), 'validate-rule-trace-'));
  const rulesDir = join(root, 'compliance', 'rules');
  await mkdir(rulesDir, { recursive: true });

  const good = validTrace();
  good.rulesetId = 'good';
  await writeFile(join(rulesDir, 'good.json'), JSON.stringify(good));

  const renamed = validTrace();
  renamed.rulesetId = 'good';
  await writeFile(join(rulesDir, 'bad.json'), JSON.stringify(renamed));

  const playable = validTrace();
  playable.rulesetId = 'playable';
  playable.releaseStatus = 'playable';
  await writeFile(join(rulesDir, 'playable.json'), JSON.stringify(playable));

  assert.deepEqual(await validateRuleTraces(root), [
    'bad.json: rulesetId does not match file name bad',
    'playable.json: releaseStatus playable requires approvedEvidence with rightsStatus=approved and non-empty recordId, scope, expiresAt, rightsApprover, rulesApprover',
  ]);
});
