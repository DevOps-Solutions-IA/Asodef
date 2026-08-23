import { BadRequestException } from "@nestjs/common";
import type { InboundMessage } from "./contracts/channel.contract";
import { KORAL_CHANNEL_CONTRACT_VERSION } from "./contracts/channel.contract";

const MAX_EXTERNAL_ID_LENGTH = 256;
const MAX_BODY_LENGTH = 50_000;
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;

function normalizedRequired(value: string, field: string, maxLength = MAX_EXTERNAL_ID_LENGTH): string {
  const normalized = value.trim();
  const hasControlCharacter = Array.from(normalized).some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 31 || codePoint === 127;
  });
  if (!normalized || normalized.length > maxLength || hasControlCharacter) {
    throw new BadRequestException(`El campo ${field} no tiene un formato válido.`);
  }
  return normalized;
}

/** Canonical adapter boundary. It validates metadata only; it never logs content. */
export function normalizeInboundMessage(input: InboundMessage): InboundMessage {
  if (input.version !== KORAL_CHANNEL_CONTRACT_VERSION) {
    throw new BadRequestException("La versión del contrato de canal no es compatible.");
  }
  if (!(input.occurredAt instanceof Date) || !Number.isFinite(input.occurredAt.getTime())) {
    throw new BadRequestException("La fecha del mensaje no es válida.");
  }
  if (input.body !== undefined && input.body.length > MAX_BODY_LENGTH) {
    throw new BadRequestException("El contenido del mensaje excede el límite permitido.");
  }
  const attachments = input.attachments.map((attachment) => {
    if (attachment.byteSize !== undefined && (!Number.isSafeInteger(attachment.byteSize) || attachment.byteSize < 0)) {
      throw new BadRequestException("El tamaño del adjunto no es válido.");
    }
    if (attachment.checksumSha256 !== undefined && !SHA256_PATTERN.test(attachment.checksumSha256)) {
      throw new BadRequestException("El checksum del adjunto no es válido.");
    }
    return {
      ...attachment,
      mediaType: normalizedRequired(attachment.mediaType, "attachments.mediaType", 128).toLowerCase(),
      fileName: attachment.fileName?.trim() || undefined,
    };
  });

  return {
    ...input,
    adapterVersion: normalizedRequired(input.adapterVersion, "adapterVersion", 64),
    externalSessionId: normalizedRequired(input.externalSessionId, "externalSessionId"),
    externalMessageId: normalizedRequired(input.externalMessageId, "externalMessageId"),
    contentType: normalizedRequired(input.contentType, "contentType", 128).toLowerCase(),
    identity: {
      ...input.identity,
      channel: input.channel,
      externalIdentityId: normalizedRequired(input.identity.externalIdentityId, "identity.externalIdentityId"),
      displayName: input.identity.displayName?.trim() || undefined,
    },
    attachments,
  };
}
