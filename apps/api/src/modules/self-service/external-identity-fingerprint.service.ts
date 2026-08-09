import { createHmac } from "node:crypto";
import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { EnvConfig } from "../../config/env.validation";

export interface VersionedIdentityFingerprint {
  keyId: string;
  subjectRefHash: string;
  active: boolean;
}

@Injectable()
export class ExternalIdentityFingerprintService {
  constructor(private readonly config: ConfigService<EnvConfig, true>) {}

  fingerprints(subjectRef: string): VersionedIdentityFingerprint[] {
    const activeKeyId = this.config.get("EXTERNAL_IDENTITY_HMAC_KEY_ID", { infer: true });
    const activeSecret = this.config.get("EXTERNAL_IDENTITY_HMAC_KEY", { infer: true });
    if (!activeKeyId || !activeSecret || activeSecret.length < 32) {
      throw new ServiceUnavailableException(
        "La huella de identidad externa no está configurada.",
      );
    }

    const previous = this.config.get("EXTERNAL_IDENTITY_HMAC_PREVIOUS_KEYS", { infer: true });
    const keys = [[activeKeyId, activeSecret] as const, ...Object.entries(previous ?? {})];
    return keys.map(([keyId, secret], index) => ({
      keyId,
      subjectRefHash: createHmac("sha256", secret).update(subjectRef).digest("hex"),
      active: index === 0,
    }));
  }
}
