import type { GameManifest } from '@ldj/shared';

export const ECHO_JUDGE_MANIFEST = {
  id: 'echo-judge',
  displayName: '伪人测试',
  version: '0.1.0',
  minPlayers: 3,
  maxPlayers: 12,
  stateSchemaVersion: 1,
  rulesets: ['echo_judge_v1'],
} as const satisfies GameManifest & { rulesets: readonly string[] };

export type EchoJudgeManifest = typeof ECHO_JUDGE_MANIFEST;
