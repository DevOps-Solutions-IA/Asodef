import { MasterCircuitOpenError } from "../domain/master.errors";

type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

export class MasterCircuitBreaker {
  private state: CircuitState = "CLOSED";
  private consecutiveFailures = 0;
  private openedAt = 0;
  private halfOpenProbeActive = false;

  constructor(
    private readonly failureThreshold: number,
    private readonly resetMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  beforeRequest(): void {
    if (this.state === "OPEN") {
      if (this.now() - this.openedAt < this.resetMs) throw new MasterCircuitOpenError();
      this.state = "HALF_OPEN";
    }
    if (this.state === "HALF_OPEN") {
      if (this.halfOpenProbeActive) throw new MasterCircuitOpenError();
      this.halfOpenProbeActive = true;
    }
  }

  recordSuccess(): void {
    this.state = "CLOSED";
    this.consecutiveFailures = 0;
    this.halfOpenProbeActive = false;
  }

  recordFailure(): void {
    this.halfOpenProbeActive = false;
    this.consecutiveFailures += 1;
    if (this.state === "HALF_OPEN" || this.consecutiveFailures >= this.failureThreshold) {
      this.state = "OPEN";
      this.openedAt = this.now();
    }
  }

  recordIgnored(): void {
    this.halfOpenProbeActive = false;
    if (this.state === "HALF_OPEN") {
      this.state = "CLOSED";
      this.consecutiveFailures = 0;
    }
  }

  snapshot(): { state: CircuitState; consecutiveFailures: number } {
    return { state: this.state, consecutiveFailures: this.consecutiveFailures };
  }
}
