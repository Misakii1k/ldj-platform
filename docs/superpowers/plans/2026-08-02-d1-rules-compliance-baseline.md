# D1 规则与合规基线 Implementation Plan

> **For agentic workers:** 按复选框逐项执行。禁止自动创建、切换分支或生成提交；任何分支和提交操作都只能由用户明确授权后单独执行。

**Goal:** 在不修改 `GameModule`、规则原语、服务端执行链或游戏规则实现的前提下，冻结规则集身份、授权证据、禁入矩阵、目录发布状态、固定随机种子、玩家视角快照和完整局黄金回放，并使 D1 合规门可重复执行。

**Architecture:** 以 `compliance/d1/game-admission.json` 作为 D1 机器可读台账，记录每款现有游戏的规则集、来源、权利状态和目录准入结论；共享目录只消费台账结论，不承载法律判断。独立 Node.js 扫描器验证台账、生产目录、registry、catalog、路由、静态资源和构建产物，并永久阻止《骗子酒馆》相关标识进入产品范围。UNO 与《谁是卧底》的基线生成器只调用现有公开 `GameModule` 接口，提交固定种子、动作轨迹、玩家视角和最终状态，不改变任何规则。

**Tech Stack:** Node.js 24、TypeScript 5.9、tsx、Node Test Runner、React 19、现有 npm workspaces；不新增运行时或开发依赖。

---

## 规格依据与 D1 边界

- 最高优先级规格：`docs/superpowers/specs/2026-08-02-shared-game-engine-design.md`。
- D1 必须冻结：ruleset、授权证据、禁入矩阵、目录状态、质量门结果、关键随机种子、玩家视角快照、完整局黄金回放。
- D1 不得修改：`packages/shared/src/game/contract.ts`、`packages/shared/src/game/rules/**`、`packages/server/src/core/game/session.ts`、`packages/server/src/core/executor.ts`、数据库 schema、任何游戏 `server/module.ts` 中的规则行为。
- D1 不为证据缺失项补写授权结论。没有可核验证据的游戏必须是 `internal_prototype` 或 `blocked_rights`，不得是 `playable`。
- `uno_legacy_platform_v1` 与 `undercover_classic_v1` 仅冻结当前兼容语义；D1 不实现 `uno_platform_house_v1`、`undercover_blank_v1`，也不迁移规则。
- 当前未发现可核验的授权记录编号、权利范围、到期日、权利审批人和规则审批人。因此计划按保守结论执行：`undercover`、`landlord`、`werewolf` 为 `internal_prototype`，`uno` 为 `blocked_rights`，四款游戏均不得通过产品目录新建房间。历史快照恢复和模块级测试仍保留 registry 模块。
- 《骗子酒馆》研究资料只允许迁入不参与构建、打包、产品索引或代码生成的隔离目录；根目录压缩包因包含该资料必须移除。

## 文件结构与职责

### 新建

- `compliance/d1/game-admission.json`：D1 游戏、规则集、来源、授权状态、目录状态与禁入矩阵的唯一机器可读台账。
- `compliance/d1/README.md`：解释台账字段、证据更新流程、D1 审批条件和隔离边界。
- `scripts/d1-compliance.mjs`：可导入、可直接运行的 D1 合规扫描器。
- `scripts/tests/d1-compliance.test.mjs`：扫描器的正反例测试。
- `scripts/generate-d1-baselines.ts`：固定种子驱动 UNO 与《谁是卧底》，生成确定性基线文件。
- `packages/games/uno/tests/baseline.test.ts`：验证 UNO 基线可由当前模块精确重放。
- `packages/games/undercover/tests/baseline.test.ts`：验证《谁是卧底》基线可由当前模块精确重放。
- `packages/games/uno/tests/fixtures/d1/uno-legacy-platform-v1.json`：生成并纳入 D1 审阅差异的 UNO 固定种子、动作、视角与终态。
- `packages/games/undercover/tests/fixtures/d1/undercover-classic-v1.json`：生成并纳入 D1 审阅差异的《谁是卧底》固定种子、动作、视角与终态。
- `research/quarantined/liars-bar/**`：从现有普通资料树移动后的隔离研究资料；运行时代码不得引用。
- `docs/superpowers/reports/2026-08-02-d1-baseline-results.md`：记录 D1 执行环境、命令、退出码、测试数量和构建结果。

### 修改

- `package.json`：增加 D1 扫描与基线校验命令，并把扫描器纳入 `ci`。
- `.gitignore`：明确隔离研究目录允许受版本控制，但禁止其生成物进入发布目录。
- `packages/shared/src/game/catalog.ts`：扩充目录状态并按 D1 台账结论降级四款游戏；规则集 ID 改为锁定兼容 ID。
- `packages/shared/tests/catalog.test.ts`：验证无证据游戏不可玩、规则集 ID 冻结、禁入游戏不存在。
- `packages/client/src/app/GameCard.tsx`：为 `internal_prototype` 和 `blocked_rights` 显示明确的不可开局状态。
- `packages/server/tests/executor.test.ts`、`packages/server/tests/gameSession.test.ts`：仅补充默认生产路径拒绝未准入游戏、registry 保留不等于产品准入的断言；不得为旧测试增加绕过准入的开关。
- 既有依赖生产建房路径的服务端测试若因目录降级失败，记录为 D1 阻塞项；不得修改 `createRoom.ts`、网关、应用组装或执行链来维持旧预期。
- `docs/game-library/桌游平台游戏库资料/README.md`：删除禁入游戏索引和旧“原创补全可上线”路线，改为 D1 准入状态说明。
- `packages/games/README.md`：修正四款游戏当前发布状态与锁定 ruleset。
- `docs/new-games-preparation.md`：修正“三款已 playable”和“标准规则”等状态漂移。
- `.trae/documents/game-library-seven-games-rollout.md`：加醒目失效声明，禁止继续执行与已批准设计冲突的原创补全路线。

### 删除或移动

