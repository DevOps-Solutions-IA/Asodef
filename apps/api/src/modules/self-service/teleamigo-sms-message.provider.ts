import { Injectable } from "@nestjs/common";
import type { ProviderResult, SelfServiceMessageProvider } from "./external-core.provider";

function unavailable(code: string, message: string, retryable: boolean): ProviderResult<{ delivered: true }> {
  return { status: "UNAVAILABLE", error: { code, message, retryable } };
}

/**
 * Teleamigo / IA Tech SMS transport boundary.
 *
 * The account portal confirms scoped API keys (including sms:message:send),
 * but the exact HTTP endpoint, authorization header and request/response
 * contract have not yet been verified from Teleamigo/IA Tech documentation
 * or a provider-approved example. Keep production fail-closed until that
 * contract is evidenced; do not infer another vendor's API shape.
 */
@Injectable()
export class TeleamigoSmsMessageProvider implements SelfServiceMessageProvider {
  deliverOtp(): Promise<ProviderResult<{ delivered: true }>> {
    return Promise.resolve(
      unavailable(
        "TELEAMIGO_API_CONTRACT_UNVERIFIED",
        "La integración SMS está pendiente de validar el contrato HTTP oficial de Teleamigo/IA Tech.",
        false,
      ),
    );
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
