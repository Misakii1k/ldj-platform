export type SafeTimeoutStrategy = 'confirm_current' | 'skip' | 'forfeit_turn' | 'pause';

export interface SafeTimeoutPolicy<A> {
  afterMs: number;
  strategy: SafeTimeoutStrategy;
  action: A;
}

export interface FlowPhaseDefinition<PhaseId extends string, ActionType extends string, TimeoutAction> {
  id: PhaseId;
  allowedActions: readonly ActionType[];
  timeout: SafeTimeoutPolicy<TimeoutAction> | null;
}

export interface FlowDefinition<Phase extends FlowPhaseDefinition<string, string, unknown>> {
  phases: readonly Phase[];
}

export interface ConfirmationBarrier {
  participantIds: readonly string[];
  confirmedParticipantIds: readonly string[];
}

export interface ConfirmationProgress {
  confirmed: number;
  expected: number;
  complete: boolean;
  pendingParticipantIds: string[];
}

function assertUniqueNonEmptyIds(ids: readonly string[], label: string): void {
  if (ids.some((id) => id.length === 0)) throw new Error(`${label}不能包含空 ID`);
  if (new Set(ids).size !== ids.length) throw new Error(`${label}不能包含重复 ID`);
}

export function defineFlow<const Phase extends FlowPhaseDefinition<string, string, unknown>>(
  phases: readonly Phase[],
): FlowDefinition<Phase> {
  if (phases.length === 0) throw new Error('流程至少需要一个阶段');
  assertUniqueNonEmptyIds(phases.map((phase) => phase.id), '阶段');
  for (const phase of phases) {
    assertUniqueNonEmptyIds(phase.allowedActions, '合法动作');
    if (phase.timeout && (!Number.isFinite(phase.timeout.afterMs) || phase.timeout.afterMs <= 0)) {
      throw new Error('超时时长必须是正数');
    }
  }
  return { phases: structuredClone(phases) };
}

export function getPhaseDefinition<Phase extends FlowPhaseDefinition<string, string, unknown>>(
  flow: FlowDefinition<Phase>,
  phaseId: string,
): Phase {
  const phase = flow.phases.find((candidate) => candidate.id === phaseId);
  if (!phase) throw new Error(`未知阶段：${phaseId}`);
  return phase;
}

export function isActionAllowed(
  phase: FlowPhaseDefinition<string, string, unknown>,
  actionType: string,
): boolean {
  return phase.allowedActions.includes(actionType);
}

export function resolveSafeTimeout<const Phase extends FlowPhaseDefinition<string, string, unknown>>(
  phase: Phase,
): Phase['timeout'] {
  return phase.timeout ? structuredClone(phase.timeout) : null;
}

export function createConfirmationBarrier(participantIds: readonly string[]): ConfirmationBarrier {
  assertUniqueNonEmptyIds(participantIds, '确认参与者');
  return { participantIds: [...participantIds], confirmedParticipantIds: [] };
}

export function confirmParticipant(
  barrier: ConfirmationBarrier,
  participantId: string,
): ConfirmationBarrier {
  if (!barrier.participantIds.includes(participantId)) throw new Error('参与者不在确认范围内');
  if (barrier.confirmedParticipantIds.includes(participantId)) return barrier;
  return {
    participantIds: [...barrier.participantIds],
    confirmedParticipantIds: [...barrier.confirmedParticipantIds, participantId],
  };
}

export function syncConfirmationParticipants(
  barrier: ConfirmationBarrier,
  participantIds: readonly string[],
): ConfirmationBarrier {
  assertUniqueNonEmptyIds(participantIds, '确认参与者');
  const active = new Set(participantIds);
  return {
    participantIds: [...participantIds],
    confirmedParticipantIds: barrier.confirmedParticipantIds.filter((id) => active.has(id)),
  };
}

export function getConfirmationProgress(barrier: ConfirmationBarrier): ConfirmationProgress {
  const confirmed = new Set(barrier.confirmedParticipantIds);
  const pendingParticipantIds = barrier.participantIds.filter((id) => !confirmed.has(id));
  return {
    confirmed: barrier.participantIds.length - pendingParticipantIds.length,
    expected: barrier.participantIds.length,
    complete: pendingParticipantIds.length === 0,
    pendingParticipantIds,
  };
}

export function createFlowTimerId(scope: string, phaseId: string, sequence: number): string {
  const segments = [scope, phaseId];
  if (segments.some((segment) => !/^[A-Za-z0-9_-]+$/.test(segment))) {
    throw new Error('计时器段只能包含字母、数字、下划线和连字符');
  }
  if (!Number.isSafeInteger(sequence) || sequence < 0) throw new Error('计时器序号必须是非负安全整数');
  return `flow:${scope}:${phaseId}:${sequence}`;
}
