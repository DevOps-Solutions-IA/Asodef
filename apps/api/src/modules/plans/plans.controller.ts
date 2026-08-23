import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from "@nestjs/common";
import { ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import { Public } from "../auth/decorators/public.decorator";
import { RequirePermissions } from "../auth/decorators/permissions.decorator";
import { RequireStepUp } from "../auth/decorators/require-step-up.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import type { RequestUser } from "../auth/types/request-user.type";
import { PlansService } from "./plans.service";
import { CreatePlanDto } from "./dto/create-plan.dto";
import { CreatePlanVersionDto } from "./dto/create-plan-version.dto";
import { UpdatePlanVersionDto } from "./dto/update-plan-version.dto";
import { PlanLifecycleCommandDto } from "./dto/plan-lifecycle-command.dto";

@ApiTags("plans")
@Controller()
export class PlansController {
  constructor(private readonly plans: PlansService) {}

  @Public()
  @Get("plans")
  listPublic() {
    return this.plans.listPublished("PUBLIC");
  }

  @Public()
  @Get("plans/:code")
  async getPublic(@Param("code") code: string) {
    const plans = await this.plans.listPublished("PUBLIC", code);
    if (plans.length === 0)
      throw new NotFoundException("No se encontraron resultados.");
    return plans[0];
  }

  @ApiCookieAuth("asodef_at")
  @RequirePermissions("koral.plans.read")
  @Get("koral/plans")
  listKoral() {
    return this.plans.listPublished("KORAL");
  }

  @ApiCookieAuth("asodef_at")
  @RequirePermissions("plans.read")
  @Get("admin/plans")
  listAdmin() {
    return this.plans.listAdmin();
  }

  @ApiCookieAuth("asodef_at")
  @RequirePermissions("plans.read")
  @Get("admin/plans/:id")
  getAdmin(@Param("id", ParseUUIDPipe) id: string) {
    return this.plans.getAdmin(id);
  }

  @ApiCookieAuth("asodef_at")
  @RequirePermissions("plans.manage")
  @Post("admin/plans")
  create(
    @CurrentUser() actor: RequestUser,
    @Headers("idempotency-key") key: string | undefined,
    @Body() dto: CreatePlanDto,
  ) {
    return this.plans.create(actor.id, key, dto);
  }

  @ApiCookieAuth("asodef_at")
  @RequirePermissions("plans.manage")
  @Post("admin/plans/:id/versions")
  createVersion(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() actor: RequestUser,
    @Headers("idempotency-key") key: string | undefined,
    @Body() dto: CreatePlanVersionDto,
  ) {
    return this.plans.createVersion(id, actor.id, key, dto);
  }

  @ApiCookieAuth("asodef_at")
  @RequirePermissions("plans.manage")
  @Patch("admin/plan-versions/:id")
  updateDraft(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() actor: RequestUser,
    @Headers("idempotency-key") key: string | undefined,
    @Body() dto: UpdatePlanVersionDto,
  ) {
    return this.plans.updateDraft(id, actor.id, key, dto);
  }

  @ApiCookieAuth("asodef_at")
  @RequirePermissions("plans.manage")
  @Post("admin/plan-versions/:id/submit-review")
  @HttpCode(HttpStatus.OK)
  submitReview(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() actor: RequestUser,
    @Headers("idempotency-key") key: string | undefined,
    @Body() dto: PlanLifecycleCommandDto,
  ) {
    return this.plans.submitReview(
      id,
      actor.id,
      key,
      dto.expectedRevision,
      dto.reason,
    );
  }

  @ApiCookieAuth("asodef_at")
  @RequirePermissions("plans.publish")
  @RequireStepUp()
  @Post("admin/plan-versions/:id/publish")
  @HttpCode(HttpStatus.OK)
  publish(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() actor: RequestUser,
    @Headers("idempotency-key") key: string | undefined,
    @Body() dto: PlanLifecycleCommandDto,
  ) {
    return this.plans.publish(
      id,
      actor.id,
      key,
      dto.expectedRevision,
      dto.reason,
    );
  }

  @ApiCookieAuth("asodef_at")
  @RequirePermissions("plans.publish")
  @RequireStepUp()
  @Post("admin/plan-versions/:id/retire")
  @HttpCode(HttpStatus.OK)
  retire(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() actor: RequestUser,
    @Headers("idempotency-key") key: string | undefined,
    @Body() dto: PlanLifecycleCommandDto,
  ) {
    return this.plans.retire(
      id,
      actor.id,
      key,
      dto.expectedRevision,
      dto.reason,
    );
  }
}
