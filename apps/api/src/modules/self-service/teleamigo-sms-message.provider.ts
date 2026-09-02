import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { EnvConfig } from "../../config/env.validation";
import type { ProviderResult, SelfServiceMessageProvider } from "./external-core.provider";

type SmsApiResponse = {
  result?: readonly {
    accepted?: boolean;
    to?: string;
    id?: string;
    error?: { code?: number; description?: string };
  }[];
};

function unavailable(code: string, message: string, retryable: boolean): ProviderResult<{ delivered: true }> {
  return { status: "UNAVAILABLE", error: { code, message, retryable } };
}

export function normalizeColombianMobile(value: string): string | null {
  const digits = value.replace(/\D/g, "");
  if (/^3\d{9}$/.test(digits)) return `57${digits}`;
  if (/^573\d{9}$/.test(digits)) return digits;
  return null;
}

@Injectable()
export class TeleamigoSmsMessageProvider implements SelfServiceMessageProvider {
  constructor(private readonly config: ConfigService<EnvConfig, true>) {}

  async deliverOtp(input: {
    channel: "email" | "sms" | "whatsapp";
    destination: string;
    code: string;
    expiresInMinutes: number;
  }): Promise<ProviderResult<{ delivered: true }>> {
    if (input.channel !== "sms") {
      return unavailable(
        "TELEAMIGO_SMS_CHANNEL_REQUIRED",
        "El proveedor configurado para OTP admite únicamente SMS.",
        false,
      );
    }

    const recipient = normalizeColombianMobile(input.destination);
    if (!recipient) {
      return unavailable(
        "TELEAMIGO_INVALID_MOBILE",
        "El número registrado no es un celular colombiano válido para SMS.",
        false,
      );
    }

    const baseUrl = this.config.get("TELEAMIGO_SMS_BASE_URL", { infer: true }).replace(/\/$/, "");
    const username = this.config.get("TELEAMIGO_SMS_USERNAME", { infer: true });
    const apiPassword = this.config.get("TELEAMIGO_SMS_API_PASSWORD", { infer: true });
    const sender = this.config.get("TELEAMIGO_SMS_FROM", { infer: true });
    const timeoutMs = this.config.get("TELEAMIGO_SMS_TIMEOUT_MS", { infer: true });
    const authorization = Buffer.from(`${username}:${apiPassword}`, "utf8").toString("base64");
    const message = `ASODEF: tu codigo de verificacion es ${input.code}. Vigente por ${input.expiresInMinutes} min. No lo compartas.`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${baseUrl}/api/rest/sms`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Basic ${authorization}`,
        },
        body: JSON.stringify({
          to: [recipient],
          from: sender,
          message,
          encoding: "gsm",
          parts: 1,
          trans: 1,
        }),
        signal: controller.signal,
      });

      let body: SmsApiResponse | null = null;
      try {
        body = await response.json() as SmsApiResponse;
      } catch {
        body = null;
      }

      const accepted = body?.result?.some((item) => item.accepted === true && item.to === recipient) ?? false;
      if ((response.status === 202 || response.status === 207) && accepted) {
        return { status: "VERIFIED", data: { delivered: true } };
      }

      const retryable = response.status === 429 || response.status >= 500;
      return unavailable(
        "TELEAMIGO_SMS_REJECTED",
        "No fue posible entregar el código por SMS.",
        retryable,
      );
    } catch {
      return unavailable(
        "TELEAMIGO_SMS_UNAVAILABLE",
        "El servicio de mensajes de texto no está disponible.",
        true,
      );
    } finally {
      clearTimeout(timer);
    }
  }

  notifyContactUpdated(): Promise<ProviderResult<{ delivered: true }>> {
    return Promise.resolve(
      unavailable(
        "TELEAMIGO_CONTACT_NOTIFICATION_NOT_ENABLED",
        "Las notificaciones de cambio de contacto aún no están habilitadas.",
        false,
      ),
    );
  }
}
