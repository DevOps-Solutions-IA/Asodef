export interface BingoTransactionObservation {
  readonly command: string;
  readonly isolationLevel: string;
  readonly attempt: number;
  readonly durationMs: number;
  readonly outcome: "COMMITTED" | "ROLLED_BACK" | "RETRYING";
  readonly sqlState?: string;
}

export interface BingoTransactionObserver {
  observe(observation: BingoTransactionObservation): void;
}

export class NoopBingoTransactionObserver implements BingoTransactionObserver {
  observe(_observation: BingoTransactionObservation): void {}
}
