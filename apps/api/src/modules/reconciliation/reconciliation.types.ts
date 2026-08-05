import type { Reconciliation, ReconciliationDifference } from "@prisma/client";

export interface AdminReconciliationResponse {
  id: string;
  runDate: Date;
  rangeStart: Date;
  rangeEnd: Date;
  responsibleUserId: string;
  differencesFound: number;
  resolutionStatus: string;
  notes: string | null;
  createdAt: Date;
}

export function toAdminReconciliationResponse(run: Reconciliation): AdminReconciliationResponse {
  return {
    id: run.id,
    runDate: run.runDate,
    rangeStart: run.rangeStart,
    rangeEnd: run.rangeEnd,
    responsibleUserId: run.responsibleUserId,
    differencesFound: run.differencesFound,
    resolutionStatus: run.resolutionStatus,
    notes: run.notes,
    createdAt: run.createdAt,
  };
}

export interface AdminReconciliationDifferenceResponse {
  id: string;
  reconciliationId: string;
  paymentOrderId: string | null;
  kind: string;
  details: unknown;
  resolutionStatus: string;
  resolutionNotes: string | null;
  resolvedByUserId: string | null;
  resolvedAt: Date | null;
  createdAt: Date;
}

export function toAdminReconciliationDifferenceResponse(difference: ReconciliationDifference): AdminReconciliationDifferenceResponse {
  return {
    id: difference.id,
    reconciliationId: difference.reconciliationId,
    paymentOrderId: difference.paymentOrderId,
    kind: difference.kind,
    details: difference.details,
    resolutionStatus: difference.resolutionStatus,
    resolutionNotes: difference.resolutionNotes,
    resolvedByUserId: difference.resolvedByUserId,
    resolvedAt: difference.resolvedAt,
    createdAt: difference.createdAt,
  };
}
