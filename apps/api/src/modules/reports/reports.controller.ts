import { Controller, Get, Header, Param, ParseUUIDPipe, Query, Res, StreamableFile } from "@nestjs/common";
import type { Response } from "express";
import { createReadStream } from "node:fs";
import { ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import { RequirePermissions } from "../auth/decorators/permissions.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import type { RequestUser } from "../auth/types/request-user.type";
import { ReportsService } from "./reports.service";
import { ReportFiltersDto } from "./report-filters.dto";

@ApiTags("reports")
@ApiCookieAuth("asodef_at")
@RequirePermissions("reports.read")
@Controller("admin/reports")
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get()
  list() {
    return this.reportsService.listReports();
  }

  // Registered before ":key" so "exports" is never swallowed as a
  // report key value - same convention as every other prefix-before-
  // param route in this codebase.
  @Get("exports/:jobId")
  getJobStatus(@Param("jobId", ParseUUIDPipe) jobId: string) {
    return this.reportsService.getJobStatus(jobId);
  }

  @Get("exports/:jobId/download")
  @Header("Content-Type", "text/csv")
  async download(@Param("jobId", ParseUUIDPipe) jobId: string, @Res({ passthrough: true }) res: Response) {
    const { filePath, reportKey } = await this.reportsService.getJobFilePath(jobId);
    res.setHeader("Content-Disposition", `attachment; filename="${reportKey}.csv"`);
    return new StreamableFile(createReadStream(filePath));
  }

  @Get(":key")
  async run(@Param("key") key: string, @Query() filters: ReportFiltersDto, @CurrentUser() actor: RequestUser, @Res({ passthrough: true }) res: Response) {
    const result = await this.reportsService.run(key, filters, actor.id);

    if (result.kind === "job") {
      res.status(202);
      return { jobId: result.jobId, rowCount: result.rowCount, status: "PENDING" };
    }

    if (result.format === "csv") {
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="${key}.csv"`);
      return result.csv;
    }

    return { items: result.items, total: result.total };
  }
}
