export interface AdminDashboardMetrics {
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
