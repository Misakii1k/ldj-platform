import { normalizeChatText, type CanonicalChatText } from './text.js';

const authenticatedChatActorBrand: unique symbol = Symbol('authenticated-chat-actor');
const platformChatIssuerBrand: unique symbol = Symbol('platform-chat-issuer');
const issuedActors = new WeakSet<object>();
const issuedPlatformIssuers = new WeakSet<object>();

export interface AuthenticatedChatActor {
  readonly roomId: string;
  readonly playerId: string;
  readonly connectionId: string;
  readonly [authenticatedChatActorBrand]: true;
}

export interface ChatActorBinding {
  readonly roomId: string;
  readonly playerId: string;
  readonly connectionId: string;
}

export type PlatformChatSource = 'platform' | 'game_module';

export interface PlatformChatIssuer {
  readonly source: PlatformChatSource;
  readonly [platformChatIssuerBrand]: true;
}

export interface UserChatMessage {
  readonly id: number;
  readonly fromPlayerId: string;
  readonly kind: 'user';
  readonly text: CanonicalChatText;
  readonly createdAt: number;
}

export interface SystemChatMessage {
  readonly id: number;
  readonly fromPlayerId: null;
  readonly kind: 'system';
  readonly text: CanonicalChatText;
  readonly createdAt: number;
}

export type ChatMessage = UserChatMessage | SystemChatMessage;

/**
 * Captures the room and connection authenticated by the gateway at issue time.
 * This capability is not proof that the connection is still authoritative:
 * before every send, integration must also call the room's
 * `ConnectionRegistry.hasAuthority(actor.playerId, actor.connectionId)`.
 */
export function createAuthenticatedChatActor(binding: ChatActorBinding): AuthenticatedChatActor {
  assertIdentifier(binding.roomId, 'roomId');
  assertIdentifier(binding.playerId, 'playerId');
  assertIdentifier(binding.connectionId, 'connectionId');
  const actor: AuthenticatedChatActor = Object.freeze({
    roomId: binding.roomId,
    playerId: binding.playerId,
    connectionId: binding.connectionId,
    [authenticatedChatActorBrand]: true as const,
  });
  issuedActors.add(actor);
  return actor;
}

/**
 * Checks the immutable authentication context before the caller performs the
 * separate live ConnectionRegistry authority check required for every send.
 */
export function isChatActorBoundTo(
  actor: AuthenticatedChatActor,
  binding: ChatActorBinding,
): boolean {
  return (
    issuedActors.has(actor) &&
    actor.roomId === binding.roomId &&
    actor.playerId === binding.playerId &&
    actor.connectionId === binding.connectionId
  );
}

/** Grants the platform kernel or a loaded game module authority to emit system chat. */
export function createPlatformChatIssuer(source: PlatformChatSource): PlatformChatIssuer {
  if (source !== 'platform' && source !== 'game_module') {
    throw new TypeError('platform chat issuer source must be platform or game_module');
  }
  const issuer: PlatformChatIssuer = Object.freeze({
    source,
    [platformChatIssuerBrand]: true as const,
  });
  issuedPlatformIssuers.add(issuer);
  return issuer;
}

/**
 * Builds a message after integration has rechecked this actor's live
 * ConnectionRegistry authority for the bound room and connection.
 */
export function createUserChatMessage(input: {
  readonly id: number;
  readonly actor: AuthenticatedChatActor;
  readonly text: unknown;
  readonly createdAt: number;
}): UserChatMessage {
  if (!issuedActors.has(input.actor)) {
    throw new TypeError('user chat requires an authenticated chat actor');
  }
  assertMessageMetadata(input.id, input.createdAt);

  return Object.freeze({
    id: input.id,
    fromPlayerId: input.actor.playerId,
    kind: 'user',
    text: normalizeChatText(input.text),
    createdAt: input.createdAt,
  });
}

export function createSystemChatMessage(input: {
  readonly id: number;
  readonly issuer: PlatformChatIssuer;
  readonly text: unknown;
  readonly createdAt: number;
}): SystemChatMessage {
  if (!issuedPlatformIssuers.has(input.issuer)) {
    throw new TypeError('system chat requires a runtime-issued platform chat issuer');
  }
  assertMessageMetadata(input.id, input.createdAt);

  return Object.freeze({
    id: input.id,
    fromPlayerId: null,
    kind: 'system',
    text: normalizeChatText(input.text),
    createdAt: input.createdAt,
  });
}

function assertMessageMetadata(id: number, createdAt: number): void {
  assertPositiveSafeInteger(id, 'id');
  assertNonNegativeSafeInteger(createdAt, 'createdAt');
}

function assertIdentifier(value: string, name: string): void {
  if (typeof value !== 'string' || value.length === 0 || value !== value.trim()) {
    throw new TypeError(`${name} must be a non-empty trimmed string`);
  }
}

function assertNonNegativeSafeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative safe integer`);
  }
}

function assertPositiveSafeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new RangeError(`${name} must be a positive safe integer`);
  }
}
