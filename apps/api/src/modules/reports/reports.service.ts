import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { BadRequestException, Injectable, NotFoundException, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { EnvConfig } from "../../config/env.validation";
import { PrismaService } from "../../database/prisma.service";
import { toCsv } from "./csv.util";
import { REPORT_DEFINITIONS } from "./report-definitions";
import type { ReportFiltersDto, ReportKey } from "./report-filters.dto";

/** US-064 AC2: rows above this threshold run as a background job instead
 * of a synchronous response - the AC's own literal number. */
const BACKGROUND_JOB_ROW_THRESHOLD = 1000;
const SYNC_PAGE_SIZE = 200;
const GENERIC_NOT_FOUND_MESSAGE = "No se encontraron resultados.";

/**
 * US-076: durable-queue tuning. A lease must comfortably outlast a real
 * export (paginated Prisma queries + one file write) - 5 minutes is
 * generous for this deployment's data volume without leaving a crashed
 * worker's job unclaimable for too long. Backoff is a simple doubling
 * sequence (30s, 60s, 120s), capped, not a full jitter/exponential
 * library - proportionate to 3 max attempts.
 */
const LEASE_DURATION_MS = 5 * 60 * 1000;
const BASE_BACKOFF_MS = 30 * 1000;
const MAX_BACKOFF_MS = 5 * 60 * 1000;

export interface ReportListItem {
  key: ReportKey;
  label: string;
}

export type SyncReportResult = { kind: "sync"; format: "json"; items: Array<Record<string, unknown>>; total: number } | { kind: "sync"; format: "csv"; csv: string };

export type ReportRunResult = SyncReportResult | { kind: "job"; jobId: string; rowCount: number };

/**
 * US-076: resolves the technical debt processExportJob's own prior
 * comment documented ("if the process restarts mid-export the job
 * simply stays PROCESSING forever - acceptable for this review-scale
 * deployment; a real production rollout would need a durable queue").
 *
 * Technical decision (evaluated, not defaulted to): a Postgres-native
 * durable queue, not BullMQ/Redis. This app's export volume is low
 * (admin-triggered CSV exports, not a high-throughput job system), the
 * durability guarantee needed is exactly what Postgres's own row-level
 * atomicity already provides (an UPDATE ... WHERE status = 'PENDING' is
 * inherently a safe multi-claimant primitive), and ExportJob already
 * lives in Postgres - adding Redis/BullMQ would be new infrastructure
 * for a problem a conditional UPDATE already solves. Mechanism:
 *  - claimJob(): atomic UPDATE, unclaimable by two workers at once
 *    (the DB row lock inherent to any UPDATE is the actual guarantee).
 *  - lease + leaseExpiresAt: a claimed-but-abandoned job (worker crash)
 *    becomes reclaimable once its lease expires - no external heartbeat
 *    process needed, the lease is just "claimed at + LEASE_DURATION_MS".
 *  - recoverStaleJobs(): swept opportunistically at the start of every
 *    new background export request, rather than on a timer - this app
 *    has no @nestjs/schedule/cron infrastructure today,
 *    and adding one purely to poll for stale jobs would be exactly the
 *    kind of unrequested new infrastructure this decision avoids. Any
 *    real usage of the reports feature (which is the only way stale
 *    jobs would even exist) naturally triggers a sweep.
 */
@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);
  private readonly workerId = randomUUID();

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService<EnvConfig, true>,
  ) {}

  listReports(): ReportListItem[] {
    return Object.values(REPORT_DEFINITIONS).map((def) => ({ key: def.key, label: def.label }));
  }

  private getDefinition(reportKey: string) {
    const definition = REPORT_DEFINITIONS[reportKey as ReportKey];
    if (!definition) {
      throw new BadRequestException(`El reporte "${reportKey}" no existe.`);
    }
    return definition;
  }

  /**
   * Negative case (AC): a zero-row match still returns a valid,
   * well-formed empty result (empty items array, or a header-only CSV) -
   * never an error. Rows over the threshold never get counted twice:
   * this reads the real count once, then either serves the whole (small)
   * result synchronously or hands off to processExportJob for the rest.
   */
  async run(reportKey: string, filters: ReportFiltersDto, actorUserId: string): Promise<ReportRunResult> {
    const definition = this.getDefinition(reportKey);
    const total = await definition.count(this.prisma, filters);

    if (total > BACKGROUND_JOB_ROW_THRESHOLD) {
      // Recovery is part of the request-side sweep and is awaited so the
      // durable state transition is complete when this trigger returns. Due
      // jobs and the newly-created export still run outside the request.
      await this.recoverStaleJobs();

      const job = await this.prisma.exportJob.create({
        data: { reportKey, filters: filters as object, rowCount: total, requestedByUserId: actorUserId },
      });
      this.dispatchInBackground(this.retryDueJobs(), "retrying due export jobs");
      this.dispatchInBackground(this.processExportJob(job.id), `processing export job ${job.id}`);
      return { kind: "job", jobId: job.id, rowCount: total };
    }

    if (filters.format === "csv") {
      const rows = await definition.fetch(this.prisma, filters, 0, total);
      return { kind: "sync", format: "csv", csv: toCsv(definition.columns, rows) };
    }

    const items = await definition.fetch(this.prisma, filters, 0, Math.min(total, SYNC_PAGE_SIZE));
    return { kind: "sync", format: "json", items, total };
  }

  /**
   * Atomic claim: only one caller (this process, or another instance
   * sharing the same DB) can ever transition a given job out of PENDING.
   * A second, concurrent attempt sees count === 0 and does nothing -
   * exactly the "never processed twice" guarantee this story requires,
   * with no external lock needed beyond the UPDATE itself.
   */
  private async claimJob(jobId: string): Promise<boolean> {
    const now = new Date();
    const result = await this.prisma.exportJob.updateMany({
      where: { id: jobId, status: "PENDING", OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }] },
      data: { status: "PROCESSING", leaseOwner: this.workerId, leaseExpiresAt: new Date(now.getTime() + LEASE_DURATION_MS) },
    });
    return result.count === 1;
  }

  /**
   * Finds PROCESSING jobs whose lease has expired (the owning worker
   * crashed or was killed mid-export) and either requeues them with a
   * backoff delay, or marks them permanently FAILED once maxAttempts is
   * exhausted. Each recovery is its own atomic, conditional UPDATE (not
   * a blind updateMany over the whole set) so two instances sweeping at
   * the same moment can never both "recover" - and therefore double-
   * increment - the same stale job.
   */
  private async recoverStaleJobs(): Promise<void> {
    const now = new Date();
    const staleJobs = await this.prisma.exportJob.findMany({
      where: { status: "PROCESSING", leaseExpiresAt: { lt: now } },
      select: { id: true, attemptCount: true, maxAttempts: true },
    });

    for (const job of staleJobs) {
      const nextAttemptCount = job.attemptCount + 1;
      const exhausted = nextAttemptCount >= job.maxAttempts;

      const result = await this.prisma.exportJob.updateMany({
        where: { id: job.id, status: "PROCESSING", leaseExpiresAt: { lt: now } },
        data: exhausted
          ? {
              status: "FAILED",
              attemptCount: nextAttemptCount,
              errorMessage: "El proceso se interrumpió y se agotaron los reintentos disponibles.",
              failedAt: now,
              leaseOwner: null,
              leaseExpiresAt: null,
              completedAt: now,
            }
          : {
              status: "PENDING",
              attemptCount: nextAttemptCount,
              nextAttemptAt: new Date(now.getTime() + backoffFor(nextAttemptCount)),
              leaseOwner: null,
              leaseExpiresAt: null,
            },
      });

      if (result.count === 1) {
        this.logger.warn(`Recovered stale export job ${job.id} (attempt ${nextAttemptCount}/${job.maxAttempts}, exhausted=${exhausted})`);
      }
    }
  }

  /**
   * Without a scheduler, a PENDING job whose backoff has elapsed (from
   * a genuine processing failure, or from recoverStaleJobs() requeuing
   * a crashed worker's job) has no timer that will ever re-attempt it -
   * this is what closes that loop: swept alongside recoverStaleJobs()
   * on every real use of the reports feature, it fires an attempt for
   * each due job. processExportJob's own atomic claim still governs
   * whether that attempt actually proceeds (e.g. two instances sweeping
   * at once never both process the same job).
   */
  private async retryDueJobs(): Promise<void> {
    const now = new Date();
    const dueJobs = await this.prisma.exportJob.findMany({
      where: { status: "PENDING", nextAttemptAt: { lte: now } },
      select: { id: true },
    });
    await Promise.all(dueJobs.map((job) => this.processExportJob(job.id)));
  }

  /** Runs off the request lifecycle (fire-and-forget from run()). The
   * request-side sweep owns recovery/retry dispatch. This method only
   * processes the requested job, preventing a worker from recursively
   * redispatching the entire due queue before it has claimed its own row. */
  private async processExportJob(jobId: string): Promise<void> {
    const claimed = await this.claimJob(jobId);
    if (!claimed) {
      return;
    }

    const job = await this.prisma.exportJob.findUnique({ where: { id: jobId } });
    if (!job) return;

    try {
      const definition = this.getDefinition(job.reportKey);
      const filters = job.filters as ReportFiltersDto;

      const allRows: Array<Record<string, unknown>> = [];
      let skip = 0;
      // Paginated fetch even for the background path - keeps a single
      // very large export from ever holding the entire result set in
      // one unbounded Prisma query.
      for (;;) {
        const page = await definition.fetch(this.prisma, filters, skip, SYNC_PAGE_SIZE);
        allRows.push(...page);
        if (page.length < SYNC_PAGE_SIZE) break;
        skip += SYNC_PAGE_SIZE;
      }

      const csv = toCsv(definition.columns, allRows);
      const storageDir = resolve(this.configService.get("REPORTS_STORAGE_DIR", { infer: true }));
      await mkdir(storageDir, { recursive: true });
      const fileName = `${job.reportKey}-${randomUUID()}.csv`;
      const filePath = join(storageDir, fileName);
      await writeFile(filePath, csv, "utf-8");

      await this.prisma.exportJob.update({
        where: { id: jobId },
        data: { status: "READY", filePath, rowCount: allRows.length, completedAt: new Date(), leaseOwner: null, leaseExpiresAt: null },
      });
    } catch (error) {
      await this.handleAttemptFailure(jobId, error instanceof Error ? error.message : "Error desconocido");
    }
  }

  private dispatchInBackground(operation: Promise<void>, context: string): void {
    void operation.catch((error: unknown) => {
      const detail = error instanceof Error ? error.stack ?? error.message : String(error);
      this.logger.error(`Background export queue failure while ${context}`, detail);
    });
  }

  /** A genuine processing failure (not a crashed worker - the process
   * is still alive to observe and record this) is retried the same way
   * a recovered stale job is: attemptCount+1, backoff, or FAILED once
   * maxAttempts is reached. */
  private async handleAttemptFailure(jobId: string, errorMessage: string): Promise<void> {
    const job = await this.prisma.exportJob.findUnique({ where: { id: jobId } });
    if (!job) return;

    const nextAttemptCount = job.attemptCount + 1;
    const now = new Date();

    if (nextAttemptCount >= job.maxAttempts) {
      await this.prisma.exportJob.update({
        where: { id: jobId },
        data: { status: "FAILED", attemptCount: nextAttemptCount, errorMessage, failedAt: now, completedAt: now, leaseOwner: null, leaseExpiresAt: null },
      });
      return;
    }

    await this.prisma.exportJob.update({
      where: { id: jobId },
      data: {
        status: "PENDING",
        attemptCount: nextAttemptCount,
        errorMessage,
        nextAttemptAt: new Date(now.getTime() + backoffFor(nextAttemptCount)),
        leaseOwner: null,
        leaseExpiresAt: null,
      },
    });
  }

  async getJobStatus(jobId: string) {
    const job = await this.prisma.exportJob.findUnique({ where: { id: jobId } });
    if (!job) {
      throw new NotFoundException(GENERIC_NOT_FOUND_MESSAGE);
    }
    return { id: job.id, reportKey: job.reportKey, status: job.status, rowCount: job.rowCount, errorMessage: job.errorMessage, createdAt: job.createdAt, completedAt: job.completedAt };
  }

  async getJobFilePath(jobId: string): Promise<{ filePath: string; reportKey: string }> {
    const job = await this.prisma.exportJob.findUnique({ where: { id: jobId } });
    if (!job || job.status !== "READY" || !job.filePath) {
      throw new NotFoundException(GENERIC_NOT_FOUND_MESSAGE);
    }
    return { filePath: job.filePath, reportKey: job.reportKey };
  }
}

function backoffFor(attemptCount: number): number {
  return Math.min(BASE_BACKOFF_MS * 2 ** (attemptCount - 1), MAX_BACKOFF_MS);
}
