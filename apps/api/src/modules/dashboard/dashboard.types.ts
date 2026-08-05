/**
 * US-064 AC1: every figure here is computed from a live DB query, never
 * a constant. Field names mirror the AC's own literal Spanish phrases
 * (recaudo diario/mensual, tasa de aprobación, etc.) so there's no
 * translation-layer ambiguity between what the AC asks for and what
 * this response actually contains.
 */
export interface AdminDashboardResponse {
  newProspects30d: number;
  opportunitiesByStage: Record<string, number>;
  conversionRate: number;
  activeCompanies: number;
  activeAgreements: number;
  contractsPendingSignature: number;
  contractsNearingExpiration: number;
  commercialActivities30d: number;
  leadsWithoutFollowUp: number;
  opportunitiesWon: number;
  opportunitiesLost: number;
  recaudoDiarioCents: number;
  recaudoMensualCents: number;
  pagosAprobados: number;
  pagosPendientes: number;
  pagosRechazados: number;
  tasaAprobacion: number;
  obligacionesPendientes: number;
  obligacionesVencidas: number;
  reconciliationDifferencesOpen: number;
}
