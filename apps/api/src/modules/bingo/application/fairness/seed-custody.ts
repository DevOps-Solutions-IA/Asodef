import {
  BingoFairnessApplicationError,
  BingoFairnessApplicationErrorCode,
} from "./fairness-application-error";

export interface ProtectedSeedReference {
  /** Authenticated encrypted envelope. It must never contain plaintext seed bytes. */
  readonly ciphertext: string;
  /** Dedicated, versioned custody key identifier. */
  readonly custodyKeyId: string;
}

export interface SeedCustodyContext {
  readonly eventId: string;
  readonly roundId: string;
  readonly executionId: string;
  readonly revision: number;
  readonly protocolVersion: string;
}

/**
 * Security boundary for short-lived commit-reveal secrets.
 *
 * A production adapter must generate seeds with the operating-system CSPRNG,
 * encrypt them with a dedicated versioned key, authenticate `context`, and
 * zero temporary plaintext buffers. Implementations must not log callback
 * inputs or outputs.
 */
export interface SeedCustody {
  generateAndProtect<TResult>(
    context: SeedCustodyContext,
    consume: (seed: Uint8Array) => TResult,
  ): Promise<{
    readonly protectedSeed: ProtectedSeedReference;
    readonly result: TResult;
  }>;

  withProtectedSeed<TResult>(
    protectedSeed: ProtectedSeedReference,
    context: SeedCustodyContext,
    consume: (seed: Uint8Array) => TResult,
  ): Promise<TResult>;
}

/** Default production-safe adapter until an approved custody backend exists. */
export class UnavailableSeedCustody implements SeedCustody {
  generateAndProtect<TResult>(
    _context: SeedCustodyContext,
    _consume: (seed: Uint8Array) => TResult,
  ): Promise<{
    readonly protectedSeed: ProtectedSeedReference;
    readonly result: TResult;
  }> {
    return Promise.reject(this.unavailable());
  }

  withProtectedSeed<TResult>(
    _protectedSeed: ProtectedSeedReference,
    _context: SeedCustodyContext,
    _consume: (seed: Uint8Array) => TResult,
  ): Promise<TResult> {
    return Promise.reject(this.unavailable());
  }

  private unavailable(): BingoFairnessApplicationError {
    return new BingoFairnessApplicationError(
      BingoFairnessApplicationErrorCode.COMMIT_REVEAL_OPERATIONAL_BLOCKED_BY_SEED_CUSTODY,
    );
  }
}
