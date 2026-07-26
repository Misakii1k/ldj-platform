import {
  playerIdSchema,
  resumeTokenSchema,
  type ServerMessage,
} from '@lan-party/shared';
import { z } from 'zod';

export const ackCredentialResultSchema = z
  .object({
    playerId: playerIdSchema,
    resumeToken: resumeTokenSchema,
  })
  .strict();

export function parseAckCredential(
  message: Extract<ServerMessage, { type: 'ack' }>,
): z.infer<typeof ackCredentialResultSchema> | undefined {
  const parsed = ackCredentialResultSchema.safeParse(message.payload.result);
  return parsed.success ? parsed.data : undefined;
}
