import { readFile, readdir, stat } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const REQUIRED_ALIASES = ["Liar's Bar", 'liars-bar', 'liars_bar'];
const PRODUCT_ROOTS = ['packages'];
const BUILD_ROOTS = ['dist', 'packages/client/dist'];
const RELEASE_ARCHIVE_EXTENSIONS = new Set(['.zip', '.tgz', '.tar', '.gz', '.7z']);
const TEXT_EXTENSIONS = new Set(['.css', '.html', '.js', '.json', '.jsx', '.mjs', '.svg', '.ts', '.tsx', '.txt']);

function extension(path) {
  const index = path.lastIndexOf('.');
  return index < 0 ? '' : path.slice(index).toLowerCase();
}

function normalized(path) {
  return path.split(sep).join('/');
}

export function validateAdmissionLedger(input) {
  const errors = [];
  if (!input || input.schemaVersion !== 1 || !Array.isArray(input.games)) return ['台账 schemaVersion 或 games 无效'];
  for (const game of input.games) {
    const ids = game.rulesets.map((ruleset) => ruleset.rulesetId);
    if (new Set(ids).size !== ids.length) errors.push(`${game.gameId}: rulesetId 重复`);
    for (const ruleset of game.rulesets) {
      const rights = ruleset.rights;
      const complete = rights?.status === 'approved'
        && [rights.recordId, rights.scope, rights.expiresAt, rights.rightsApprover, rights.rulesApprover]
          .every((value) => typeof value === 'string' && value.length > 0);
      if ((game.catalogStatus === 'playable' || ruleset.releaseStatus === 'playable') && !complete) {
        errors.push(`${game.gameId}/${ruleset.rulesetId}: playable 缺少完整授权证据`);
      }
    }
  }
  for (const alias of REQUIRED_ALIASES) {
    if (!input.forbidden?.aliases?.includes(alias)) errors.push(`禁入矩阵缺少别名: ${alias}`);
  }
  return errors;
}

async function walk(root, directory) {
  const absolute = resolve(root, directory);
  try {
    if (!(await stat(absolute)).isDirectory()) return [];
  } catch {
    return [];
  }
  const entries = await readdir(absolute, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const child = resolve(absolute, entry.name);
    if (entry.isDirectory()) files.push(...await walk(root, relative(root, child)));
    if (entry.isFile()) files.push(child);
  }
  return files;
}

export async function scanForbiddenProductContent(root) {
  const ledgerPath = resolve(root, 'compliance/d1/game-admission.json');
  let aliases = REQUIRED_ALIASES;
  try {
    const ledger = JSON.parse(await readFile(ledgerPath, 'utf8'));
    aliases = [ledger.forbidden.canonicalName, ...ledger.forbidden.aliases];
  } catch {
    aliases = REQUIRED_ALIASES;
  }
  const files = [];
  const releaseArchives = [];
  for (const productRoot of [...PRODUCT_ROOTS, ...BUILD_ROOTS]) files.push(...await walk(root, productRoot));
  const rootEntries = await readdir(root, { withFileTypes: true });
  for (const entry of rootEntries) {
    if (entry.isFile() && RELEASE_ARCHIVE_EXTENSIONS.has(extension(entry.name))) {
      const archive = resolve(root, entry.name);
      files.push(archive);
      releaseArchives.push(archive);
    }
  }
  const findings = releaseArchives.map((archive) => `${normalized(relative(root, archive))}: 发布归档未经 D1 内容审计`);
  for (const file of files.sort()) {
    const path = normalized(relative(root, file));
    for (const alias of aliases) {
      if (path.toLowerCase().includes(alias.toLowerCase())) findings.push(`${path}: 文件名命中 ${alias}`);
    }
    if (!TEXT_EXTENSIONS.has(extension(file))) continue;
    const content = await readFile(file, 'utf8');
    for (const alias of aliases) {
      if (content.toLowerCase().includes(alias.toLowerCase())) findings.push(`${path}: 内容命中 ${alias}`);
    }
  }
  return [...new Set(findings)].sort();
}

export async function runD1Compliance(root) {
  const ledger = JSON.parse(await readFile(resolve(root, 'compliance/d1/game-admission.json'), 'utf8'));
  const { GAME_CATALOG } = await import(new URL('../packages/shared/src/game/catalog.ts', import.meta.url));
  const errors = [...validateAdmissionLedger(ledger), ...await scanForbiddenProductContent(root)];
  const ledgerStatus = new Map(ledger.games.map((game) => [game.gameId, game.catalogStatus]));
  if (ledger.games.length !== GAME_CATALOG.length) errors.push('台账与 GAME_CATALOG 游戏数量不一致');
  for (const game of GAME_CATALOG) {
    if (ledgerStatus.get(game.id) !== game.availability) errors.push(`${game.id}: 台账状态与 GAME_CATALOG 不一致`);
  }
  return errors;
}

const invoked = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) {
  const root = resolve(process.argv[2] ?? '.');
  const errors = await runD1Compliance(root);
  if (errors.length > 0) {
    for (const error of errors) console.error(error);
    process.exitCode = 1;
  } else {
    console.log('D1 compliance: PASS');
  }
}
