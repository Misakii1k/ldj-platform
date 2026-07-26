import { z } from 'zod';

const speakingDurationSchema = z.union([z.literal(30), z.literal(60), z.literal(90)]);
const votingDurationSchema = z.union([z.literal(30), z.literal(45), z.literal(60)]);

export const UndercoverConfigSchema = z
  .object({
    speakingDurationSeconds: speakingDurationSchema.default(60),
    votingDurationSeconds: votingDurationSchema.default(45),
  })
  .strict();

export type UndercoverConfigInput = z.input<typeof UndercoverConfigSchema>;
export type UndercoverConfig = z.output<typeof UndercoverConfigSchema>;

export function parseUndercoverConfig(input: unknown): UndercoverConfig {
  return UndercoverConfigSchema.parse(input);
}
