import { ConflictException, Injectable, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { EnvConfig } from "../../config/env.validation";
import type { MasterPaymentOrderRow } from "../payment-orders/master-payment-orders.service";

const BOLD_LINK_BASE_URL = "https://integrations.api.bold.co";
const BOLD_CHECKOUT_ORIGIN = "https://checkout.bold.co";

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as JsonRecord : null;
}

@Injectable()
export class MasterBoldLinkService {
  constructor(private readonly config: ConfigService<EnvConfig, true>) {}

  async create(order: MasterPaymentOrderRow): Promise<{ linkId: string; checkoutUrl: string; raw: unknown }> {
    this.assertEnabled();
    const identityKey = this.config.get("BOLD_IDENTITY_KEY", { infer: true });
    const callbackBase = this.config.get("PUBLIC_APP_URL", { infer: true });
    const callback = new URL("/pagos/resultado", callbackBase);
    callback.searchParams.set("reference", order.public_reference);
    if (this.config.get("NODE_ENV", { infer: true }) === "production" && callback.protocol !== "https:") {
      throw new ServiceUnavailableException("La pasarela de pagos no está configurada correctamente.");
    }
    const amount = Number(order.amount_cents) / 100;
    if (!Number.isSafeInteger(amount) || amount <= 0) {
      throw new ConflictException("El valor de la obligación no es válido para la pasarela.");
    }
    const raw = await this.request("POST", "/online/link/v1", {
      amount_type: "CLOSE",
      amount: { currency: "COP", total_amount: amount, tip_amount: 0 },
      reference: order.public_reference.slice(0, 60),
      description: order.concept.slice(0, 100),
      expiration_date: order.expires_at.getTime() * 1_000_000,
      callback_url: callback.toString(),
    }, identityKey);
    const payload = record(record(raw)?.payload);
    const linkId = typeof payload?.payment_link === "string" ? payload.payment_link : "";
    const checkoutUrl = typeof payload?.url === "string" ? payload.url : "";
    let parsedCheckout: URL;
    try { parsedCheckout = new URL(checkoutUrl); } catch { throw new ServiceUnavailableException("La pasarela devolvió una respuesta inválida."); }
    if (!/^LNK_[A-Za-z0-9_-]+$/.test(linkId) || parsedCheckout.origin !== BOLD_CHECKOUT_ORIGIN) {
      throw new ServiceUnavailableException("La pasarela devolvió una respuesta inválida.");
    }
    return { linkId, checkoutUrl, raw };
  }

  async status(linkId: string): Promise<{ status: string; transactionId: string | null; total: number | null; raw: unknown }> {
    this.assertEnabled();
    if (!/^LNK_[A-Za-z0-9_-]+$/.test(linkId)) throw new ServiceUnavailableException("Referencia de pasarela inválida.");
    const raw = await this.request("GET", `/online/link/v1/${encodeURIComponent(linkId)}`, undefined, this.config.get("BOLD_IDENTITY_KEY", { infer: true }));
    const root = record(raw);
    const payload = record(root?.payload) ?? root;
    const status = typeof payload?.status === "string" ? payload.status.toUpperCase() : "";
    const transactionId = typeof payload?.transaction_id === "string" ? payload.transaction_id : null;
    const total = typeof payload?.total === "number" && Number.isFinite(payload.total) ? payload.total : null;
    if (!status) throw new ServiceUnavailableException("No fue posible confirmar el estado del pago.");
    return { status, transactionId, total, raw };
  }

  private assertEnabled(): void {
    const mode = this.config.get("BOLD_MODE", { infer: true });
    const productionEnabled = this.config.get("PRODUCTION_PAYMENTS_ENABLED", { infer: true });
    if (mode === "mock" || (mode === "production" && !productionEnabled)) {
      throw new ServiceUnavailableException("Los pagos reales aún no están habilitados.");
    }
    if (!this.config.get("BOLD_IDENTITY_KEY", { infer: true })) {
      throw new ServiceUnavailableException("La pasarela de pagos no está configurada.");
    }
  }

  private async request(method: "GET" | "POST", path: string, body: unknown, identityKey: string): Promise<unknown> {
    let response: Response;
    try {
      response = await fetch(`${BOLD_LINK_BASE_URL}${path}`, {
        method,
        headers: { Authorization: `x-api-key ${identityKey}`, "Content-Type": "application/json", Accept: "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new ServiceUnavailableException("La pasarela de pagos no está disponible.");
    }
    let parsed: unknown = null;
    try { parsed = await response.json(); } catch { parsed = null; }
    if (!response.ok) throw new ServiceUnavailableException("La pasarela de pagos rechazó temporalmente la operación.");
    return parsed;
  }
}
