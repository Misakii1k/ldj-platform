/**
 * 游戏模块注册表（SPEC §8.6）：新游戏接入只在此登记，不改内核执行链（G-06）。
 * 内核以类型擦除的句柄透传状态/动作，具体类型由模块内部 schema 把关。
 */
import type { GameModule } from '@ldj/shared';
import { undercoverModule } from '@ldj/game-undercover/server';

/** 类型擦除的模块句柄：内核不感知具体泛型（GameModule 采用方法签名，双变兼容） */
export type ErasedGameModule = GameModule<unknown, unknown, unknown, unknown, unknown, unknown, unknown>;

const REGISTRY = new Map<string, ErasedGameModule>([
  [undercoverModule.manifest.id, undercoverModule],
]);

/** R1 只有一款游戏：未指定 game_id 时的默认模块 */
export const DEFAULT_GAME_ID = undercoverModule.manifest.id;

export function getGameModule(moduleId: string): ErasedGameModule | undefined {
  return REGISTRY.get(moduleId);
}

export function listGameManifests(): ErasedGameModule['manifest'][] {
  return [...REGISTRY.values()].map((m) => m.manifest);
}
