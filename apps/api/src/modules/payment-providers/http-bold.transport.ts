import { Injectable, Logger } from "@nestjs/common";
import type { BoldApiResponse, BoldCreatePaymentIntentRequest, BoldTransport } from "./bold-transport.interface";

export interface HttpBoldTransportConfig {
  baseUrl: string;
  identityKey: string;
}

/**
 * The real Bold HTTP client (sandbox/production only - BOLD_MODE=mock
 * never constructs this, see bold-transport.provider.ts). Endpoints,
 * request field names, and the auth header format are copied verbatim
 * from the PRD's own rules/AC text - nothing here is guessed. Never
 * exercised against a real Bold server in this session (no sandbox
 * credentials exist yet) - see the module's tests, which only assert
 * this class builds the *correct request* against a mocked fetch, per
 * "do not make real financial transactions."
 */
@Injectable()
export class HttpBoldTransport implements BoldTransport {
  private readonly logger = new Logger(HttpBoldTransport.name);

  constructor(private readonly config: HttpBoldTransportConfig) {}

  createPaymentIntent(request: BoldCreatePaymentIntentRequest): Promise<BoldApiResponse> {
    return this.request("POST", "/v1/payment-intent", request);
  }

  createPayment(referenceId: string): Promise<BoldApiResponse> {
    return this.request("POST", "/v1/payment", { reference_id: referenceId });
  }

  getPayment(referenceId: string): Promise<BoldApiResponse> {
    return this.request("GET", `/v1/payment/${encodeURIComponent(referenceId)}`);
  }

  private async request(method: "GET" | "POST", path: string, body?: unknown): Promise<BoldApiResponse> {
    let response: Response;
    try {
      response = await fetch(`${this.config.baseUrl}${path}`, {
        method,
        headers: {
          "Content-Type": "application/json",
          // Bold's documented auth header, verbatim: "Authorization:
          // x-api-key <llave_de_identidad>". Never logged - the value
          // only ever exists in this one header, never interpolated
          // into a log message or thrown error below.
          Authorization: `x-api-key ${this.config.identityKey}`,
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch (cause) {
      this.logger.error(`Bold provider unreachable (${method} ${path})`, undefined, HttpBoldTransport.name);
      throw new BoldProviderUnavailableError(cause);
    }

    const text = await response.text();
    let parsed: unknown;
    try {
      parsed = text ? JSON.parse(text) : {};
    } catch {
      parsed = { raw: text };
    }

    if (!response.ok) {
      this.logger.error(`Bold provider returned ${response.status} for ${method} ${path}`, undefined, HttpBoldTransport.name);
      throw new BoldProviderResponseError(response.status, parsed);
    }

    if (typeof parsed !== "object" || parsed === null || typeof (parsed as { status?: unknown }).status !== "string") {
      throw new BoldProviderResponseError(response.status, parsed, "Bold response missing the documented `status` field");
    }

    return parsed as BoldApiResponse;
  }
}

/** Network-level failure - Bold couldn't be reached at all. */
export class BoldProviderUnavailableError extends Error {
  constructor(public override readonly cause: unknown) {
    super("Bold payment provider is unavailable");
    this.name = "BoldProviderUnavailableError";
  }
}

/** Bold responded, but with a non-2xx status or an unrecognized shape.
 * `body` is the parsed response - never rendered directly in a public
 * API response (see PaymentProvidersModule's future consumers), only
 * used for internal diagnostics. */
export class BoldProviderResponseError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
    message = "Bold payment provider returned an error response",
  ) {
    super(message);
    this.name = "BoldProviderResponseError";
  }
}
