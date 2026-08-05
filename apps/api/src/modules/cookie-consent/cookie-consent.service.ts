import { Injectable } from "@nestjs/common";
import { ConsentStatus } from "@prisma/client";
import { PrismaService } from "../../database/prisma.service";
import type { RequestContext } from "../auth/auth.service";
import { LegalDocumentsService } from "../legal-documents/legal-documents.service";
import { ConsentService } from "../consent/consent.service";
import type { RecordCookieConsentDto } from "./dto/record-cookie-consent.dto";

const COOKIE_POLICY_SLUG = "politica-de-cookies";
const COOKIE_PURPOSE_KEY = "cookie_preferences";

type OptionalCookieCategory = "preferences" | "analytics" | "marketing";

/**
 * US-047: the cookie banner has one ConsentPurpose ("cookie_preferences",
 * AC's own wording: "via ConsentRecord for the cookie_preferences
 * purpose") but 3 independently-trackable optional categories - one
 * ConsentRecord per category, distinguished by `metadata.category`
 * rather than 3 separate purpose keys, since the AC names a single
 * purpose for all of them. The visitor has no authenticated identity at
 * this point (the banner appears before any form is submitted), so
 * every record uses the anonymous subject.
 */
@Injectable()
export class CookieConsentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly legalDocumentsService: LegalDocumentsService,
    private readonly consentService: ConsentService,
  ) {}

  async record(dto: RecordCookieConsentDto, context: RequestContext): Promise<void> {
    const categories: Record<OptionalCookieCategory, boolean> = {
      preferences: dto.preferences,
      analytics: dto.analytics,
      marketing: dto.marketing,
    };

    await this.prisma.$transaction(async (tx) => {
      const policyVersionId = await this.legalDocumentsService.resolveCurrentPublishedVersionId(COOKIE_POLICY_SLUG, tx);

      for (const [category, granted] of Object.entries(categories) as [OptionalCookieCategory, boolean][]) {
        await this.consentService.record(
          tx,
          COOKIE_PURPOSE_KEY,
          { anonymous: true },
          policyVersionId,
          {
            ipAddress: context.ipAddress ?? null,
            userAgent: context.userAgent ?? null,
            source: "cookie_banner",
            acceptanceMethod: dto.method,
            metadata: { category },
          },
          granted ? ConsentStatus.GRANTED : ConsentStatus.DENIED,
        );
      }
    });
  }
}
