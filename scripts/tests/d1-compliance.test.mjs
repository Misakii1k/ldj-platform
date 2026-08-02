import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateAdmissionLedger } from '../d1-compliance.mjs';

function validLedger() {
  return {
    schemaVersion: 1,
    frozenAt: '2026-08-02',
    games: [
      {
        gameId: 'undercover',
        catalogStatus: 'internal_prototype',
        rulesets: [
          {
            rulesetId: 'undercover_classic_v1',
            kind: 'platform_variant',
            releaseStatus: 'internal_prototype',
            sourceDocuments: ['docs/superpowers/specs/2026-08-02-shared-game-engine-design.md#已确认的谁是卧底规则集'],
            includedExtensions: [],
            excludedExtensions: ['undercover_blank_v1'],
            digitalAdaptations: ['发言与投票使用服务端计时器'],
            rights: {
              status: 'unverified',
              recordId: null,
              scope: null,
              expiresAt: null,
              rightsApprover: null,
              rulesApprover: null
            }
          }
        ]
      }
    ],
    forbidden: {
      canonicalName: '骗子酒馆',
      aliases: ["Liar's Bar", 'liars-bar', 'liars_bar'],
      productScopes: ['packages', 'dist', 'registry', 'catalog', 'routes', 'static_assets', 'release_archives'],
      researchRoot: 'research/quarantined/liars-bar'
    }
  };
}

test('台账接受证据未核验且不可玩的规则集', () => {
  assert.deepEqual(validateAdmissionLedger(validLedger()), []);
});

test('台账拒绝把证据未核验的规则集标记为 playable', () => {
  const ledger = validLedger();
  ledger.games[0].catalogStatus = 'playable';
  ledger.games[0].rulesets[0].releaseStatus = 'playable';
  assert.deepEqual(validateAdmissionLedger(ledger), [
    'undercover/undercover_classic_v1: playable 缺少完整授权证据',
  ]);
});

test('台账拒绝重复规则集 ID 和不完整禁入别名', () => {
  const ledger = validLedger();
  ledger.games[0].rulesets.push(globalThis.structuredClone(ledger.games[0].rulesets[0]));
  ledger.forbidden.aliases = ['liars-bar'];
  assert.deepEqual(validateAdmissionLedger(ledger), [
    'undercover: rulesetId 重复',
    '禁入矩阵缺少别名: Liar\'s Bar',
    '禁入矩阵缺少别名: liars_bar',
  ]);
});

test('产品扫描命中禁入文件名或内容时失败', async () => {
  const root = await mkdtemp(join(tmpdir(), 'd1-compliance-'));
  await mkdir(join(root, 'packages', 'client', 'public'), { recursive: true });
  await writeFile(join(root, 'packages', 'client', 'public', 'liars_bar.json'), '{}');
  await writeFile(join(root, 'packages', 'client', 'public', 'safe.txt'), "Liar's Bar");
  const { scanForbiddenProductContent } = await import('../d1-compliance.mjs');
  assert.deepEqual(await scanForbiddenProductContent(root), [
    'packages/client/public/liars_bar.json: 文件名命中 liars_bar',
    "packages/client/public/safe.txt: 内容命中 Liar's Bar",
  ]);
});
