/**
 * D4-TOOLS：模块生成器。
 * 生成标准模块骨架（manifest/reducer/初始状态）+ 契约测试占位。
 * 刻意不生成伪业务逻辑：reduce 对一切动作返回 NOT_IMPLEMENTED 拒绝，
 * 由开发者按真实规则集接入 reducer 后再补用例。
 * 用法：node scripts/d4/generate-module.ts --out <dir> --game-id <id> --ruleset-id <rid>
 *        --display-name <name> [--min-players <n>] [--max-players <n>]
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export interface GenerateModuleOptions {
  out: string;
  gameId: string;
  rulesetId: string;
  displayName: string;
  minPlayers?: number;
  maxPlayers?: number;
}

export interface GenerateModuleSummary {
  files: string[];
  out: string;
  gameId: string;
  rulesetId: string;
}

function assertId(name: string, value: string | undefined): string {
  if (value === undefined || value.trim().length === 0) {
    throw new Error(`${name} 不得为空`);
  }
  return value.trim();
}

function assertPlayers(min: number | undefined, max: number | undefined): { min: number; max: number } {
  const resolvedMin = min ?? 2;
  const resolvedMax = max ?? 6;
  if (!Number.isSafeInteger(resolvedMin) || resolvedMin < 2) throw new Error('minPlayers 必须是 >= 2 的整数');
  if (!Number.isSafeInteger(resolvedMax) || resolvedMax < resolvedMin) {
    throw new Error('maxPlayers 必须是 >= minPlayers 的整数');
  }
  return { min: resolvedMin, max: resolvedMax };
}

function manifestSource(options: Required<GenerateModuleOptions>): string {
  return `import type { GameManifest } from '@ldj/shared';

/**
 * ${options.displayName} 游戏 manifest（由 scripts/d4/generate-module.ts 生成）。
 */
export const MANIFEST = {
  id: '${options.gameId}',
  displayName: '${options.displayName}',
  version: '0.1.0',
  minPlayers: ${options.minPlayers},
  maxPlayers: ${options.maxPlayers},
  stateSchemaVersion: 1,
} as const satisfies GameManifest;
`;
}

function moduleSource(options: Required<GenerateModuleOptions>): string {
  return `/**
 * ${options.displayName} 标准模块骨架（由 scripts/d4/generate-module.ts 生成）。
 * 骨架只做契约占位，不包含伪业务逻辑：reduce 对一切动作返回 NOT_IMPLEMENTED。
 * 接入真实规则时在此实现 reducer，并保持本文件的纯函数边界（无 I/O、无真实时钟、无全局随机源）。
 */
import type { GameModuleV2 } from '@ldj/shared';
import { MANIFEST } from '../shared/manifest.ts';

export const IDENTITY = {
  engineContractVersion: 2 as const,
  rulesetId: '${options.rulesetId}',
  viewVersion: 1,
} as const;

export interface SkeletonConfig {
  rulesetId: string;
}

export interface SkeletonState {
  schemaVersion: 1;
  players: string[];
  phase: 'idle';
  seq: number;
  result: { winner: string | null } | null;
}

export type SkeletonAction = { type: 'noop' };

export type SkeletonEvent = { type: 'noop' };

export interface SkeletonPlayerView {
  playerId: string;
  phase: 'idle';
  me: { playerId: string; seat: number } | null;
}

export interface SkeletonSpectatorView {
  phase: 'idle';
  playerIds: string[];
}

export type SkeletonResult = { winner: string | null };

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

export const skeletonModule: GameModuleV2<
  SkeletonConfig,
  SkeletonState,
  SkeletonAction,
  SkeletonPlayerView,
  SkeletonSpectatorView,
  SkeletonEvent,
  SkeletonResult
