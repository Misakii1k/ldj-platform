/**
 * D4-TOOLS：开发/测试环境诊断器。
 * 输出阶段、合法 actor、合法动作、计时器、序号、随机值编号。
 * 默认关闭：不传 enabled 只返回 enabled:false 占位，绝不进入任何玩家视角；
 * 脚本独立于 packages/ 生产代码，不进入客户端/服务端构建路径。
 * 用法：node scripts/d4/diagnostics.ts --state <state.json> --module <path>
 *        [--export <name>] [--players a,b] [--timers <timers.json>] [--rng-state <rng.json>]
 *        [--seed <s>] [--enabled] [--out <out.json>]
 */
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createSeededRandom } from '@ldj/shared';
import type { AnyGameModuleV2 } from '@ldj/shared';

export interface DiagnosticsOptions {
  enabled: boolean;
  module: AnyGameModuleV2;
  state: unknown;
  players: string[];
  timers?: unknown[];
  rngState?: unknown;
  seed?: string;
}

export interface DiagnosticsResult {
  enabled: boolean;
  message?: string;
  rulesetId?: string;
  phase?: string | null;
  seq?: number | null;
  randomCursor?: number | null;
  timers?: unknown[];
  legalActors?: Array<{ playerId: string; action: unknown | null }>;
  generatedAt?: string;
}

function extractCursor(rngState: unknown): number | null {
  if (typeof rngState !== 'object' || rngState === null) return null;
  const candidate = rngState as { cursor?: unknown; index?: unknown };
  const value = typeof candidate.cursor === 'number' ? candidate.cursor
    : typeof candidate.index === 'number' ? candidate.index : null;
  return value;
}

export function computeDiagnostics(options: DiagnosticsOptions): DiagnosticsResult {
  if (!options.enabled) {
    return { enabled: false, message: 'diagnostics 默认关闭；显式传 --enabled 才启用' };
  }
  const { module, state, players } = options;
  const phase = (state as { phase?: unknown }).phase;
  const seqRaw = (state as { seq?: unknown }).seq;
  const randomCursor = extractCursor(options.rngState);
  const seedPrefix = options.seed ?? 'd4:diagnostics';
  const legalActors = players.map((playerId) => {
    let action: unknown = null;
    if (module.pickBotAction) {
      try {
        const view = module.getPlayerView(state, playerId);
        const random = createSeededRandom(`${seedPrefix}:${playerId}`);
        action = module.pickBotAction({ view, playerId, random }) ?? null;
      } catch {
        action = null;
      }
    }
    return { playerId, action };
  });
  return {
    enabled: true,
    rulesetId: module.identity.rulesetId,
    phase: typeof phase === 'string' ? phase : null,
    seq: typeof seqRaw === 'number' ? seqRaw : null,
    randomCursor,
    timers: options.timers ?? [],
    legalActors,
    generatedAt: new Date().toISOString(),
  };
}

export interface DiagnosticsCliOptions {
  enabled: boolean;
  statePath: string;
  modulePath: string;
  exportName?: string;
  players?: string;
  timersPath?: string;
  rngStatePath?: string;
  seed?: string;
  outPath?: string;
}

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

export async function runDiagnosticsCli(options: DiagnosticsCliOptions): Promise<DiagnosticsResult> {
  if (!options.enabled) {
    const placeholder = { enabled: false, message: 'diagnostics 默认关闭；显式传 --enabled 才启用' };
    console.log(JSON.stringify(placeholder, null, 2));
    return placeholder;
  }
  const namespace = (await import(pathToFileURL(resolve(options.modulePath)).href)) as Record<string, unknown>;
  const module = resolveVersionedModule(namespace, options.exportName);
  const rawState = JSON.parse(await readFile(resolve(options.statePath), 'utf8')) as unknown;
  const state = module.parseState(rawState);
  const players = options.players
    ? options.players.split(',').map((entry) => entry.trim()).filter((entry) => entry.length > 0)
    : Object.keys((state as { players?: Record<string, unknown> }).players ?? {});
  const timers = options.timersPath
    ? JSON.parse(await readFile(resolve(options.timersPath), 'utf8')) as unknown[]
    : undefined;
  const rngState = options.rngStatePath
    ? JSON.parse(await readFile(resolve(options.rngStatePath), 'utf8')) as unknown
    : undefined;
  const result = computeDiagnostics({ enabled: true, module, state, players, timers, rngState, seed: options.seed });
  const output = `${JSON.stringify(result, null, 2)}\n`;
  if (options.outPath) {
    await writeFile(resolve(options.outPath), output, 'utf8');
    console.log(`diagnostics:OK out=${resolve(options.outPath)} phase=${result.phase} legalActors=${result.legalActors?.length ?? 0}`);
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
  await runDiagnosticsCli({
    enabled: args.includes('--enabled'),
    statePath: read('--state') ?? '',
    modulePath: read('--module') ?? '',
    exportName: read('--export'),
    players: read('--players'),
    timersPath: read('--timers'),
    rngStatePath: read('--rng-state'),
    seed: read('--seed'),
    outPath: read('--out'),
  });
}
