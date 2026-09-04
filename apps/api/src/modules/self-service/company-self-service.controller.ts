import { BadRequestException, Body, Controller, Delete, Get, HttpCode, HttpStatus, Post, Req, Res, UseGuards } from "@nestjs/common";
import { SelfServicePortal } from "@prisma/client";
import { ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { Public } from "../auth/decorators/public.decorator";
import { buildRequestContext } from "../../common/http/request-context.util";
import { AccessRequestCodeDto, AccessResendDto, AccessVerifyDto, CompanyAccessStartDto } from "./self-service.dto";
import { SelfServiceAccessService } from "./self-service-access.service";
import { SelfServiceCookieService, SelfServiceSessionService } from "./self-service-session.service";
import { RequireSelfServicePortal, SelfServiceCsrfGuard, SelfServiceSessionGuard, type SelfServiceRequest } from "./self-service.guards";
import { SELF_SERVICE_PUBLIC_FIELDS, SelfServiceGatewayService } from "./self-service-gateway.service";
import type { ProviderResult } from "./external-core.provider";

@Public()
@ApiTags("self-service-company")
@Controller("self-service/company")
@RequireSelfServicePortal(SelfServicePortal.COMPANY)
export class CompanySelfServiceController {
  constructor(private readonly access: SelfServiceAccessService, private readonly sessions: SelfServiceSessionService, private readonly cookies: SelfServiceCookieService, private readonly gateway: SelfServiceGatewayService) {}

  @Post("access/start") @HttpCode(HttpStatus.OK)
  async start(@Body() dto: CompanyAccessStartDto, @Req() request: SelfServiceRequest, @Res({ passthrough: true }) response: Response) {
    const result = await this.access.startCompany(dto.nit, buildRequestContext(request));
    if (result.status !== "VERIFIED") return result;
    this.cookies.set(response, SelfServicePortal.COMPANY, result.rawToken, result.expiresAt);
    return { status: result.status, sessionId: result.sessionId, csrfToken: result.csrfToken, expiresAt: result.expiresAt, scopes: result.scopes, assurance: result.assurance, portal: result.portal };
  }
  @Post("access/request-code") @HttpCode(HttpStatus.OK)
  requestCode(@Body() dto: AccessRequestCodeDto, @Req() request: SelfServiceRequest) {
    return this.access.requestCode(SelfServicePortal.COMPANY, dto.providerReference, dto.channelReference, buildRequestContext(request));
  }
  @Post("access/resend") @HttpCode(HttpStatus.OK)
  resend(@Body() dto: AccessResendDto, @Req() request: SelfServiceRequest) {
    return this.access.resend(SelfServicePortal.COMPANY, dto.challengeId, buildRequestContext(request));
  }
  @Post("access/verify") @HttpCode(HttpStatus.OK)
  async verify(@Body() dto: AccessVerifyDto, @Req() request: SelfServiceRequest, @Res({ passthrough: true }) response: Response) {
    const result = await this.access.verify(SelfServicePortal.COMPANY, dto.challengeId, dto.code, buildRequestContext(request));
    if (result.status !== "VERIFIED") return result;
    this.cookies.set(response, SelfServicePortal.COMPANY, result.rawToken, result.expiresAt);
    return { status: result.status, sessionId: result.sessionId, csrfToken: result.csrfToken, expiresAt: result.expiresAt, scopes: result.scopes, assurance: result.assurance, portal: result.portal };
  }
  @Get("session") @UseGuards(SelfServiceSessionGuard)
  async session(@Req() request: SelfServiceRequest) {
    const p = this.principal(request);
    const csrfToken = await this.sessions.rotateCsrf(p);
    if (!csrfToken) throw new BadRequestException("No fue posible renovar la protección de la sesión.");
    return { status: "VERIFIED", portal: p.portal, scopes: p.scopes, assurance: p.assurance, expiresAt: p.expiresAt, csrfToken };
  }
  @Delete("session") @UseGuards(SelfServiceSessionGuard, SelfServiceCsrfGuard) @HttpCode(HttpStatus.OK)
  async logout(@Req() request: SelfServiceRequest, @Res({ passthrough: true }) response: Response) { await this.sessions.revoke(this.principal(request).sessionId); this.cookies.clear(response, SelfServicePortal.COMPANY); return { status: "VERIFIED" }; }

  @Get("summary") @UseGuards(SelfServiceSessionGuard) summary(@Req() request: SelfServiceRequest) { return this.readPayload(request, "company:summary:read", (ref) => this.gateway.core.getCompanySummary(ref), SELF_SERVICE_PUBLIC_FIELDS.companySummary); }
  @Get("benefits") @UseGuards(SelfServiceSessionGuard) benefits(@Req() request: SelfServiceRequest) { return this.readCollection(request, "company:benefits:read", (ref) => this.gateway.core.getCompanyBenefits(ref), SELF_SERVICE_PUBLIC_FIELDS.benefits); }
  @Get("contracts") @UseGuards(SelfServiceSessionGuard) contracts(@Req() request: SelfServiceRequest) { return this.readCollection(request, "company:contracts:read", (ref) => this.gateway.core.getCompanyContracts(ref), SELF_SERVICE_PUBLIC_FIELDS.contracts); }
  @Get("payments") @UseGuards(SelfServiceSessionGuard) payments(@Req() request: SelfServiceRequest) { return this.readCollection(request, "company:payments:read", (ref) => this.gateway.core.getCompanyPayments(ref), SELF_SERVICE_PUBLIC_FIELDS.payments); }
  @Get("documents") @UseGuards(SelfServiceSessionGuard) documents(@Req() request: SelfServiceRequest) { return this.readCollection(request, "company:documents:read", (ref) => this.gateway.core.getCompanyDocuments(ref), SELF_SERVICE_PUBLIC_FIELDS.documents); }
  @Get("requests") @UseGuards(SelfServiceSessionGuard) requests(@Req() request: SelfServiceRequest) { return this.readCollection(request, "company:requests:read", (ref) => this.gateway.core.getCompanyRequests(ref), SELF_SERVICE_PUBLIC_FIELDS.requests); }
  @Get("reports") @UseGuards(SelfServiceSessionGuard) reports(@Req() request: SelfServiceRequest) { return this.readCollection(request, "company:reports:read", (ref) => this.gateway.core.getCompanyReports(ref), SELF_SERVICE_PUBLIC_FIELDS.reports); }

  private readPayload(request: SelfServiceRequest, scope: string, operation: (subjectRef: string) => Promise<ProviderResult<Readonly<Record<string, unknown>>>>, fields: readonly string[]) { const p = this.principal(request); this.gateway.assertScope(p, scope); return this.gateway.readPayload(() => operation(p.subjectRef), fields); }
  private readCollection(request: SelfServiceRequest, scope: string, operation: (subjectRef: string) => Promise<ProviderResult<readonly Readonly<Record<string, unknown>>[]>>, fields: readonly string[]) { const p = this.principal(request); this.gateway.assertScope(p, scope); return this.gateway.readCollection(() => operation(p.subjectRef), fields); }
  private principal(request: SelfServiceRequest) { if (!request.selfService) throw new BadRequestException("Sesión no disponible."); return request.selfService; }
}
