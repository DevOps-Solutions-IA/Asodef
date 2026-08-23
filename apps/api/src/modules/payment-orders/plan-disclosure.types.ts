import { ASODEF_COMPANY } from "@asodef/config";
import type { PlanVersion } from "@prisma/client";

/**
 * US-054: the exact set of fields the AC names ("name, description,
 * total, currency, taxes, concept, frequency, terms, renewal/
 * cancellation conditions, contact channel, PQR channel"). contactChannel/
 * pqrChannel are not per-plan data - they're the same confirmed
 * ASODEF_COMPANY contact facts already used in the approved PQR legal
 * document content (US-044), not invented here.
 */
export interface PrePaymentDisclosureResponse {
  planVersionId: string;
  name: string;
  description: string;
  total: number;
  currency: string;
  taxes: string | null;
  concept: string;
  frequency: string;
  terms: string | null;
  renewalConditions: string | null;
  cancellationConditions: string | null;
  contactChannel: string;
  pqrChannel: string;
}

export function toPrePaymentDisclosureResponse(
  planVersion: PlanVersion,
  obligation: { concept: string; currency: string },
): PrePaymentDisclosureResponse {
  return {
    planVersionId: planVersion.id,
    name: planVersion.publicName,
    description: planVersion.description,
    total: planVersion.priceCents,
    currency: obligation.currency,
    taxes: planVersion.taxes,
    concept: obligation.concept,
    frequency: planVersion.billingPeriod,
    terms: planVersion.terms,
    renewalConditions: planVersion.renewalRules,
    cancellationConditions: planVersion.cancellationRules,
    contactChannel: ASODEF_COMPANY.corporateEmail,
    pqrChannel: ASODEF_COMPANY.commercialContact.whatsappUrl,
  };
}
