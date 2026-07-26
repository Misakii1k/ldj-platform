const verifiedMemberIdentityBrand: unique symbol = Symbol('verified-member-identity');
const issuedVerifiedIdentities = new WeakSet<object>();

export interface VerifiedMemberIdentity {
  readonly memberId: string;
  readonly [verifiedMemberIdentityBrand]: true;
}

/**
 * Brands the member identity returned by successful resume-token verification.
 * Callers must never invoke this with a member ID taken directly from a request.
 */
export function createVerifiedMemberIdentity(memberId: string): VerifiedMemberIdentity {
  if (memberId.length === 0) throw new TypeError('verified member ID must not be empty');

  const identity = Object.freeze({
    memberId,
    [verifiedMemberIdentityBrand]: true as const,
  });
  issuedVerifiedIdentities.add(identity);
  return identity;
}

export interface BindConnectionInput {
  readonly identity: VerifiedMemberIdentity;
  readonly connectionId: string;
}

export interface BindConnectionResult {
  readonly replacedConnectionId: string | null;
}

/**
 * Keeps the single authoritative transport connection for each room member.
 * Credential verification remains at the gateway boundary; this registry only
 * accepts its result and never handles secret token material.
 */
export class ConnectionRegistry {
  readonly #connectionByMember = new Map<string, string>();
  readonly #memberByConnection = new Map<string, string>();

  bind(input: BindConnectionInput): BindConnectionResult {
    if (!issuedVerifiedIdentities.has(input.identity)) {
      throw new TypeError('connection binding requires a verified member identity');
    }

    const { memberId } = input.identity;

    const previousMember = this.#memberByConnection.get(input.connectionId);
    if (
      previousMember !== undefined &&
      this.#connectionByMember.get(previousMember) === input.connectionId
    ) {
      this.#connectionByMember.delete(previousMember);
    }

    const replacedConnectionId = this.#connectionByMember.get(memberId) ?? null;
    if (replacedConnectionId !== null && replacedConnectionId !== input.connectionId) {
      this.#memberByConnection.delete(replacedConnectionId);
    }

    this.#connectionByMember.set(memberId, input.connectionId);
    this.#memberByConnection.set(input.connectionId, memberId);

    return {
      replacedConnectionId:
        replacedConnectionId === input.connectionId ? null : replacedConnectionId,
    };
  }

  hasAuthority(memberId: string, connectionId: string): boolean {
    return (
      this.#connectionByMember.get(memberId) === connectionId &&
      this.#memberByConnection.get(connectionId) === memberId
    );
  }

  activeConnectionFor(memberId: string): string | null {
    return this.#connectionByMember.get(memberId) ?? null;
  }

  activeMemberFor(connectionId: string): string | null {
    return this.#memberByConnection.get(connectionId) ?? null;
  }

  release(connectionId: string): boolean {
    const memberId = this.#memberByConnection.get(connectionId);
    if (memberId === undefined || this.#connectionByMember.get(memberId) !== connectionId) {
      return false;
    }

    this.#memberByConnection.delete(connectionId);
    this.#connectionByMember.delete(memberId);
    return true;
  }
}