- 移动 `docs/game-library/桌游平台游戏库资料/05_骗子酒馆/**` → `research/quarantined/liars-bar/**`。
- 删除 `桌游平台游戏库资料.zip`，因为归档包含永久禁入资料且位于仓库普通发布范围。

---

### Task 1: 记录未修改基线

**Files:**
- Create: `docs/superpowers/reports/2026-08-02-d1-baseline-results.md`

- [ ] **Step 1: 只读确认工作树，不创建或切换分支**

Run:

```powershell
git status --short --branch
git diff --stat
```

Expected: 记录当前分支、已有未提交文件和差异统计；不得执行 `git switch`、`git checkout`、`git branch`、`git add`、`git commit`、`git stash`、`git reset` 或 `git clean`。

- [ ] **Step 2: 运行质量门并用真实输出生成报告**

Run:

```powershell
function Invoke-D1Gate([string]$Name, [string[]]$Arguments) {
  $output = & npm.cmd @Arguments 2>&1 | Tee-Object -Variable captured
  $code = $LASTEXITCODE
  $summary = ($captured | Where-Object { $_.ToString().Trim().Length -gt 0 } | Select-Object -Last 1).ToString().Replace('|', '\|')
  [pscustomobject]@{ Name = $Name; Code = $code; Summary = $summary }
}
$nodeVersion = & node --version
$npmVersion = & npm.cmd --version
$head = git rev-parse HEAD
$typecheck = Invoke-D1Gate 'npm run typecheck' @('run', 'typecheck')
$lint = Invoke-D1Gate 'npm run lint' @('run', 'lint')
$test = Invoke-D1Gate 'npm run test' @('run', 'test')
$build = Invoke-D1Gate 'npm run build' @('run', 'build')
$rows = @($typecheck, $lint, $test, $build) | ForEach-Object { "| $($_.Name) | $($_.Code) | $($_.Summary) |" }
@"
# D1 基线执行结果

## 环境

| 项目 | 结果 |
| --- | --- |
| 日期 | $(Get-Date -Format yyyy-MM-dd) |
| HEAD | $head |
| Node | $nodeVersion |
| npm | $npmVersion |

## 改动前质量门

| 命令 | 退出码 | 结果摘要 |
| --- | ---: | --- |
$($rows -join "`n")
"@ | Set-Content -Encoding utf8 docs/superpowers/reports/2026-08-02-d1-baseline-results.md
```

Expected: 报告只含实际采集值；失败项只记录，不借机修改引擎、执行链或游戏规则。

- [ ] **Step 3: 核对报告没有未展开变量或占位语**

Run:

```powershell
Get-Content docs/superpowers/reports/2026-08-02-d1-baseline-results.md
Select-String -Path docs/superpowers/reports/2026-08-02-d1-baseline-results.md -Pattern '\$head|\$nodeVersion|\$npmVersion|\$\(|待填|占位|执行时'
```

Expected: 第一条命令显示真实环境和质量门结果；第二条命令无输出。报告保持未提交，等待用户审阅并决定是否提交。

---

### Task 2: 建立机器可读准入台账

**Files:**
- Create: `compliance/d1/game-admission.json`
- Create: `compliance/d1/README.md`
- Test: `scripts/tests/d1-compliance.test.mjs`

- [ ] **Step 1: 先写台账校验测试**

在 `scripts/tests/d1-compliance.test.mjs` 写入：

```javascript
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
  ledger.games[0].rulesets.push(structuredClone(ledger.games[0].rulesets[0]));
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
```

- [ ] **Step 2: 运行测试并确认失败**

Run:

```powershell
node --test scripts/tests/d1-compliance.test.mjs
```

Expected: FAIL，错误包含 `ERR_MODULE_NOT_FOUND`，因为 `scripts/d1-compliance.mjs` 尚不存在。

- [ ] **Step 3: 创建 D1 台账**

创建 `compliance/d1/game-admission.json`：

```json
{
  "schemaVersion": 1,
  "frozenAt": "2026-08-02",
  "games": [
    {
      "gameId": "undercover",
      "catalogStatus": "internal_prototype",
      "rulesets": [
        {
          "rulesetId": "undercover_classic_v1",
          "kind": "platform_variant",
          "releaseStatus": "internal_prototype",
          "sourceDocuments": [
            "packages/games/undercover/server/module.ts",
            "docs/superpowers/specs/2026-08-02-shared-game-engine-design.md#已确认的谁是卧底规则集"
          ],
          "includedExtensions": [],
          "excludedExtensions": ["undercover_blank_v1"],
          "digitalAdaptations": [
            "发言和投票由服务端计时器推进",
            "淘汰者进入旁观视角",
            "机器人只能从模块合法动作候选中选择"
          ],
          "rights": {
            "status": "unverified",
            "recordId": null,
            "scope": null,
            "expiresAt": null,
            "rightsApprover": null,
            "rulesApprover": null
          }
        }
      ]
    },
    {
      "gameId": "uno",
      "catalogStatus": "blocked_rights",
      "rulesets": [
        {
          "rulesetId": "uno_legacy_platform_v1",
          "kind": "legacy_compatibility",
          "releaseStatus": "blocked_rights",
          "sourceDocuments": [
            "packages/games/uno/server/module.ts",
            "docs/superpowers/specs/2026-08-02-shared-game-engine-design.md#已确认的-uno-平台规则集"
          ],
          "includedExtensions": [],
          "excludedExtensions": ["uno_platform_house_v1"],
          "digitalAdaptations": [
            "当前实现只冻结为迁移兼容基线",
            "黄金回放不证明新平台规则正确"
          ],
          "rights": {
            "status": "unverified",
            "recordId": null,
            "scope": null,
            "expiresAt": null,
            "rightsApprover": null,
            "rulesApprover": null
          }
        }
      ]
    },
    {
      "gameId": "landlord",
      "catalogStatus": "internal_prototype",
      "rulesets": [
        {
          "rulesetId": "landlord_legacy_platform_v1",
          "kind": "legacy_compatibility",
          "releaseStatus": "internal_prototype",
          "sourceDocuments": ["docs/new-games-preparation.md#斗地主"],
          "includedExtensions": [],
          "excludedExtensions": [],
          "digitalAdaptations": ["当前实现仅作为 D1 盘点对象，不在 D2 或 D3 迁移范围"],
          "rights": {
            "status": "unverified",
            "recordId": null,
            "scope": null,
            "expiresAt": null,
            "rightsApprover": null,
            "rulesApprover": null
          }
        }
      ]
    },
    {
      "gameId": "werewolf",
      "catalogStatus": "internal_prototype",
      "rulesets": [
        {
          "rulesetId": "werewolf_legacy_platform_v2",
          "kind": "legacy_compatibility",
          "releaseStatus": "internal_prototype",
          "sourceDocuments": ["docs/new-games-preparation.md#狼人杀"],
          "includedExtensions": [],
          "excludedExtensions": [],
          "digitalAdaptations": ["当前实现仅作为 D1 盘点对象，不在 D2 或 D3 迁移范围"],
          "rights": {
            "status": "unverified",
            "recordId": null,
            "scope": null,
            "expiresAt": null,
            "rightsApprover": null,
            "rulesApprover": null
          }
        }
      ]
    }
  ],
  "forbidden": {
    "canonicalName": "骗子酒馆",
    "aliases": ["Liar's Bar", "liars-bar", "liars_bar"],
    "productScopes": ["packages", "dist", "registry", "catalog", "routes", "static_assets", "release_archives"],
    "researchRoot": "research/quarantined/liars-bar"
  }
}
```

- [ ] **Step 4: 创建台账说明**

创建 `compliance/d1/README.md`：

```markdown
# D1 游戏准入台账

