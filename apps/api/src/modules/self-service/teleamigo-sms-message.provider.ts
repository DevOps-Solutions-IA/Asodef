import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { EnvConfig } from "../../config/env.validation";
import type { ProviderResult, SelfServiceMessageProvider } from "./external-core.provider";
import { normalizeColombianMobile } from "./sms-destination";

type SmsApiResponse = {
  bulkId?: string;
  messages?: readonly {
    messageId?: string;
    destination?: string;
    status?: {
      groupId?: number;
      groupName?: string;
      id?: number;
      name?: string;
      description?: string;
    };
  }[];
};

function unavailable(
  code: string,
  message: string,
  retryable: boolean,
): ProviderResult<{ delivered: true }> {
  return { status: "UNAVAILABLE", error: { code, message, retryable } };
}

function accepted(body: SmsApiResponse | null, recipient: string): boolean {
  return (
    body?.messages?.some((message) => {
      const destination = message.destination;
      const group = message.status?.groupName?.toUpperCase();
      const name = message.status?.name?.toUpperCase();
      return (
        destination === recipient &&
        Boolean(message.messageId) &&
        (group === "PENDING" ||
          group === "ACCEPTED" ||
          name === "PENDING_ACCEPTED" ||
          name === "MESSAGE_ACCEPTED")
      );
    }) ?? false
  );
}

/**
 * Teleamigo / IA Tech SMS transport.
 *
 * The production account's scoped key was verified from ASODEF's authorized
 * outbound IP against the SMS v3 endpoint: API-key authentication is
 * "Authorization: App <key>". ASODEF owns OTP generation/validation; this
 * provider only transports the already-generated code by SMS.
 */
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

    const endpoint = this.config.get("TELEAMIGO_SMS_API_ENDPOINT", { infer: true });
    const apiKey = this.config.get("TELEAMIGO_SMS_API_KEY", { infer: true });
    const sender = this.config.get("TELEAMIGO_SMS_FROM", { infer: true });
    const timeoutMs = this.config.get("TELEAMIGO_SMS_TIMEOUT_MS", { infer: true });
    const message =
      `ASODEF: tu codigo de verificacion es ${input.code}. Vigente por ${input.expiresInMinutes} min. No lo compartas.`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `App ${apiKey}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          messages: [
            {
              sender,
              destinations: [{ to: recipient }],
              content: { text: message },
            },
          ],
        }),
        signal: controller.signal,
      });

      let body: SmsApiResponse | null = null;
      try {
        body = (await response.json()) as SmsApiResponse;
      } catch {
        body = null;
      }

      if (response.status === 200 && accepted(body, recipient)) {
        return { status: "VERIFIED", data: { delivered: true } };
      }

      return unavailable(
        "TELEAMIGO_SMS_REJECTED",
        "No fue posible entregar el código por SMS.",
        response.status === 429 || response.status >= 500,
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
