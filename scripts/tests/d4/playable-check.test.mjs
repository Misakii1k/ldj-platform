/**
 * D4-TOOLS：playable-check 上架准入检查测试。
 * 按引擎设计「上架准入」清单校验目录：任何 catalogStatus/releaseStatus 为 playable
 * 都必须有完整授权证据；pass 语义（D5 P2b）：存在 playable 且证据完整即通过，
 * 不再要求「必须无 playable」。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runPlayableCheck, cliMessage } from '../../d4/playable-check.mjs';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));

/** 完整授权证据样例（与上架台账一致的五字段 + approved） */
const COMPLETE_RIGHTS = {
  status: 'approved',
  recordId: 'internal-admission-d5-test-001',
  scope: 'internal_platform_launch',
  expiresAt: '2099-12-31',
  rightsApprover: 'internal-rights-admin',
  rulesApprover: 'internal-rules-committee',
};

const UNVERIFIED_RIGHTS = {
  status: 'unverified',
  recordId: null,
  scope: null,
  expiresAt: null,
  rightsApprover: null,
  rulesApprover: null,
};

async function fixtureLedger({ catalogStatus, releaseStatus, rights }) {
  const root = await mkdtemp(join(tmpdir(), 'd4-playable-'));
  await mkdir(join(root, 'compliance', 'd1'), { recursive: true });
  await mkdir(join(root, 'compliance', 'd4'), { recursive: true });
  await writeFile(
    join(root, 'compliance', 'd1', 'game-admission.json'),
    JSON.stringify({
      schemaVersion: 1,
      frozenAt: '2026-08-05',
      games: [
        {
          gameId: 'samplegame',
          catalogStatus,
          rulesets: [
            {
              rulesetId: 'sample_ruleset_v1',
              releaseStatus,
              rights,
            },
          ],
        },
      ],
      forbidden: { canonicalName: '骗子酒馆', aliases: ["Liar's Bar", 'liars-bar', 'liars_bar'] },
    }),
  );
  await writeFile(
    join(root, 'compliance', 'd4', 'third-game-baseline.json'),
    JSON.stringify({
      schemaVersion: 1,
      candidate: { gameId: 'werewolf', claims: { playable: false } },
    }),
  );
  return root;
}

test('当前仓库：上架游戏均带完整授权证据 → pass', async () => {
  const result = await runPlayableCheck(ROOT);
  assert.equal(result.pass, true, `仓库 playable 检查应通过：${result.errors.join('；')}`);
  // 上架十款必须在台账中声明 playable；uno 保持 blocked_rights 不出现在 playable 列表
  assert.deepEqual([...result.playableGames].sort(), ['bell-clash', 'cheese-thief', 'durian', 'echo-judge', 'goose-relay', 'landlord', 'loveletter', 'night-testimony', 'undercover', 'werewolf']);
  assert.ok(!result.playableGames.includes('uno'), 'uno 不得出现在 playable 游戏列表');
  assert.ok(result.playableRulesets.length >= 11, '至少 classic/blank + legacy/open_kill + landlord legacy + durian/loveletter + cheese-thief/goose-relay + night-testimony + bell-clash/echo-judge 规则集');
  for (const ruleset of result.playableRulesets) {
    assert.ok(
      ruleset.startsWith('undercover/') || ruleset.startsWith('werewolf/') || ruleset.startsWith('landlord/')
      || ruleset.startsWith('durian/') || ruleset.startsWith('loveletter/')
      || ruleset.startsWith('cheese-thief/') || ruleset.startsWith('goose-relay/')
      || ruleset.startsWith('night-testimony/') || ruleset.startsWith('bell-clash/')
      || ruleset.startsWith('echo-judge/'),
    );
  }
  assert.ok(!cliMessage(result).includes('无 playable'));
  assert.match(cliMessage(result), /完整授权证据/);
});

test('目录存在 playable 游戏但缺少授权证据时检查失败并列出对象', async () => {
  const root = await fixtureLedger({ catalogStatus: 'playable', releaseStatus: 'internal_prototype', rights: UNVERIFIED_RIGHTS });
  const result = await runPlayableCheck(root);
  assert.equal(result.pass, false);
  assert.deepEqual(result.playableGames, ['samplegame']);
  assert.ok(result.errors.some((error) => error.includes('playable 缺少完整授权证据')));
});

test('规则集 releaseStatus=playable 但缺少授权证据时检查失败', async () => {
  const root = await fixtureLedger({ catalogStatus: 'internal_prototype', releaseStatus: 'playable', rights: UNVERIFIED_RIGHTS });
  const result = await runPlayableCheck(root);
  assert.equal(result.pass, false);
  assert.deepEqual(result.playableRulesets, ['samplegame/sample_ruleset_v1']);
  assert.ok(result.errors.some((error) => error.includes('playable 缺少完整授权证据')));
});

test('playable 带完整授权证据时通过（新 pass 语义）', async () => {
  const root = await fixtureLedger({ catalogStatus: 'playable', releaseStatus: 'playable', rights: COMPLETE_RIGHTS });
  const result = await runPlayableCheck(root);
  assert.equal(result.pass, true, `完整证据应通过：${result.errors.join('；')}`);
  assert.deepEqual(result.playableGames, ['samplegame']);
  assert.deepEqual(result.playableRulesets, ['samplegame/sample_ruleset_v1']);
  assert.match(cliMessage(result), /完整授权证据/);
});

test('rights 五字段任一为空但 status=approved 时仍失败', async () => {
  const root = await fixtureLedger({
    catalogStatus: 'playable',
    releaseStatus: 'playable',
    rights: { ...COMPLETE_RIGHTS, expiresAt: '' },
  });
  const result = await runPlayableCheck(root);
  assert.equal(result.pass, false);
  assert.ok(result.errors.some((error) => error.includes('playable 缺少完整授权证据')));
});

test('third-game-baseline claims.playable 必须为 false', async () => {
  const root = await fixtureLedger({ catalogStatus: 'internal_prototype', releaseStatus: 'internal_prototype', rights: UNVERIFIED_RIGHTS });
  const baselinePath = join(root, 'compliance', 'd4', 'third-game-baseline.json');
  const baseline = JSON.parse(await (await import('node:fs/promises')).readFile(baselinePath, 'utf8'));
  baseline.candidate.claims.playable = true;
  await (await import('node:fs/promises')).writeFile(baselinePath, JSON.stringify(baseline));
  const result = await runPlayableCheck(root);
  assert.equal(result.pass, false);
  assert.ok(result.claimViolations.length >= 1);
});