`game-admission.json` 是 D1 规则集身份、来源、权利证据、目录状态和永久禁入矩阵的机器可读冻结记录。

## 状态

- `playable`：规则来源、权利证据、规则映射和全部发布质量门均已批准。
- `internal_prototype`：仅允许内部开发与测试，不得出现在生产目录或新建房间入口。
- `blocked_rights`：权利证据不足，不得出现在生产目录、搜索、推荐或新建房间入口。

## 更新要求

把规则集改为 `playable` 前，必须同时填写非空授权记录编号、权利范围、到期日、权利审批人和规则审批人，并由独立变更提交对应规则来源、自动测试映射和准入结果。规则变化必须新建 `rulesetId`，不得覆盖已有规则集。

## 隔离研究资料

`research/quarantined/liars-bar` 只保存不参与构建、打包、产品索引和代码生成的内部研究资料。`packages`、`dist`、registry、catalog、路由、静态资源和发布归档中的任一禁入命中都会使 D1 扫描失败。
```

---

### Task 3: 实现 D1 台账和永久禁入扫描器

**Files:**
- Create: `scripts/d1-compliance.mjs`
- Modify: `package.json`
- Modify: `.gitignore`
- Test: `scripts/tests/d1-compliance.test.mjs`

- [ ] **Step 1: 实现扫描器**

创建 `scripts/d1-compliance.mjs`：

```javascript
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
```

- [ ] **Step 2: 运行扫描器单测**

Run:

```powershell
node --test scripts/tests/d1-compliance.test.mjs
```

Expected: `4` tests，`4` pass，`0` fail。

- [ ] **Step 3: 将扫描器纳入根命令**

修改 `package.json` 的 `scripts` 为：

```json
{
  "typecheck": "tsc -p tsconfig.server.json && tsc -p packages/client/tsconfig.json",
  "lint": "eslint .",
  "test": "tsx --test \"packages/**/tests/**/*.test.ts\" && node --test scripts/tests/**/*.test.mjs",
  "compliance:d1": "node scripts/d1-compliance.mjs .",
  "baseline:d1": "tsx scripts/generate-d1-baselines.ts",
  "ci": "npm run typecheck && npm run lint && npm run test && npm run compliance:d1",
  "dev:server": "node packages/server/src/index.ts",
  "build": "npm run build -w @ldj/client",
  "start:prod": "node packages/server/src/index.ts"
}
```

只替换 `scripts`，其余字段保持不变。

- [ ] **Step 4: 明确隔离目录约束**

在 `.gitignore` 末尾增加：

```gitignore
research/quarantined/**/dist/
research/quarantined/**/generated/
research/quarantined/**/*.zip
```

- [ ] **Step 5: 运行真实仓库扫描并确认当前先失败**

Run:

```powershell
npm run compliance:d1
```

Expected: FAIL；至少报告 `桌游平台游戏库资料.zip: 发布归档未经 D1 内容审计`，并报告当前台账状态与尚未降级的 `GAME_CATALOG` 不一致。不得把普通“标准规则”文字误报为永久禁入标识。此失败证明扫描器同时阻止未经审计归档和目录漂移；不得改弱规则。

---

### Task 4: 隔离永久禁入资料并清理旧路线

**Files:**
- Move: `docs/game-library/桌游平台游戏库资料/05_骗子酒馆/**` → `research/quarantined/liars-bar/**`
- Delete: `桌游平台游戏库资料.zip`
- Modify: `docs/game-library/桌游平台游戏库资料/README.md`
- Modify: `.trae/documents/game-library-seven-games-rollout.md`

- [ ] **Step 1: 移动研究资料并删除含禁入内容的归档**

Run:

```powershell
New-Item -ItemType Directory -Force research/quarantined/liars-bar | Out-Null
Move-Item "docs/game-library/桌游平台游戏库资料/05_骗子酒馆/*" "research/quarantined/liars-bar/"
Remove-Item -Recurse "docs/game-library/桌游平台游戏库资料/05_骗子酒馆"
Remove-Item "桌游平台游戏库资料.zip"
```

Expected: 普通资料树中不再存在 `05_骗子酒馆`，根目录不再存在 `桌游平台游戏库资料.zip`，隔离目录保留原研究文件历史。

移动前后用 `Get-ChildItem -Force` 核对隐藏文件；不得复制后留下原目录。删除前必须确认路径与本任务清单精确一致。

- [ ] **Step 2: 修正总索引**

将 `docs/game-library/桌游平台游戏库资料/README.md` 改为只索引其余七款资料，并删除：

- 目录结构中的禁入条目。
- “原创版骗子酒馆”产品路线。
- 证据成熟度表中的禁入条目。

在“关键原则”后增加：

```markdown
## D1 准入状态

本目录是研究资料，不等于产品准入。任何游戏只有在 `compliance/d1/game-admission.json` 中具备完整权利证据、规则审批和 `playable` 状态时，才能进入生产目录或建房入口。永久禁入项目不在本索引、产品目录、搜索、推荐、构建或发布归档中出现；隔离研究资料不得被运行时代码引用。
```

Expected: 文档不再推荐以原创补全绕过授权，也不再把研究成熟度等同可上线状态。

- [ ] **Step 3: 使旧七游戏计划明确失效**

在 `.trae/documents/game-library-seven-games-rollout.md` 标题下方加入：

```markdown
> **状态：已被取代，不得执行。** 本计划中“资料不足时原创补全并上架”的路线与 `docs/superpowers/specs/2026-08-02-shared-game-engine-design.md` 冲突。后续工作必须先通过 D1 规则与合规基线；本文件只保留历史决策上下文。
```

Expected: 旧计划不会被误认为当前批准实施依据。

- [ ] **Step 4: 运行永久禁入扫描并确认只剩目录漂移**

Run:

```powershell
npm run compliance:d1
```

Expected: 仍 FAIL，但不再出现发布归档或永久禁入内容命中；剩余错误仅为台账状态与尚未降级的 `GAME_CATALOG` 不一致。该错误将在 Task 5 修正，不能在本任务放宽。

---

### Task 5: 冻结目录状态和规则集 ID

**Files:**
- Modify: `packages/shared/src/game/catalog.ts`
- Modify: `packages/shared/tests/catalog.test.ts`
- Modify: `packages/client/src/app/GameCard.tsx`
- Modify: `packages/server/tests/gameSession.test.ts`
- Modify: `packages/games/README.md`
- Modify: `docs/new-games-preparation.md`

- [ ] **Step 1: 先把目录测试改成 D1 期望**

在 `packages/shared/tests/catalog.test.ts` 中保留现有人数、setup 和筛选测试，并加入：

```typescript
test('GAME_CATALOG：D1 规则集 ID 与目录状态已冻结', () => {
  assert.deepEqual(
    GAME_CATALOG.map((game) => ({ id: game.id, availability: game.availability, rulesetId: game.setup.defaultRulesetId })),
    [
      { id: 'undercover', availability: 'internal_prototype', rulesetId: 'undercover_classic_v1' },
      { id: 'uno', availability: 'blocked_rights', rulesetId: 'uno_legacy_platform_v1' },
      { id: 'landlord', availability: 'internal_prototype', rulesetId: 'landlord_legacy_platform_v1' },
      { id: 'werewolf', availability: 'internal_prototype', rulesetId: 'werewolf_legacy_platform_v2' },
    ],
  );
});

test('GAME_CATALOG：证据未批准的游戏不能作为 playable 建房', () => {
  assert.equal(GAME_CATALOG.some((game) => game.availability === 'playable'), false);
  for (const game of GAME_CATALOG) assert.equal(getPlayableGameCatalogEntry(game.id), undefined);
});

test('GAME_CATALOG：永久禁入标识不进入目录', () => {
  const serialized = JSON.stringify(GAME_CATALOG).toLowerCase();
  for (const forbidden of ['骗子酒馆', "liar's bar", 'liars-bar', 'liars_bar']) {
    assert.equal(serialized.includes(forbidden), false);
  }
});

test('listGamesForPlayerCount：D1 生产目录不展示内部或权利阻断项', () => {
  assert.deepEqual(listGamesForPlayerCount(null), []);
  assert.deepEqual(listGamesForPlayerCount(3), []);
  assert.deepEqual(listGamesForPlayerCount(12), []);
  assert.deepEqual(PLAYER_COUNT_OPTIONS, [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
});
```

删除旧 `listGamesForPlayerCount` 测试中对 `GAME_CATALOG.length`、`['uno', 'landlord']` 和 `['undercover', 'werewolf']` 的期待，避免同时保留互相冲突的断言。把测试名 `GAME_CATALOG：现有可玩游戏保留机器人能力声明` 改为 `GAME_CATALOG：现有内部模块保留机器人能力声明`，断言内容不变。

删除或改写以下旧断言：

```typescript
assert.equal(getPlayableGameCatalogEntry(DEFAULT_PLAYABLE_GAME_ID)?.displayName, '谁是卧底');
```

把默认项断言改为：

```typescript
test('GAME_CATALOG：D1 无默认可玩游戏', () => {
  assert.equal(DEFAULT_PLAYABLE_GAME_ID, null);
});
```

- [ ] **Step 2: 运行目录测试并确认失败**

Run:

```powershell
npx tsx --test packages/shared/tests/catalog.test.ts
```

Expected: FAIL；差异显示当前 `playable`、`classic_v1`、`standard_v1` 与 D1 冻结值不一致。

- [ ] **Step 3: 更新目录状态模型**

在 `packages/shared/src/game/catalog.ts` 中作以下精确变更：

```typescript
export const GAME_AVAILABILITY = ['playable', 'coming_soon', 'internal_prototype', 'blocked_rights'] as const;
```

四款游戏分别改为：

```typescript
availability: 'internal_prototype',
rulesets: [{ id: 'undercover_classic_v1', label: '平台经典兼容基线' }],
setup: defaultSetup('undercover_classic_v1', '平台经典兼容基线', [
  { key: 'speechSeconds', kind: 'integer', label: '发言时间（秒）', defaultValue: 60, min: 30, max: 90, step: 30 },
  { key: 'voteSeconds', kind: 'integer', label: '投票时间（秒）', defaultValue: 45, min: 30, max: 60, step: 15 },
], { speechSeconds: 60, voteSeconds: 45 }),
comingSoonMessage: '内部原型，尚未通过发布准入',
```

```typescript
availability: 'blocked_rights',
rulesets: [{ id: 'uno_legacy_platform_v1', label: 'Legacy 兼容基线' }],
setup: defaultSetup('uno_legacy_platform_v1', 'Legacy 兼容基线', [], { variant: 'standard' }),
comingSoonMessage: '权利证据未完成，暂不开放',
```

```typescript
availability: 'internal_prototype',
rulesets: [{ id: 'landlord_legacy_platform_v1', label: 'Legacy 兼容基线' }],
setup: defaultSetup('landlord_legacy_platform_v1', 'Legacy 兼容基线', [], { variant: 'standard' }),
comingSoonMessage: '内部原型，尚未通过发布准入',
```

```typescript
availability: 'internal_prototype',
rulesets: [{ id: 'werewolf_legacy_platform_v2', label: 'Legacy v2 兼容基线' }],
setup: defaultSetup('werewolf_legacy_platform_v2', 'Legacy v2 兼容基线', [
  { key: 'pace', kind: 'select', label: '对局节奏', defaultValue: 'standard', choices: [{ value: 'fast', label: '快速' }, { value: 'standard', label: '标准' }, { value: 'relaxed', label: '轻松' }] },
  { key: 'witchSelfSave', kind: 'select', label: '女巫自救', defaultValue: 'first_night', choices: [{ value: 'first_night', label: '仅首夜' }, { value: 'never', label: '禁止' }, { value: 'always', label: '允许' }] },
  { key: 'winCondition', kind: 'select', label: '胜负条件', defaultValue: 'numbers', choices: [{ value: 'numbers', label: '屠边人数' }, { value: 'roles', label: '屠神规则' }] },
], { preset: 'classic', pace: 'standard', witchSelfSave: 'first_night', winCondition: 'numbers' }),
comingSoonMessage: '内部原型，尚未通过发布准入',
```

将默认值改为：

```typescript
export const DEFAULT_PLAYABLE_GAME_ID: GameId | null = null;
```

不得新增内部默认游戏或准入旁路。同步在目录测试中断言 `DEFAULT_PLAYABLE_GAME_ID === null`。

将 `listGamesForPlayerCount` 只返回生产可展示项，避免内部原型和权利阻断项出现在生产目录：

```typescript
export function listGamesForPlayerCount(playerCount: number | null | undefined): readonly GameCatalogEntry[] {
  const visible = GAME_CATALOG.filter((game) => game.availability === 'playable' || game.availability === 'coming_soon');
  if (playerCount === null || playerCount === undefined) return visible;
  return visible.filter((game) => matchesPlayerCount(game, playerCount));
}
```

- [ ] **Step 4: 复核现有生产建房门，不修改执行链**

确认 `packages/server/src/core/commands/createRoom.ts` 继续只通过 `getPlayableGameCatalogEntry` 接受 `playable` 游戏。目录降级后，默认生产建房路径应自然拒绝四款未准入游戏。

禁止修改 `packages/server/src/core/commands/createRoom.ts`、`packages/server/src/gateway/ws.ts`、`packages/server/src/app.ts`、`packages/server/src/core/executor.ts` 或相关调用签名；禁止加入 `allowUnreleasedGames`、测试后门、环境变量或协议旁路。既有测试若依赖未准入游戏通过生产建房路径，记录为阻塞项并留待 D1 之外的独立测试架构决策，不得在本计划内绕过准入。

- [ ] **Step 5: 更新目录卡片的不可用原因**

在 `packages/client/src/app/GameCard.tsx` 中加入：

```typescript
function availabilityLabel(game: GameCatalogEntry): string {
  if (game.availability === 'playable') return '可以开局';
  if (game.availability === 'blocked_rights') return '权利审核中';
  if (game.availability === 'internal_prototype') return '内部原型';
  return '即将推出';
}
```

并将状态文字：

```tsx
{isPlayable ? '可以开局' : '即将推出'}
```

替换为：

```tsx
{availabilityLabel(game)}
```

虽然生产列表会过滤内部状态，此渲染仍保证开发者直接传入条目时不会误标“即将推出”。

- [ ] **Step 6: 更新 registry 测试，保留历史恢复模块但禁止新建房**

将 `packages/server/tests/gameSession.test.ts` 的“所有可玩目录条目与 manifest 完全一致”测试替换为：

```typescript
test('注册表：内部模块可为历史恢复保留，但 D1 无模块可新建房', async () => {
  const { listGameManifests } = await import('../src/core/game/registry.ts');
  const manifests = listGameManifests();
  assert.deepEqual(manifests.map((manifest) => manifest.id), ['undercover', 'uno', 'landlord', 'werewolf']);
  assert.deepEqual(GAME_CATALOG.filter((game) => game.availability === 'playable'), []);
  for (const manifest of manifests) assert.equal(getPlayableGameCatalogEntry(manifest.id), undefined);
});
```

在 `packages/server/tests/executor.test.ts` 中新增默认生产路径测试，直接使用该文件既有的内存数据库和 executor 初始化：

```typescript
test('D1：证据未批准的游戏不能通过默认生产路径新建房间', async () => {
  const db = openDb({ path: ':memory:' });
  migrate(db);
  const executor = new RoomCommandExecutor(db);
  try {
    for (const gameId of ['undercover', 'uno', 'landlord', 'werewolf']) {
      const { roomId } = prepareCreateRoom();
      await assert.rejects(
        () => executor.executeCreate({
          roomId,
          actorScope: `conn:${gameId}`,
          requestId: `req-d1-${gameId}`,
          handler: (tx) => applyCreateRoom(tx, roomId, { nickname: '房主', gameId }),
        }),
        (error: unknown) => {
          assert.ok(error instanceof CommandError);
          assert.equal(error.code, 'ACTION_NOT_ALLOWED');
          assert.equal(error.message, '所选游戏暂未开放');
          return true;
        },
      );
    }
  } finally {
    closeDb(db);
  }
});
```

按 `executor.test.ts` 的现有导入复用 `openDb`、`closeDb`、`migrate`、`RoomCommandExecutor` 和 `CommandError`；若已有同名 helper，直接复用，不重复定义。

- [ ] **Step 7: 修正文档状态漂移**

更新 `packages/games/README.md` 和 `docs/new-games-preparation.md`：

- 不再称四款游戏为 `playable`。
- 写明 registry 保留不等于产品准入。
- UNO 只称 `uno_legacy_platform_v1` 兼容基线，不称“标准规则”。
- 《谁是卧底》只称 `undercover_classic_v1` 平台兼容基线。
- 斗地主和狼人杀分别冻结为 `landlord_legacy_platform_v1`、`werewolf_legacy_platform_v2`，但不进入 D2/D3 范围。
- 所有重新开放动作必须经过独立权利与规则审批，不得在 D1 中完成。

- [ ] **Step 8: 运行目录和建房相关测试**

Run:

```powershell
npx tsx --test packages/shared/tests/catalog.test.ts packages/server/tests/executor.test.ts packages/server/tests/gameSession.test.ts
```

Expected: 目录测试和新增的准入断言 PASS；默认生产路径拒绝四款游戏，registry 仍列出四个模块供历史恢复和模块回归。全量测试若暴露对旧生产建房行为的依赖，必须如实记录为阻塞项，不得通过修改执行链或增加旁路解决。

Run:

```powershell
npm run compliance:d1
```

Expected: `D1 compliance: PASS`；隔离、台账与目录状态已同时一致。

---

### Task 6: 生成并冻结 UNO 与《谁是卧底》基线

**Files:**
- Create: `scripts/generate-d1-baselines.ts`
- Create: `packages/games/uno/tests/fixtures/d1/uno-legacy-platform-v1.json`
- Create: `packages/games/undercover/tests/fixtures/d1/undercover-classic-v1.json`
- Create: `packages/games/uno/tests/baseline.test.ts`
- Create: `packages/games/undercover/tests/baseline.test.ts`

- [ ] **Step 1: 编写基线重放测试**

创建 `packages/games/uno/tests/baseline.test.ts`：

```typescript
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createSeededRandom, type Actor, type GameContext } from '@ldj/shared';
import { unoModule, type UnoAction } from '../server/module.ts';

interface UnoFixture {
  rulesetId: 'uno_legacy_platform_v1';
  seed: string;
  players: string[];
  actions: Array<{ actor: string; action: UnoAction }>;
  views: Record<string, unknown>;
  finalState: unknown;
  result: unknown;
  randomCursor: number;
}

test('D1 UNO legacy 基线可确定性重放', async () => {
  const fixture = JSON.parse(await readFile(new URL('./fixtures/d1/uno-legacy-platform-v1.json', import.meta.url), 'utf8')) as UnoFixture;
  const random = createSeededRandom(fixture.seed);
  const ctx: GameContext = { now: 1_700_000_000_000, random };
  let state = unoModule.createInitialState(ctx, fixture.players, unoModule.parseConfig({ variant: 'standard' }));
  for (const step of fixture.actions) {
    const actor: Actor = { kind: 'player', playerId: step.actor };
    const reduced = unoModule.reduce(ctx, state, actor, unoModule.parseAction(step.action));
    assert.ok(reduced.ok, JSON.stringify(step));
    state = reduced.state;
  }
  const views = Object.fromEntries(fixture.players.map((playerId) => [playerId, unoModule.getPlayerView(state, playerId)]));
  assert.deepEqual(state, fixture.finalState);
  assert.deepEqual(views, fixture.views);
  assert.deepEqual(unoModule.getResult(state), fixture.result);
  assert.equal(random.getCursor(), fixture.randomCursor);
});
```

创建 `packages/games/undercover/tests/baseline.test.ts`：

```typescript
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createSeededRandom, type Actor, type GameContext } from '@ldj/shared';
import { undercoverModule, type UndercoverAction, type UndercoverState } from '../server/index.ts';

interface UndercoverFixture {
  rulesetId: 'undercover_classic_v1';
  seed: string;
  players: string[];
  actions: Array<{ actor: Actor; action: UndercoverAction; now: number }>;
  views: Record<string, unknown>;
  spectatorView: unknown;
  finalState: unknown;
  result: unknown;
  randomCursor: number;
}

test('D1 谁是卧底 classic 基线可确定性重放', async () => {
  const fixture = JSON.parse(await readFile(new URL('./fixtures/d1/undercover-classic-v1.json', import.meta.url), 'utf8')) as UndercoverFixture;
  const random = createSeededRandom(fixture.seed);
  const ctx: GameContext = { now: 1_700_000_000_000, random };
  let state = undercoverModule.createInitialState(ctx, fixture.players, undercoverModule.parseConfig({}));
  for (const step of fixture.actions) {
    ctx.now = step.now;
    const reduced = undercoverModule.reduce(ctx, state, step.actor, undercoverModule.parseAction(step.action));
    assert.ok(reduced.ok, JSON.stringify(step));
    state = reduced.state;
  }
  const views = Object.fromEntries(fixture.players.map((playerId) => [playerId, undercoverModule.getPlayerView(state, playerId)]));
  assert.deepEqual(state, fixture.finalState);
  assert.deepEqual(views, fixture.views);
  assert.deepEqual(undercoverModule.getSpectatorView(state), fixture.spectatorView);
  assert.deepEqual(undercoverModule.getResult(state), fixture.result);
  assert.equal(random.getCursor(), fixture.randomCursor);
});
```

- [ ] **Step 2: 运行测试并确认 fixture 缺失**

Run:

```powershell
npx tsx --test packages/games/uno/tests/baseline.test.ts packages/games/undercover/tests/baseline.test.ts
```

Expected: 两个测试均 FAIL，错误为 `ENOENT`，分别指向两个 D1 fixture。

- [ ] **Step 3: 编写确定性基线生成器**

创建 `scripts/generate-d1-baselines.ts`。生成器必须：

1. 使用固定种子 `d1:uno:legacy:v1` 与 `d1:undercover:classic:v1`。
2. 使用固定玩家 ID：UNO 为 `['uno-p1', 'uno-p2', 'uno-p3', 'uno-p4']`，《谁是卧底》为 `['uc-p1', 'uc-p2', 'uc-p3', 'uc-p4', 'uc-p5', 'uc-p6']`。
3. UNO 使用单个确定性随机源；每一步调用 `pickBotAction`，动作仍经过 `parseAction` 和 `reduce`，最多 `2000` 步；若未产生唯一结果则抛错。
4. 《谁是卧底》按当前阶段生成合法系统/玩家动作：全员确认、当前发言者结束发言、每名存活玩家按席位投给下一名合法候选、投票超时、结果展示超时；最多 `500` 步；若未产生唯一结果则抛错。
5. 每一步保存 actor、action 和服务端时间；UNO 的 actor 序列化为玩家 ID，《谁是卧底》的 actor 保存完整 `Actor`；最终保存所有玩家视角、观战视角、终态、结果和随机游标。
6. 使用稳定的 `JSON.stringify(value, null, 2) + '\n'` 写入两个精确 fixture 路径。

核心 UNO 驱动代码：

```typescript
const seed = 'd1:uno:legacy:v1';
const players = ['uno-p1', 'uno-p2', 'uno-p3', 'uno-p4'];
const random = createSeededRandom(seed);
const ctx: GameContext = { now: 1_700_000_000_000, random };
let state = unoModule.createInitialState(ctx, players, unoModule.parseConfig({ variant: 'standard' }));
const actions: Array<{ actor: string; action: UnoAction }> = [];
for (let step = 0; step < 2000 && unoModule.getResult(state) === null; step++) {
  const playerId = state.currentPlayerId;
  const action = unoModule.pickBotAction?.({ view: unoModule.getPlayerView(state, playerId), playerId, random });
  if (!action) throw new Error(`UNO 基线在步骤 ${step} 无合法机器人动作`);
  const reduced = unoModule.reduce(ctx, state, { kind: 'player', playerId }, unoModule.parseAction(action));
  if (!reduced.ok) throw new Error(`UNO 基线动作被拒绝: ${JSON.stringify({ playerId, action, reduced })}`);
  actions.push({ actor: playerId, action });
  state = reduced.state;
}
const result = unoModule.getResult(state);
if (result === null) throw new Error('UNO 基线超过 2000 步仍未结束');
```

核心《谁是卧底》阶段动作选择：

```typescript
function nextUndercoverStep(state: UndercoverState): { actor: Actor; action: UndercoverAction } {
  if (state.phase === 'word_reveal') {
    const playerId = Object.keys(state.players).find((id) => !state.confirmedPlayerIds.includes(id));
    return playerId
      ? { actor: { kind: 'player', playerId }, action: { type: 'confirm_word' } }
      : { actor: { kind: 'system', source: 'timer' }, action: { type: 'reveal_timeout' } };
  }
  if (state.phase === 'speaking') {
    return {
      actor: { kind: 'player', playerId: state.speakingOrder[state.currentSpeakerIndex]! },
      action: { type: 'finish_speech' },
    };
  }
  if (state.phase === 'voting' || state.phase === 'runoff_voting') {
    const alive = Object.entries(state.players).filter(([, player]) => player.alive).map(([id]) => id);
    const voter = alive.find((id) => !(id in state.votes));
    if (!voter) {
      return {
        actor: { kind: 'system', source: 'timer' },
        action: { type: 'vote_timeout', round: state.round, kind: state.phase === 'voting' ? 'normal' : 'runoff' },
      };
    }
    const candidates = state.phase === 'runoff_voting' ? state.runoffCandidates : alive;
    const target = candidates.find((id) => id !== voter);
    if (!target) throw new Error(`谁是卧底基线没有合法投票目标: ${voter}`);
    return { actor: { kind: 'player', playerId: voter }, action: { type: 'cast_vote', targetPlayerId: target } };
  }
  if (state.phase === 'vote_result') {
    return { actor: { kind: 'system', source: 'timer' }, action: { type: 'vote_result_elapsed', round: state.round } };
  }
  throw new Error(`谁是卧底基线已结束或阶段未知: ${state.phase}`);
}
```

生成器必须先给《谁是卧底》投递一次 `{ type: 'begin' }` 系统动作并写入 actions；每步 `ctx.now += 1000`，确保时间稳定。

- [ ] **Step 4: 生成 fixture 两次并验证字节稳定**

Run:

```powershell
npm run baseline:d1
$firstUno = (Get-FileHash packages/games/uno/tests/fixtures/d1/uno-legacy-platform-v1.json -Algorithm SHA256).Hash
$firstUndercover = (Get-FileHash packages/games/undercover/tests/fixtures/d1/undercover-classic-v1.json -Algorithm SHA256).Hash
npm run baseline:d1
$secondUno = (Get-FileHash packages/games/uno/tests/fixtures/d1/uno-legacy-platform-v1.json -Algorithm SHA256).Hash
$secondUndercover = (Get-FileHash packages/games/undercover/tests/fixtures/d1/undercover-classic-v1.json -Algorithm SHA256).Hash
if ($firstUno -ne $secondUno -or $firstUndercover -ne $secondUndercover) { throw 'D1 fixture 生成不确定' }
Write-Output "UNO=$firstUno"
Write-Output "UNDERCOVER=$firstUndercover"
```

Expected: 两次生成后的 SHA-256 完全一致；输出两个非空 64 位十六进制摘要。

- [ ] **Step 5: 运行基线重放测试**

Run:

```powershell
npx tsx --test packages/games/uno/tests/baseline.test.ts packages/games/undercover/tests/baseline.test.ts
```

Expected: `2` tests，`2` pass，`0` fail；最终结果均非 null；随机游标与 fixture 完全一致。

---

### Task 7: 完成 D1 全量验证与审批前报告

**Files:**
- Modify: `docs/superpowers/reports/2026-08-02-d1-baseline-results.md`

- [ ] **Step 1: 检查禁止修改范围**

Run:

```powershell
git diff --name-only HEAD
```

Expected: 输出中不得包含：

```text
packages/shared/src/game/contract.ts
packages/shared/src/game/rules/
packages/server/src/core/game/session.ts
packages/server/src/core/executor.ts
packages/games/undercover/server/module.ts
packages/games/uno/server/module.ts
packages/games/landlord/server/module.ts
packages/games/werewolf/server/module.ts
packages/server/src/persistence/
```

若命中，停止验收并只撤销本次 D1 造成的对应修改；不得覆盖用户原有改动，也不得通过更新报告掩盖越界。

- [ ] **Step 2: 执行占位符和状态漂移扫描**

Run:

```powershell
$paths = @('compliance/d1', 'docs/superpowers/reports/2026-08-02-d1-baseline-results.md')
$redFlags = @((@('T','B','D') -join ''), (@('T','O','D','O') -join ''), (@('执','行','时','从','输','出','填','写') -join ''), (@('执','行','时','填','写','首','次','与','二','次','生','成','一','致') -join ''), '标准规则', '原创版骗子酒馆')
Get-ChildItem $paths -Recurse -File | Select-String -Pattern $redFlags
```

Expected: 无输出。代码中已有历史注释不属于本次文档扫描范围。

- [ ] **Step 3: 执行全量质量门**

Run:

```powershell
npm run typecheck
npm run lint
npm run test
npm run compliance:d1
npm run build
npm run compliance:d1
```

Expected:

- `typecheck` 退出码 `0`。
- `lint` 退出码 `0`。
- 全量测试退出码 `0`，包含两个基线重放测试和四个扫描器测试。
- 构建前后两次扫描均输出 `D1 compliance: PASS`。
- `build` 退出码 `0`。
- `packages/client/dist` 中不含永久禁入名称、别名、模块、路由或静态资源。

- [ ] **Step 4: 验证新建房全部被准入门阻断**

Run:

```powershell
npx tsx --test packages/server/tests/executor.test.ts packages/server/tests/room.test.ts packages/server/tests/gameSession.test.ts packages/shared/tests/catalog.test.ts
```

Expected: 全部 PASS；四个 registry 模块仍可用于模块测试与历史恢复，但目录无 `playable` 条目，新建房返回 `ACTION_NOT_ALLOWED`。

- [ ] **Step 5: 在报告追加改动后结果**

使用与 Task 1 相同的 `Invoke-D1Gate` 采集函数重新执行质量门，并通过 PowerShell 直接追加命令、退出码和最后一行真实输出。随后以 `Get-FileHash -Algorithm SHA256` 读取两份 fixture 的实际摘要并追加固定基线表。准入结论只在以下事实均由本次输出证明时追加：四款目录状态与台账一致、构建前后扫描通过、禁止修改范围无差异。

报告生成命令不得先写入成功退出码、测试数量、构建摘要或 SHA-256 示例值；任何失败都保留实际退出码和输出。完成后扫描 `待填`、`占位`、`执行时`、`TBD`、`TODO` 以及 64 位零值摘要，命中即不得进入审批。

- [ ] **Step 6: 最终差异与质量门自检**

Run:

```powershell
git status --short --branch
git diff --stat
git diff --name-only HEAD
npm run ci
npm run build
npm run compliance:d1
```

Expected:

- 工作树可包含本计划明确列出的未提交变更，不要求自动提交或工作树干净。
- 差异文件不超出本计划允许范围，且不包含禁止修改路径。
- `npm run ci`、`npm run build`、`npm run compliance:d1` 全部退出码 `0`；若失败则 D1 保持未批准并如实报告。
- 不执行分支创建/切换、add、commit、merge、push、tag、stash、reset 或 clean；后续版本控制操作等待用户明确授权。

---

## 实施后人工批准清单

D1 自动化通过不等于权利审批完成。进入 D2 前，审批人必须逐项确认：

- [x] `compliance/d1/game-admission.json` 中每个现有游戏和 ruleset 均有唯一、准确的冻结状态。
- [x] 没有把缺失的授权记录、审批人、权利范围或到期日伪造成已批准。
- [x] `uno_legacy_platform_v1` 与 `undercover_classic_v1` 仅作为兼容基线，没有被描述为授权官方规则。
- [x] `uno_platform_house_v1` 与 `undercover_blank_v1` 未在 D1 中实现或开放。
- [x] 永久禁入资料只存在于隔离研究目录和最高优先级规范，不进入产品、构建或发布归档。
- [x] 固定种子、动作轨迹、玩家视角、观战视角、最终状态和结果均已纳入审阅差异且可重复生成。
- [x] 改动前与改动后质量门结果都已如实记录。
- [x] 禁止范围按结果报告中的 Task 6 前后内容哈希完成归因；接受历史聚合工作树无法证明“相对 HEAD 零命中”的例外，不将其改写为字面通过。
- [x] 用户已明确批准保守 D1 基线，仅允许开始内部 D2 重构；D1 不稳定任何规则原语 API，也不批准任何游戏发布。

## 版本控制约束

本计划不规定或执行提交序列。所有改动保持可审阅状态；只有用户明确授权具体版本控制操作后，才可单独执行对应操作。禁止自动创建或切换分支、暂存、提交、合并、推送、打标签、stash、reset 或 clean。
