/**
 * D4-TOOLS：playable 准入检查。
 * 按引擎设计「上架准入」清单校验目录：
 *   - compliance/d1/game-admission.json 中任何 catalogStatus/releaseStatus === 'playable'
 *     都必须带完整授权证据（rights 已批准且五个字段齐备），否则列出现状并失败；
 *   - compliance/d4/third-game-baseline.json 的 candidate.claims.playable 必须为 false；
 *   - 共享 GAME_CATALOG 若把某游戏标记为 playable，台账必须同步。
 * 当前输出必须为「无 playable」。
 * 用法：node scripts/d4/playable-check.mjs [root]
 */
import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RIGHTS_FIELDS = ['recordId', 'scope', 'expiresAt', 'rightsApprover', 'rulesApprover'];

function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

export async function runPlayableCheck(root) {
  const playableGames = [];
  const playableRulesets = [];
  const claimViolations = [];
  const errors = [];

  const ledgerPath = resolve(root, 'compliance/d1/game-admission.json');
  let ledger;
  try {
    ledger = JSON.parse(await readFile(ledgerPath, 'utf8'));
  } catch (error) {
    errors.push(`无法读取 compliance/d1/game-admission.json: ${error.message}`);
  }

  if (ledger) {
    for (const game of ledger.games ?? []) {
      if (game.catalogStatus === 'playable') playableGames.push(game.gameId);
      for (const ruleset of game.rulesets ?? []) {
        if (ruleset.releaseStatus === 'playable') playableRulesets.push(`${game.gameId}/${ruleset.rulesetId}`);
      }
    }
    // playable 必须带完整授权证据（引擎设计「上架准入」）
    for (const game of ledger.games ?? []) {
      for (const ruleset of game.rulesets ?? []) {
        const isPlayable = game.catalogStatus === 'playable' || ruleset.releaseStatus === 'playable';
        if (!isPlayable) continue;
        const rights = ruleset.rights;
        const complete = rights?.status === 'approved'
          && RIGHTS_FIELDS.every((field) => isNonEmptyString(rights[field]));
        if (!complete) {
          errors.push(`${game.gameId}/${ruleset.rulesetId}: playable 缺少完整授权证据`);
        }
      }
    }
  }

  // third-game-baseline.json：候选不作出 playable 声明
  try {
    const baseline = JSON.parse(await readFile(resolve(root, 'compliance/d4/third-game-baseline.json'), 'utf8'));
    if (baseline.candidate?.claims?.playable === true) {
      claimViolations.push('third-game-baseline.json candidate.claims.playable 必须为 false');
    }
  } catch (error) {
    errors.push(`无法读取 compliance/d4/third-game-baseline.json: ${error.message}`);
  }

  // 共享 GAME_CATALOG 交叉校验（best-effort：catalog 源码存在才做）
  const catalogPath = resolve(root, 'packages/shared/src/game/catalog.ts');
  let catalogExists = false;
  try {
    await stat(catalogPath);
    catalogExists = true;
  } catch {
    catalogExists = false;
  }
  if (catalogExists) {
    try {
      const { GAME_CATALOG } = await import(new URL('../../packages/shared/src/game/catalog.ts', import.meta.url));
      const ledgerStatus = new Map((ledger?.games ?? []).map((game) => [game.gameId, game.catalogStatus]));
      for (const game of GAME_CATALOG) {
        if (game.availability === 'playable' && ledgerStatus.get(game.id) !== 'playable') {
          errors.push(`${game.id}: GAME_CATALOG 标记 playable 但台账未同步`);
        }
      }
    } catch (error) {
      errors.push(`GAME_CATALOG 交叉校验失败: ${error.message}`);
    }
  }

  const pass = playableGames.length === 0
    && playableRulesets.length === 0
    && claimViolations.length === 0
    && errors.length === 0;
  return { pass, playableGames, playableRulesets, claimViolations, errors };
}

export function cliMessage(result) {
  if (result.pass) return '无 playable';
  const parts = [
    ...result.playableGames.map((id) => `playable 游戏: ${id}`),
    ...result.playableRulesets.map((id) => `playable 规则集: ${id}`),
    ...result.claimViolations,
    ...result.errors,
  ];
  return `存在 playable 声明: ${parts.join('；')}`;
}

const invoked = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) {
  const root = resolve(process.argv[2] ?? '.');
  const result = await runPlayableCheck(root);
  console.log(cliMessage(result));
  if (!result.pass) {
    for (const detail of [...result.playableGames, ...result.playableRulesets, ...result.claimViolations, ...result.errors]) {
      console.error(`  - ${detail}`);
    }
    process.exitCode = 1;
  }
}
