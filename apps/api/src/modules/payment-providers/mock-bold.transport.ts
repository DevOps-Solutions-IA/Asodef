import { Injectable } from "@nestjs/common";
import type { BoldApiResponse, BoldCreatePaymentIntentRequest, BoldTransport } from "./bold-transport.interface";

interface MockBoldState {
  intent: BoldApiResponse;
  payment?: BoldApiResponse;
}

/**
 * Never makes a network call - the entire point of BOLD_MODE=mock
 * (US-022's own acceptance criteria). Keeps per-reference state
 * in-memory (same "inspectable test double" pattern as
 * InMemoryMailTransport) so createPaymentIntent -> createPayment ->
 * getPayment behaves like a real stateful provider across a test's own
 * sequence of calls, and so a test can override the next outcome via
 * setNextPaymentStatus() to exercise a REJECTED/FAILED path without
 * needing a real Bold sandbox.
 */
@Injectable()
export class MockBoldTransport implements BoldTransport {
  private readonly stateByReference = new Map<string, MockBoldState>();
  private nextPaymentStatus = "APPROVED";

  // Declared `async` (not just Promise-returning) deliberately: every
  // error path below must surface as a rejected promise, never a
  // synchronous throw, so callers can uniformly `await`/`.catch()`
  // regardless of which branch runs.
  async createPaymentIntent(request: BoldCreatePaymentIntentRequest): Promise<BoldApiResponse> {
    const intent: BoldApiResponse = {
      status: "ACTIVE",
      reference_id: request.reference_id,
      amount: request.amount,
    };
    this.stateByReference.set(request.reference_id, { intent });
    return intent;
  }

  async createPayment(referenceId: string): Promise<BoldApiResponse> {
    const state = this.stateByReference.get(referenceId);
    if (!state) {
      throw new Error(`MockBoldTransport: no payment-intent was created for reference_id "${referenceId}"`);
    }
    const payment: BoldApiResponse = { status: this.nextPaymentStatus, reference_id: referenceId };
    state.payment = payment;
    return payment;
  }

  async getPayment(referenceId: string): Promise<BoldApiResponse> {
    const state = this.stateByReference.get(referenceId);
    if (!state?.payment) {
      throw new Error(`MockBoldTransport: no payment was created yet for reference_id "${referenceId}"`);
    }
    return state.payment;
  }

  /** Test-only helper: the next createPayment() call returns this
   * status instead of the default "APPROVED" - lets a test exercise
   * BoldPaymentProvider's REJECTED/FAILED/etc. handling without a real
   * Bold sandbox. */
  setNextPaymentStatus(status: string): void {
    this.nextPaymentStatus = status;
  }

  reset(): void {
    this.stateByReference.clear();
    this.nextPaymentStatus = "APPROVED";
  }
}
