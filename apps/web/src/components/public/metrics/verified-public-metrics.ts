import { ASODEF_COMPANY } from "@asodef/config";

export type VerifiedIndicatorId = "corporate-years" | "registration-year" | "registered-domicile" | "legal-form";

interface VerifiedIndicatorSource {
  kind: "verified-corporate-config";
  path: string;
  field: string;
  derivation: string;
}

interface VerifiedIndicatorBase {
  id: VerifiedIndicatorId;
  label: string;
  context: string;
  source: VerifiedIndicatorSource;
}

export interface VerifiedPublicMetric extends VerifiedIndicatorBase {
  kind: "numeric";
  value: number;
}

export interface VerifiedPublicTextIndicator extends VerifiedIndicatorBase {
  kind: "text";
  value: string;
}

export type VerifiedPublicIndicator = VerifiedPublicMetric | VerifiedPublicTextIndicator;

/** Returns completed anniversaries, not an inclusive calendar-year count. */
export function completedYearsSince(isoDate: string, asOf: Date) {
  const [yearPart, monthPart, dayPart] = isoDate.split("-");
  const year = Number(yearPart);
  const month = Number(monthPart);
  const day = Number(dayPart);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    throw new Error("La fecha corporativa configurada no tiene formato ISO válido.");
  }
  const currentYear = asOf.getUTCFullYear();
  const currentMonth = asOf.getUTCMonth() + 1;
  const currentDay = asOf.getUTCDate();
  const anniversaryPassed = currentMonth > month || (currentMonth === month && currentDay >= day);
  return currentYear - year - (anniversaryPassed ? 0 : 1);
}

const completedCorporateYears = completedYearsSince(ASODEF_COMPANY.registrationDate, new Date());

/**
 * A deliberately small identity set. Customer, transaction, satisfaction,
 * coverage and catalog totals do not belong here without a dated public
 * source and the context needed to interpret them.
 */
export const VERIFIED_PUBLIC_INDICATORS = [
  {
    id: "corporate-years",
    kind: "numeric",
    value: completedCorporateYears,
    label: "de trayectoria institucional",
    context: "Años completos desde la fecha registral.",
    source: {
      kind: "verified-corporate-config",
      path: "packages/config/src/company.ts",
      field: "ASODEF_COMPANY.registrationDate",
      derivation: "Años completos transcurridos desde la fecha registral 2012-09-10 hasta la fecha de consulta.",
    },
  },
  {
    id: "registration-year",
    kind: "text",
    value: ASODEF_COMPANY.registrationDate.slice(0, 4),
    label: "inicio de operaciones",
    context: "Evolución documentada a ASODEF S.A.S.",
    source: {
      kind: "verified-corporate-config",
      path: "packages/config/src/company.ts",
      field: "ASODEF_COMPANY.registrationDate",
      derivation: "Año de la fecha registral 2012-09-10.",
    },
  },
  {
    id: "registered-domicile",
    kind: "text",
    value: `${ASODEF_COMPANY.city}, ${ASODEF_COMPANY.country}`,
    label: "sede corporativa",
    context: "Domicilio registrado.",
    source: {
      kind: "verified-corporate-config",
      path: "packages/config/src/company.ts",
      field: "ASODEF_COMPANY.city + ASODEF_COMPANY.country",
      derivation: "Ciudad y país confirmados en los datos corporativos vigentes.",
    },
  },
  {
    id: "legal-form",
    kind: "text",
    value: "S.A.S.",
    label: "estructura jurídica registrada",
    context: ASODEF_COMPANY.legalForm,
    source: {
      kind: "verified-corporate-config",
      path: "packages/config/src/company.ts",
      field: "ASODEF_COMPANY.legalForm",
      derivation: "Forma jurídica confirmada por el certificado de existencia y representación legal.",
    },
  },
] as const satisfies readonly VerifiedPublicIndicator[];

export function getVerifiedPublicIndicator(id: VerifiedIndicatorId) {
  return VERIFIED_PUBLIC_INDICATORS.find((indicator) => indicator.id === id);
}
