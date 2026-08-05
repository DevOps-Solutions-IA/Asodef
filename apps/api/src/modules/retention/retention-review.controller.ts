import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseEnumPipe, ParseUUIDPipe, Post } from "@nestjs/common";
import { ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import { RetentionRecordCategory } from "@prisma/client";
import { RequirePermissions } from "../auth/decorators/permissions.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import type { RequestUser } from "../auth/types/request-user.type";
import { RetentionReviewService } from "./retention-review.service";
import { ExecuteRetentionActionDto } from "./dto/execute-retention-action.dto";

@ApiTags("retention")
@Controller("admin/retention")
export class RetentionReviewController {
  constructor(private readonly retentionReviewService: RetentionReviewService) {}

  /** Read-only - "runnable on-demand for verification" (AC). Never
   * deletes or anonymizes anything. */
  @ApiCookieAuth("asodef_at")
  @RequirePermissions("retention.manage")
  @Get("review")
  review() {
    return this.retentionReviewService.review();
  }

  @ApiCookieAuth("asodef_at")
  @RequirePermissions("retention.manage")
  @Post(":category/:recordId/execute")
  @HttpCode(HttpStatus.OK)
  execute(
    @Param("category", new ParseEnumPipe(RetentionRecordCategory)) category: RetentionRecordCategory,
    @Param("recordId", ParseUUIDPipe) recordId: string,
    @Body() dto: ExecuteRetentionActionDto,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.retentionReviewService.approveAndExecute(category, recordId, actor.id, dto.reason);
  }
}
