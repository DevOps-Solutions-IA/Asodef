import { createHmac, timingSafeEqual } from "node:crypto";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { EnvConfig } from "../../config/env.validation";
import { BOLD_TRANSPORT, type BoldTransport } from "./bold-transport.interface";
import type {
  CreatePaymentInput,
  CreatePaymentResult,
  CreateRefundInput,
  CreateRefundResult,
  PaymentProvider,
  PaymentStatusResult,
  ValidateNotificationInput,
  ValidateNotificationResult,
} from "./payment-provider.interface";
import { isKnownBoldPaymentStatus } from "./bold-status";

function headerValue(
  headers: Record<string, string | string[] | undefined>,
  name: string,
): string | undefined {
  const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === name.toLowerCase());
  const value = entry?.[1];
  return Array.isArray(value) ? value[0] : value;
}

@Injectable()
export class BoldPaymentProvider implements PaymentProvider {
  private readonly logger = new Logger(BoldPaymentProvider.name);

  constructor(
    @Inject(BOLD_TRANSPORT) private readonly transport: BoldTransport,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {}

  async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    const intent = await this.transport.createPaymentIntent({
      reference_id: input.publicReference,
      amount: { currency: input.currency, total_amount: input.amountCents },
    });

    const payment = await this.transport.createPayment(input.publicReference);

    if (!isKnownBoldPaymentStatus(payment.status)) {
      this.logger.warn(
        `Unknown Bold payment status "${payment.status}" for reference_id ${input.publicReference}`,
        BoldPaymentProvider.name,
      );
    }

    return { status: payment.status, raw: { intent, payment } };
  }

  async getPaymentStatus(publicReference: string): Promise<PaymentStatusResult> {
    const payment = await this.transport.getPayment(publicReference);

    if (!isKnownBoldPaymentStatus(payment.status)) {
      this.logger.warn(`Unknown Bold payment status "${payment.status}" for reference_id ${publicReference}`, BoldPaymentProvider.name);
    }

    return { status: payment.status, raw: payment };
  }

  /**
   * Bold's current webhook contract signs Base64(raw HTTP body) with
   * HMAC-SHA256 and sends the lowercase hexadecimal MAC in x-bold-signature.
   * Validation is fail-closed when raw bytes/signature are unavailable. In
   * production an empty secret is never accepted; Bold's documented test
   * environment is the only mode where an empty webhook key is legitimate.
   */
  validateNotification(input: ValidateNotificationInput): Promise<ValidateNotificationResult> {
    const signature = headerValue(input.headers, "x-bold-signature")?.trim().toLowerCase();
    if (!input.rawBody || !signature || !/^[0-9a-f]{64}$/.test(signature)) {
      return Promise.resolve({ verified: false, raw: input.payload });
    }

    const mode = this.config.get("BOLD_MODE", { infer: true });
    const secret = this.config.get("BOLD_WEBHOOK_SECRET", { infer: true });
    if (mode === "production" && secret.length === 0) {
      this.logger.error("Bold webhook validation is disabled: BOLD_WEBHOOK_SECRET is not configured in production.");
      return Promise.resolve({ verified: false, raw: input.payload });
    }

    const encodedBody = input.rawBody.toString("base64");
    const expected = createHmac("sha256", secret).update(encodedBody).digest("hex");
    const expectedBytes = Buffer.from(expected, "utf8");
    const receivedBytes = Buffer.from(signature, "utf8");
    const verified = expectedBytes.length === receivedBytes.length
      && timingSafeEqual(expectedBytes, receivedBytes);

    if (!verified) {
      this.logger.warn("Rejected Bold webhook notification with invalid signature.");
    }
    return Promise.resolve({ verified, raw: input.payload });
  }

  async createRefund(input: CreateRefundInput): Promise<CreateRefundResult> {
    if (!this.transport.createRefund) {
      throw new Error("BoldPaymentProvider.createRefund is not implemented for this transport: no Bold refund endpoint is documented in approved project sources");
    }
    const result = await this.transport.createRefund(input.providerReferenceId, input.amountCents);

    if (!isKnownBoldPaymentStatus(result.status)) {
      this.logger.warn(`Unknown Bold refund status "${result.status}" for reference_id ${input.providerReferenceId}`, BoldPaymentProvider.name);
    }

    return { status: result.status, raw: result };
  }
}
