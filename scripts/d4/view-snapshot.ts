/**
 * D4-TOOLS：视角快照工具。
 * 逐玩家 + 观战视角快照与字节比对：输出每份视角的规范化 JSON、字节数与 SHA-256，
 * 以及观战视角与每个玩家视角的字节比较结果（spectator 与玩家视角字节相同 = 疑似泄漏）。
 * 纯只读工具，不进入任何玩家视角；用于验收「视角 Schema + 无秘密泄漏 + 快照可重放」。
 * 用法：node scripts/d4/view-snapshot.ts --module <path> [--export <name>]
 *        --state <state.json> [--players a,b] [--seed <s>] [--out <out.json>]
 */
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { AnyGameModuleV2 } from '@ldj/shared';

export interface SnapshotCaptureOptions {
  module: AnyGameModuleV2;
  state: unknown;
  players: string[];
  seed?: string;
}

export interface ViewSnapshotResult {
  schemaVersion: 1;
  rulesetId: string;
  viewVersion: number;
  players: string[];
  seed: string;
  snapshots: Record<string, { sha256: string; bytes: number; json: string }>;
  spectator: { sha256: string; bytes: number; json: string };
  byteComparisons: Array<{ left: string; right: string; equal: boolean }>;
  leaks: string[];
}

/** 规范化 JSON：键排序、剔除 undefined，保证字节稳定可复现 */
function normalizeJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeJson);
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(record)
        .filter((key) => record[key] !== undefined)
        .sort()
        .map((key) => [key, normalizeJson(record[key])]),
    );
  }
  return value;
}

function stableStringify(value: unknown): string {
  return JSON.stringify(normalizeJson(value));
}

function fingerprint(json: string): { sha256: string; bytes: number; json: string } {
  return { sha256: createHash('sha256').update(json, 'utf8').digest('hex'), bytes: Buffer.byteLength(json, 'utf8'), json };
}

export function captureSnapshot(options: SnapshotCaptureOptions): ViewSnapshotResult {
  const { module, state, seed = 'd4:view-snapshot' } = options;
  const players = [...new Set(options.players)];
  const snapshots: ViewSnapshotResult['snapshots'] = {};
  for (const playerId of players) {
    snapshots[playerId] = fingerprint(stableStringify(module.getPlayerView(state, playerId)));
  }
  const spectator = fingerprint(stableStringify(module.getSpectatorView(state)));
  const byteComparisons = players.map((playerId) => ({
    left: 'spectator',
    right: playerId,
    equal: spectator.sha256 === snapshots[playerId]!.sha256,
  }));
  const leaks = byteComparisons
    .filter((comparison) => comparison.equal)
    .map((comparison) => `spectator==${comparison.right}`);
  return {
    schemaVersion: 1,
    rulesetId: module.identity.rulesetId,
    viewVersion: module.identity.viewVersion,
    players,
    seed,
    snapshots,
    spectator,
    byteComparisons,
    leaks,
  };
}

/** 从模块命名空间解析 V2 模块：优先 --export，否则取首个 engineContractVersion===2 的导出 */
function resolveVersionedModule(namespace: Record<string, unknown>, exportName?: string): AnyGameModuleV2 {
  if (exportName !== undefined) {
    const candidate = namespace[exportName] as AnyGameModuleV2 | undefined;
    if (!candidate) throw new Error(`导出 ${exportName} 不存在`);
    if (candidate.identity?.engineContractVersion !== 2) throw new Error(`导出 ${exportName} 不是 V2 模块`);
    return candidate;
  }
  for (const value of Object.values(namespace)) {
    const candidate = value as AnyGameModuleV2 | undefined;
    if (candidate && typeof candidate === 'object' && candidate.identity?.engineContractVersion === 2) {
      return candidate;
    }
  }
  throw new Error('未找到任何 engineContractVersion===2 的模块导出（可用 --export 指定）');
}

export interface ViewSnapshotCliOptions {
  modulePath: string;
  exportName?: string;
  statePath: string;
  players?: string;
  seed?: string;
  outPath?: string;
}

export async function runViewSnapshotCli(options: ViewSnapshotCliOptions): Promise<ViewSnapshotResult> {
  const modulePath = resolve(options.modulePath);
  const namespace = (await import(pathToFileURL(modulePath).href)) as Record<string, unknown>;
  const module = resolveVersionedModule(namespace, options.exportName);
  const rawState = JSON.parse(await readFile(resolve(options.statePath), 'utf8')) as unknown;
  const state = module.parseState(rawState);
  const players = options.players
    ? options.players.split(',').map((entry) => entry.trim()).filter((entry) => entry.length > 0)
    : Object.keys((state as { players?: Record<string, unknown> }).players ?? {});
  const result = captureSnapshot({ module, state, players, seed: options.seed });
  const output = `${JSON.stringify(result, null, 2)}\n`;
  if (options.outPath) {
    await writeFile(resolve(options.outPath), output, 'utf8');
    console.log(`view-snapshot:OK out=${resolve(options.outPath)} players=${players.length} leaks=${result.leaks.length}`);
  } else {
    console.log(output.trimEnd());
  }
  return result;
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
  await runViewSnapshotCli({
    modulePath: read('--module') ?? '',
    exportName: read('--export'),
    statePath: read('--state') ?? '',
    players: read('--players'),
    seed: read('--seed'),
    outPath: read('--out'),
  });
}
