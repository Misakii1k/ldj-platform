import { z } from 'zod';
import type {
  PartySandboxPlayerView,
  PartySandboxPublicView,
  PartySandboxState,
} from './types.ts';
import {
  partySandboxConfigSchema,
  sandboxCardSchema,
  sandboxPropSchema,
} from './schemas.ts';

const pid = z.string().min(1).max(64);

export const activityLogItemSchema = z
  .object({
    id: z.string().min(1),
    timestamp: z.number(),
    playerId: z.string().min(1),
    kind: z.enum([
      'revolver',
      'dice',
      'bell',
      'deck',
      'timer',
      'coin',
      'wheel',
      'scoreboard',
      'ai',
      'table',
    ]),
    text: z.string().min(1),
  })
  .strict();

export const partySandboxPlayerViewSchema = z
  .object({
    schemaVersion: z.literal(1),
    phase: z.literal('sandbox'),
    players: z.array(pid),
    config: partySandboxConfigSchema,
    props: z.record(sandboxPropSchema),
    propOrder: z.array(z.string()),
    myHand: z.array(sandboxCardSchema),
    playerHandCounts: z.record(pid, z.number().int().min(0)),
    activityLogs: z.array(activityLogItemSchema),
    assistantMessage: z
      .object({
        text: z.string(),
        timestamp: z.number(),
        prompt: z.string().optional(),
      })
      .nullable(),
    me: z
      .object({
        playerId: pid,
      })
      .nullable(),
  })
  .strict();

export const partySandboxPublicViewSchema = z
  .object({
    schemaVersion: z.literal(1),
    phase: z.literal('sandbox'),
    players: z.array(pid),
    config: partySandboxConfigSchema,
    props: z.record(sandboxPropSchema),
    propOrder: z.array(z.string()),
    playerHandCounts: z.record(pid, z.number().int().min(0)),
    activityLogs: z.array(activityLogItemSchema),
    assistantMessage: z
      .object({
        text: z.string(),
        timestamp: z.number(),
        prompt: z.string().optional(),
      })
      .nullable(),
  })
  .strict();

export function buildPartySandboxPlayerView(
  state: PartySandboxState,
  playerId: string,
): PartySandboxPlayerView {
  const isMember = state.players.includes(playerId);
  const myHand = isMember ? (state.hands[playerId] ?? []) : [];
  const playerHandCounts: Record<string, number> = {};
  for (const pId of state.players) {
    playerHandCounts[pId] = (state.hands[pId] ?? []).length;
  }

  return {
    schemaVersion: 1,
    phase: 'sandbox',
    players: [...state.players],
    config: { ...state.config },
    props: structuredClone(state.props),
    propOrder: [...state.propOrder],
    myHand: structuredClone(myHand),
    playerHandCounts,
    activityLogs: structuredClone(state.activityLogs),
    assistantMessage: state.assistantMessage ? { ...state.assistantMessage } : null,
    me: isMember ? { playerId } : null,
  };
}

export function buildPartySandboxPublicView(
  state: PartySandboxState,
): PartySandboxPublicView {
  const playerHandCounts: Record<string, number> = {};
  for (const pId of state.players) {
    playerHandCounts[pId] = (state.hands[pId] ?? []).length;
  }

  return {
    schemaVersion: 1,
    phase: 'sandbox',
    players: [...state.players],
    config: { ...state.config },
    props: structuredClone(state.props),
    propOrder: [...state.propOrder],
    playerHandCounts,
    activityLogs: structuredClone(state.activityLogs),
    assistantMessage: state.assistantMessage ? { ...state.assistantMessage } : null,
  };
}
