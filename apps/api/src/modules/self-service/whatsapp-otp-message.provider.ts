import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { EnvConfig } from "../../config/env.validation";
import type {
  ProviderResult,
  SelfServiceMessageProvider,
} from "./external-core.provider";
import { normalizeColombianMobile } from "./colombian-mobile";

type MetaMessageResponse = {
  messages?: readonly {
    id?: string;
    message_status?: string;
  }[];
};

function unavailable(
  code: string,
  message: string,
  retryable: boolean,
): ProviderResult<{ delivered: true }> {
  return { status: "UNAVAILABLE", error: { code, message, retryable } };
}

/**
 * WhatsApp OTP transport over Meta WhatsApp Cloud API.
 *
 * ASODEF remains the OTP authority: code generation, expiry, attempts,
 * browser binding and verification stay inside SelfServiceAccessService.
 * This adapter only delivers an already-generated code through an approved
 * AUTHENTICATION template.
 */
@Injectable()
export class WhatsAppOtpMessageProvider implements SelfServiceMessageProvider {
  constructor(private readonly config: ConfigService<EnvConfig, true>) {}

  async deliverOtp(input: {
    channel: "email" | "sms" | "whatsapp";
    destination: string;
    code: string;
    expiresInMinutes: number;
  }): Promise<ProviderResult<{ delivered: true }>> {
    if (input.channel !== "whatsapp") {
      return unavailable(
        "WHATSAPP_CHANNEL_REQUIRED",
        "El proveedor de verificación configurado admite únicamente WhatsApp.",
        false,
      );
    }

    const recipient = normalizeColombianMobile(input.destination);
    if (!recipient) {
      return unavailable(
        "WHATSAPP_INVALID_MOBILE",
        "El número registrado no es un celular colombiano válido para WhatsApp.",
        false,
      );
    }

    const version = this.config.get("WHATSAPP_GRAPH_API_VERSION", { infer: true });
    const phoneNumberId = this.config.get("WHATSAPP_PHONE_NUMBER_ID", { infer: true });
    const accessToken = this.config.get("WHATSAPP_ACCESS_TOKEN", { infer: true });
    const templateName = this.config.get("WHATSAPP_OTP_TEMPLATE_NAME", { infer: true });
    const language = this.config.get("WHATSAPP_OTP_TEMPLATE_LANGUAGE", { infer: true });
    const timeoutMs = this.config.get("WHATSAPP_TIMEOUT_MS", { infer: true });
    const endpoint =
      `https://graph.facebook.com/${version}/${phoneNumberId}/messages`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: recipient,
          type: "template",
          template: {
            name: templateName,
            language: { code: language },
            components: [
              {
                type: "body",
                parameters: [{ type: "text", text: input.code }],
              },
              {
                type: "button",
                sub_type: "url",
                index: "0",
                parameters: [{ type: "text", text: input.code }],
              },
            ],
          },
        }),
        signal: controller.signal,
      });

      let body: MetaMessageResponse | null = null;
      try {
        body = (await response.json()) as MetaMessageResponse;
      } catch {
        body = null;
      }

      const accepted =
        response.status === 200 &&
        Boolean(body?.messages?.some((message) => Boolean(message.id)));

      if (accepted) {
        return { status: "VERIFIED", data: { delivered: true } };
      }

      return unavailable(
        "WHATSAPP_OTP_REJECTED",
        "No fue posible entregar el código por WhatsApp.",
        response.status === 429 || response.status >= 500,
      );
    } catch {
      return unavailable(
        "WHATSAPP_OTP_UNAVAILABLE",
        "El servicio de WhatsApp no está disponible.",
        true,
      );
    } finally {
      clearTimeout(timer);
    }
  }

  notifyContactUpdated(): Promise<ProviderResult<{ delivered: true }>> {
    return Promise.resolve(
      unavailable(
        "WHATSAPP_CONTACT_NOTIFICATION_NOT_ENABLED",
        "Las notificaciones de cambio de contacto aún no están habilitadas.",
        false,
      ),
    );
  }
}
