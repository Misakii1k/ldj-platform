export type HostedPrompt = string | ((context: HostedPromptContext) => string);

export interface HostedPromptContext {
  participantId: string;
  position: number;
  total: number;
}

export interface CreateHostedSequenceInput {
  id: string;
  participantIds: readonly string[];
  now: number;
  turnDurationMs: number;
  prompt: HostedPrompt;
}

export interface HostedSequenceState {
  id: string;
  participantIds: readonly string[];
  completedParticipantIds: readonly string[];
  timedOutParticipantIds: readonly string[];
  currentIndex: number;
  currentParticipantId: string | null;
  turnDurationMs: number;
  deadlineAt: number | null;
  timerId: string | null;
  prompt: HostedPrompt;
  status: 'active' | 'completed';
}

export interface HostedProgress {
  completed: number;
  total: number;
  finished: boolean;
}

function assertInput(input: CreateHostedSequenceInput): void {
  if (!/^[A-Za-z0-9_-]+$/.test(input.id)) throw new Error('主持序列 ID 格式无效');
  if (input.participantIds.length === 0) throw new Error('主持序列至少需要一名参与者');
  if (input.participantIds.some((id) => !/^[A-Za-z0-9_-]+$/.test(id))) throw new Error('参与者 ID 格式无效');
  if (new Set(input.participantIds).size !== input.participantIds.length) throw new Error('参与者不能重复');
  if (!Number.isFinite(input.now)) throw new Error('当前时间必须是有限数值');
  if (!Number.isFinite(input.turnDurationMs) || input.turnDurationMs <= 0) throw new Error('主持时长必须是正数');
}

function timerId(id: string, index: number, participantId: string): string {
  return `hosted:${id}:${index}:${participantId}`;
}

function advance(
  state: HostedSequenceState,
  now: number,
  completedParticipantId: string | null,
  timedOutParticipantId: string | null,
): HostedSequenceState {
  const nextIndex = state.currentIndex + 1;
  const currentParticipantId = state.participantIds[nextIndex] ?? null;
  return {
    ...state,
    completedParticipantIds: completedParticipantId
      ? [...state.completedParticipantIds, completedParticipantId]
      : [...state.completedParticipantIds],
    timedOutParticipantIds: timedOutParticipantId
      ? [...state.timedOutParticipantIds, timedOutParticipantId]
      : [...state.timedOutParticipantIds],
    currentIndex: nextIndex,
    currentParticipantId,
    deadlineAt: currentParticipantId ? now + state.turnDurationMs : null,
    timerId: currentParticipantId ? timerId(state.id, nextIndex, currentParticipantId) : null,
    status: currentParticipantId ? 'active' : 'completed',
  };
}

export function createHostedSequence(input: CreateHostedSequenceInput): HostedSequenceState {
  assertInput(input);
  const participantIds = [...input.participantIds];
  const currentParticipantId = participantIds[0]!;
  return {
    id: input.id,
    participantIds,
    completedParticipantIds: [],
    timedOutParticipantIds: [],
    currentIndex: 0,
    currentParticipantId,
    turnDurationMs: input.turnDurationMs,
    deadlineAt: input.now + input.turnDurationMs,
    timerId: timerId(input.id, 0, currentParticipantId),
    prompt: input.prompt,
    status: 'active',
  };
}

export function completeHostedTurn(
  state: HostedSequenceState,
  participantId: string,
  now: number,
): HostedSequenceState {
  if (state.status === 'completed' || state.currentParticipantId !== participantId) {
    throw new Error('只有当前参与者可以完成主持轮次');
  }
  return advance(state, now, participantId, null);
}

export function timeoutHostedTurn(
  state: HostedSequenceState,
  deliveredTimerId: string,
  now: number,
): HostedSequenceState {
  if (
    state.status === 'completed' ||
    state.timerId !== deliveredTimerId ||
    state.deadlineAt === null ||
    now < state.deadlineAt ||
    state.currentParticipantId === null
  ) {
    return state;
  }
  return advance(state, now, null, state.currentParticipantId);
}

export function getHostedPrompt(state: HostedSequenceState): string | null {
  if (state.currentParticipantId === null) return null;
  return typeof state.prompt === 'string'
    ? state.prompt
    : state.prompt({
        participantId: state.currentParticipantId,
        position: state.currentIndex,
        total: state.participantIds.length,
      });
}

export function getHostedProgress(state: HostedSequenceState): HostedProgress {
  const completed = state.completedParticipantIds.length + state.timedOutParticipantIds.length;
  return { completed, total: state.participantIds.length, finished: state.status === 'completed' };
}
