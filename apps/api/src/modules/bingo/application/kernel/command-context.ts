export const BINGO_APPLICATION_PERMISSIONS = {
  OPERATE: "bingo.operate",
  MANAGE: "bingo.manage",
  VALIDATE: "bingo.validate",
} as const;

export type BingoApplicationPermission =
  (typeof BINGO_APPLICATION_PERMISSIONS)[keyof typeof BINGO_APPLICATION_PERMISSIONS];

export interface ActorContext {
  readonly userId: string;
  readonly permissions: ReadonlySet<string>;
}

export interface BingoClock {
  now(): Date;
}

export class SystemBingoClock implements BingoClock {
  now(): Date {
    return new Date();
  }
}

export interface CommandContext {
  readonly actor: ActorContext;
  readonly requestId: string;
  readonly idempotencyKey: string;
  readonly idempotencyKeyHash: string;
  readonly requestHash: string;
  readonly clock: BingoClock;
}
