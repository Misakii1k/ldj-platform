/** 游戏模块注册表：只有完整通过规则测试的模块才注册为可玩。 */
import type { GameModule } from '@ldj/shared';
import { undercoverModule } from '@ldj/game-undercover/server';
import { unoModule } from '@ldj/game-uno/server';
import { landlordModule } from '@ldj/game-landlord/server';
import { werewolfModule } from '@ldj/game-werewolf/server';
export type ErasedGameModule = GameModule<unknown, unknown, unknown, unknown, unknown, unknown, unknown>;
const MODULES: ErasedGameModule[] = [undercoverModule, unoModule, landlordModule, werewolfModule];
const REGISTRY = new Map<string, ErasedGameModule>(MODULES.map((module) => [module.manifest.id, module]));
export const DEFAULT_GAME_ID = undercoverModule.manifest.id;
export function getGameModule(moduleId: string): ErasedGameModule | undefined { return REGISTRY.get(moduleId); }
export function listGameManifests(): ErasedGameModule['manifest'][] { return MODULES.map((module) => module.manifest); }
