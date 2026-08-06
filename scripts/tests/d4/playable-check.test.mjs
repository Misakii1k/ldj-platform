/**
 * D4-TOOLS：playable-check 上架准入检查测试。
 * 按引擎设计「上架准入」清单校验目录：任何 catalogStatus/releaseStatus 为 playable
 * 都必须有完整授权证据；当前输出必须为「无 playable」。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runPlayableCheck, cliMessage } from '../../d4/playable-check.mjs';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));

async function fixtureLedger({ catalogStatus, releaseStatus }) {
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
              rights: {
                status: releaseStatus === 'playable' ? 'unverified' : 'unverified',
                recordId: null,
                scope: null,
                expiresAt: null,
                rightsApprover: null,
                rulesApprover: null,
              },
            },
          ],
        },
      ],
      forbidden: { aliases: [] },
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

test('当前仓库：无任何 playable，输出「无 playable」', async () => {
  const result = await runPlayableCheck(ROOT);
  assert.equal(result.pass, true);
  assert.deepEqual(result.playableGames, []);
  assert.deepEqual(result.playableRulesets, []);
  assert.match(cliMessage(result), /无 playable/);
});

test('目录存在 playable 游戏时检查失败并列出对象', async () => {
  const root = await fixtureLedger({ catalogStatus: 'playable', releaseStatus: 'internal_prototype' });
  const result = await runPlayableCheck(root);
  assert.equal(result.pass, false);
  assert.deepEqual(result.playableGames, ['samplegame']);
});

test('规则集 releaseStatus=playable 但缺少授权证据时检查失败', async () => {
  const root = await fixtureLedger({ catalogStatus: 'internal_prototype', releaseStatus: 'playable' });
  const result = await runPlayableCheck(root);
  assert.equal(result.pass, false);
  assert.deepEqual(result.playableRulesets, ['samplegame/sample_ruleset_v1']);
});

test('third-game-baseline claims.playable 必须为 false', async () => {
  const root = await fixtureLedger({ catalogStatus: 'internal_prototype', releaseStatus: 'internal_prototype' });
  const baselinePath = join(root, 'compliance', 'd4', 'third-game-baseline.json');
  const baseline = JSON.parse(await (await import('node:fs/promises')).readFile(baselinePath, 'utf8'));
  baseline.candidate.claims.playable = true;
  await (await import('node:fs/promises')).writeFile(baselinePath, JSON.stringify(baseline));
  const result = await runPlayableCheck(root);
  assert.equal(result.pass, false);
  assert.ok(result.claimViolations.length >= 1);
});
