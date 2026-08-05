import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import { RequirePermissions } from "../auth/decorators/permissions.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import type { RequestUser } from "../auth/types/request-user.type";
import { RefundsService } from "./refunds.service";
import { RequestRefundDto } from "./dto/request-refund.dto";

@ApiTags("refunds")
@ApiCookieAuth("asodef_at")
@Controller()
export class RefundsController {
  constructor(private readonly refundsService: RefundsService) {}

  @RequirePermissions("payments.refund")
  @Post("payments/:reference/refund")
  @HttpCode(HttpStatus.CREATED)
  requestRefund(@Param("reference") reference: string, @Body() dto: RequestRefundDto, @CurrentUser() actor: RequestUser) {
    return this.refundsService.requestRefund(reference, dto, actor.id);
  }

  @RequirePermissions("payments.refund")
  @Post("admin/refunds/:id/evidence")
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor("file"))
  uploadEvidence(@Param("id", ParseUUIDPipe) id: string, @UploadedFile() file: Express.Multer.File, @CurrentUser() actor: RequestUser) {
    return this.refundsService.uploadEvidence(id, file, actor.id);
  }

  // AC: the approval action requires a separate permission from the
  // request action - payments.refund.approve, distinct from
  // payments.refund.
  @RequirePermissions("payments.refund.approve")
  @Post("admin/refunds/:id/approve")
  @HttpCode(HttpStatus.OK)
  approveRefund(@Param("id", ParseUUIDPipe) id: string, @CurrentUser() actor: RequestUser) {
    return this.refundsService.approveRefund(id, actor.id);
  }

  @RequirePermissions("payments.read")
  @Get("admin/refunds")
  listRefunds() {
    return this.refundsService.listRefunds();
  }

  @RequirePermissions("payments.read")
  @Get("admin/refunds/:id")
  getRefund(@Param("id", ParseUUIDPipe) id: string) {
    return this.refundsService.getRefund(id);
  }
}
