import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
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

export interface ReportListItem {
  key: ReportKey;
  label: string;
}

export type SyncReportResult = { kind: "sync"; format: "json"; items: Array<Record<string, unknown>>; total: number } | { kind: "sync"; format: "csv"; csv: string };

export type ReportRunResult = SyncReportResult | { kind: "job"; jobId: string; rowCount: number };

@Injectable()
export class ReportsService {
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
      const job = await this.prisma.exportJob.create({
        data: { reportKey, filters: filters as object, rowCount: total, requestedByUserId: actorUserId },
      });
      void this.processExportJob(job.id);
      return { kind: "job", jobId: job.id, rowCount: total };
    }

    if (filters.format === "csv") {
      const rows = await definition.fetch(this.prisma, filters, 0, total);
      return { kind: "sync", format: "csv", csv: toCsv(definition.columns, rows) };
    }

    const items = await definition.fetch(this.prisma, filters, 0, Math.min(total, SYNC_PAGE_SIZE));
    return { kind: "sync", format: "json", items, total };
  }

  /** Runs off the request lifecycle (fire-and-forget from run()) - a
   * plain in-process async task, not a durable queue (see ExportJob's
   * own schema comment for why no job-queue library was added). If the
   * process restarts mid-export the job simply stays PROCESSING forever
   * - acceptable for this review-scale deployment; a real production
   * rollout would need a durable queue, out of this story's scope. */
  private async processExportJob(jobId: string): Promise<void> {
    const job = await this.prisma.exportJob.findUnique({ where: { id: jobId } });
    if (!job) return;

    try {
      await this.prisma.exportJob.update({ where: { id: jobId }, data: { status: "PROCESSING" } });
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
        data: { status: "READY", filePath, rowCount: allRows.length, completedAt: new Date() },
      });
    } catch (error) {
      await this.prisma.exportJob.update({
        where: { id: jobId },
        data: { status: "FAILED", errorMessage: error instanceof Error ? error.message : "Error desconocido", completedAt: new Date() },
      });
    }
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
