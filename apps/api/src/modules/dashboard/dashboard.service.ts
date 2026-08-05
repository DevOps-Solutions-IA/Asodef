import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../database/prisma.service";
import type { AdminDashboardResponse } from "./dashboard.types";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function startOfMonth(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  /** US-064 AC1: every figure below is a live query result, computed
   * fresh on each call - nothing here is cached or sampled. */
  async getDashboard(): Promise<AdminDashboardResponse> {
    const thirtyDaysAgo = new Date(Date.now() - THIRTY_DAYS_MS);
    const today = startOfToday();
    const monthStart = startOfMonth();
    const in30Days = new Date(Date.now() + THIRTY_DAYS_MS);

    const [
      newProspects30d,
      opportunitiesByStageRaw,
      opportunitiesWon,
      opportunitiesLost,
      totalOpportunities,
      activeCompanies,
      activeAgreements,
      contractsPendingSignature,
      contractsNearingExpiration,
      commercialActivities30d,
      leadsWithoutFollowUp,
      recaudoDiario,
      recaudoMensual,
      pagosAprobados,
      pagosPendientes,
      pagosRechazados,
      pagosFallidos,
      obligacionesPendientes,
      obligacionesVencidas,
      reconciliationDifferencesOpen,
    ] = await Promise.all([
      this.prisma.prospect.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
      this.prisma.opportunity.groupBy({ by: ["stage"], _count: { _all: true } }),
      this.prisma.opportunity.count({ where: { stage: "ACTIVE_PARTNER" } }),
      this.prisma.opportunity.count({ where: { stage: "LOST_OPPORTUNITY" } }),
      this.prisma.opportunity.count(),
      this.prisma.company.count({ where: { status: "ACTIVE" } }),
      this.prisma.agreement.count({ where: { signedDate: { not: null } } }),
      this.prisma.contract.count({ where: { status: "PENDING_ACCEPTANCE" } }),
      this.prisma.contract.count({ where: { status: "ACTIVE", expirationDate: { gte: new Date(), lte: in30Days } } }),
      this.prisma.commercialActivity.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
      // "Leads without follow-up": never promoted into a Prospect - no
      // separate follow-up/activity tracking exists on LeadSubmission
      // itself, so promotion (the one real, modeled action a lead can
      // receive) is the literal signal used here.
      this.prisma.leadSubmission.count({ where: { prospectId: null } }),
      this.prisma.paymentOrder.aggregate({ _sum: { amountCents: true }, where: { status: "APPROVED", createdAt: { gte: today } } }),
      this.prisma.paymentOrder.aggregate({ _sum: { amountCents: true }, where: { status: "APPROVED", createdAt: { gte: monthStart } } }),
      this.prisma.paymentOrder.count({ where: { status: "APPROVED" } }),
      this.prisma.paymentOrder.count({ where: { status: "PENDING" } }),
      this.prisma.paymentOrder.count({ where: { status: "REJECTED" } }),
      this.prisma.paymentOrder.count({ where: { status: "FAILED" } }),
      this.prisma.obligation.count({ where: { status: "PENDING" } }),
      this.prisma.obligation.count({ where: { status: "OVERDUE" } }),
      this.prisma.reconciliationDifference.count({ where: { resolutionStatus: "OPEN" } }),
    ]);

    const opportunitiesByStage: Record<string, number> = {};
    for (const row of opportunitiesByStageRaw) {
      opportunitiesByStage[row.stage] = row._count._all;
    }

    const resolvedPagos = pagosAprobados + pagosRechazados + pagosFallidos;

    return {
      newProspects30d,
      opportunitiesByStage,
      conversionRate: totalOpportunities > 0 ? opportunitiesWon / totalOpportunities : 0,
      activeCompanies,
      activeAgreements,
      contractsPendingSignature,
      contractsNearingExpiration,
      commercialActivities30d,
      leadsWithoutFollowUp,
      opportunitiesWon,
      opportunitiesLost,
      recaudoDiarioCents: recaudoDiario._sum.amountCents ?? 0,
      recaudoMensualCents: recaudoMensual._sum.amountCents ?? 0,
      pagosAprobados,
      pagosPendientes,
      pagosRechazados,
      tasaAprobacion: resolvedPagos > 0 ? pagosAprobados / resolvedPagos : 0,
      obligacionesPendientes,
      obligacionesVencidas,
      reconciliationDifferencesOpen,
    };
  }
}