> = {
  manifest: MANIFEST,
  identity: IDENTITY,
  registeredRulesets: ['${options.rulesetId}'],
  defaultRulesetId: '${options.rulesetId}',
  parseConfig(input) {
    if (typeof input !== 'object' || input === null) throw new Error('配置必须是对象');
    const rulesetId = (input as { rulesetId?: unknown }).rulesetId;
    if (rulesetId !== undefined && (typeof rulesetId !== 'string' || rulesetId.length === 0)) {
      throw new Error('rulesetId 必须是非空字符串');
    }
    return { rulesetId: rulesetId ?? '${options.rulesetId}' };
  },
  parseAction(input) {
    if (typeof input !== 'object' || input === null) throw new Error('动作必须是对象');
    const type = (input as { type?: unknown }).type;
    if (type !== 'noop') throw new Error('骨架模块仅接受 noop 动作占位');
    return { type: 'noop' };
  },
  parseState(input) {
    if (typeof input !== 'object' || input === null) throw new Error('状态必须是对象');
    const state = input as { players?: unknown; phase?: unknown; seq?: unknown; result?: unknown };
    if (!isStringArray(state.players)) throw new Error('状态缺少合法 players 数组');
    if (state.phase !== 'idle') throw new Error('状态 phase 必须为 idle');
    if (typeof state.seq !== 'number') throw new Error('状态 seq 必须是数字');
    return state as unknown as SkeletonState;
  },
  parsePlayerView(input) {
    if (typeof input !== 'object' || input === null) throw new Error('玩家视角必须是对象');
    const view = input as { playerId?: unknown; phase?: unknown; me?: unknown };
    if (typeof view.playerId !== 'string' || view.playerId.length === 0) throw new Error('玩家视角缺少 playerId');
    if (view.phase !== 'idle') throw new Error('玩家视角 phase 必须为 idle');
    if (view.me !== null && view.me !== undefined) {
      const me = view.me as { playerId?: unknown; seat?: unknown };
      if (me.playerId !== view.playerId) throw new Error('玩家视角 me.playerId 与 playerId 不一致');
      if (typeof me.seat !== 'number') throw new Error('玩家视角 me.seat 必须是数字');
    }
    return view as unknown as SkeletonPlayerView;
  },
  parseSpectatorView(input) {
    if (typeof input !== 'object' || input === null) throw new Error('观战视角必须是对象');
    const view = input as { phase?: unknown; playerIds?: unknown };
    if (view.phase !== 'idle') throw new Error('观战视角 phase 必须为 idle');
    if (!isStringArray(view.playerIds)) throw new Error('观战视角缺少 playerIds');
    return view as unknown as SkeletonSpectatorView;
  },
  assertInvariants(state) {
    const unique = new Set(state.players);
    if (unique.size !== state.players.length) throw new Error('玩家列表存在重复');
    if (state.players.length < MANIFEST.minPlayers || state.players.length > MANIFEST.maxPlayers) {
      throw new Error(\`玩家数量 \${state.players.length} 超出 [\${MANIFEST.minPlayers}, \${MANIFEST.maxPlayers}]\`);
    }
  },
  snapshotMigrations: {},
  createInitialState(_ctx, players, _config) {
    const unique = new Set(players);
    if (unique.size !== players.length) throw new Error('玩家列表存在重复');
    if (players.length < MANIFEST.minPlayers || players.length > MANIFEST.maxPlayers) {
      throw new Error(\`玩家数量 \${players.length} 超出 [\${MANIFEST.minPlayers}, \${MANIFEST.maxPlayers}]\`);
    }
    return { schemaVersion: 1, players: [...players], phase: 'idle', seq: 0, result: null };
  },
  reduce(_ctx, _state, _actor, _action) {
    // 骨架占位：不生成伪业务逻辑。接入真实规则时在此实现 reducer。
    return { ok: false, code: 'NOT_IMPLEMENTED', message: '骨架模块未实现任何业务规则' };
  },
  getPlayerView(state, playerId) {
    const seat = state.players.indexOf(playerId);
    return { playerId, phase: state.phase, me: seat === -1 ? null : { playerId, seat } };
  },
  getSpectatorView(state) {
    return { phase: state.phase, playerIds: [...state.players] };
  },
};
`;
}

function indexSource(): string {
  return `/**
 * 服务端入口（由 scripts/d4/generate-module.ts 生成）。
 */
export { IDENTITY, skeletonModule } from './module.ts';
export type {
  SkeletonAction,
  SkeletonConfig,
  SkeletonEvent,
  SkeletonPlayerView,
  SkeletonResult,
  SkeletonSpectatorView,
  SkeletonState,
} from './module.ts';
`;
}

function contractTestSource(options: Required<GenerateModuleOptions>): string {
  return `/**
 * 契约测试占位（由 scripts/d4/generate-module.ts 生成）。
 * 放入 packages/games/${options.gameId}/tests/ 后可用测试运行器直接运行；
 * 实现业务规则时把 reduce 从「一律拒绝」替换为真实逻辑并补齐用例。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { skeletonModule } from '../server/module.ts';
import {
  deterministicContext,
  versionedContractAssertions,
} from '../../../shared/tests/helpers/versionedGameContract.ts';

test('${options.rulesetId} 骨架契约：identity/initial/pure/被拒动作不推进', () => {
  versionedContractAssertions.identity(skeletonModule);
  const ctx = deterministicContext('d4:${options.rulesetId}:contract');
  const players = ['p1', 'p2'];
  versionedContractAssertions.initial(skeletonModule, ctx, players, {});
  const state = skeletonModule.createInitialState(ctx, players, skeletonModule.parseConfig({}));
  versionedContractAssertions.rejectedDoesNotAdvance(
    skeletonModule,
    ctx,
    state,
    { kind: 'player', playerId: 'p1' },
    { type: 'noop' },
  );
  assert.equal(state.phase, 'idle');
});
`;
}

export async function runGenerateCli(options: GenerateModuleOptions): Promise<GenerateModuleSummary> {
  const resolved = {
    ...options,
    gameId: assertId('gameId', options.gameId),
    rulesetId: assertId('rulesetId', options.rulesetId),
    displayName: assertId('displayName', options.displayName),
    ...assertPlayers(options.minPlayers, options.maxPlayers),
  } as Required<GenerateModuleOptions>;

  const base = resolve(options.out);
  const targets: Array<{ rel: string; content: string }> = [
    { rel: 'shared/manifest.ts', content: manifestSource(resolved) },
    { rel: 'server/module.ts', content: moduleSource(resolved) },
    { rel: 'server/index.ts', content: indexSource() },
    { rel: 'tests/contract.test.ts', content: contractTestSource(resolved) },
  ];
  const files: string[] = [];
  for (const target of targets) {
    const absolute = resolve(base, target.rel);
    await mkdir(dirname(absolute), { recursive: true });
    await writeFile(absolute, target.content, 'utf8');
    files.push(target.rel);
  }
  console.log(`generate-module:OK gameId=${resolved.gameId} rulesetId=${resolved.rulesetId} files=${files.length}`);
  return { files, out: base, gameId: resolved.gameId, rulesetId: resolved.rulesetId };
}

const invokedDirectly = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href === import.meta.url
  : false;
if (invokedDirectly) {
  const args = process.argv.slice(2);
  const read = (flag: string): string | undefined => {
    const index = args.indexOf(flag);
    return index === -1 ? undefined : args[index + 1];
  };
  await runGenerateCli({
    out: read('--out') ?? '.',
    gameId: read('--game-id') ?? '',
    rulesetId: read('--ruleset-id') ?? '',
    displayName: read('--display-name') ?? '',
    minPlayers: read('--min-players') === undefined ? undefined : Number(read('--min-players')),
    maxPlayers: read('--max-players') === undefined ? undefined : Number(read('--max-players')),
  });
}
