import { BadRequestException, Body, Controller, Delete, Get, Headers, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Req, Res, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiTags } from "@nestjs/swagger";
import { SelfServicePortal } from "@prisma/client";
import type { Response } from "express";
import { Public } from "../auth/decorators/public.decorator";
import { buildRequestContext } from "../../common/http/request-context.util";
import { AccessRequestCodeDto, AccessResendDto, AccessVerifyDto, AffiliateAccessStartDto, BeneficiaryDocumentDto, ContactUpdateRequestCodeDto, ContactUpdateStartDto, ContactUpdateVerifyDto, ProviderMutationDto } from "./self-service.dto";
import { SelfServiceAccessService } from "./self-service-access.service";
import { SelfServiceCookieService, SelfServiceSessionService } from "./self-service-session.service";
import { RequireSelfServicePortal, SelfServiceCsrfGuard, SelfServiceSessionGuard, type SelfServiceRequest } from "./self-service.guards";
import { SELF_SERVICE_PUBLIC_FIELDS, SelfServiceGatewayService } from "./self-service-gateway.service";
import type { BeneficiaryDocumentUpload, ProviderResult } from "./external-core.provider";
import { SelfServiceContactUpdateService } from "./self-service-contact-update.service";

@Public()
@ApiTags("self-service-affiliate")
@Controller("self-service/affiliate")
@RequireSelfServicePortal(SelfServicePortal.AFFILIATE)
export class AffiliateSelfServiceController {
  constructor(private readonly access: SelfServiceAccessService, private readonly sessions: SelfServiceSessionService, private readonly cookies: SelfServiceCookieService, private readonly gateway: SelfServiceGatewayService, private readonly contactUpdates: SelfServiceContactUpdateService) {}

  @Post("access/start") @HttpCode(HttpStatus.OK)
  start(@Body() dto: AffiliateAccessStartDto, @Req() request: SelfServiceRequest) {
    const input = dto.identifierMode === "DOCUMENT"
      ? { identifierMode: dto.identifierMode, documentType: dto.documentType!, identifier: dto.identifier } as const
      : { identifierMode: dto.identifierMode, identifier: dto.identifier } as const;
    return this.access.startAffiliate(input, buildRequestContext(request));
  }

  @Post("access/request-code") @HttpCode(HttpStatus.OK)
  requestCode(@Body() dto: AccessRequestCodeDto, @Req() request: SelfServiceRequest) {
    return this.access.requestCode(SelfServicePortal.AFFILIATE, dto.providerReference, dto.channelReference, buildRequestContext(request));
  }

  @Post("access/resend") @HttpCode(HttpStatus.OK)
  resend(@Body() dto: AccessResendDto, @Req() request: SelfServiceRequest) {
    return this.access.resend(SelfServicePortal.AFFILIATE, dto.challengeId, buildRequestContext(request));
  }

  @Post("access/verify") @HttpCode(HttpStatus.OK)
  async verify(@Body() dto: AccessVerifyDto, @Req() request: SelfServiceRequest, @Res({ passthrough: true }) response: Response) {
    const result = await this.access.verify(SelfServicePortal.AFFILIATE, dto.challengeId, dto.code, buildRequestContext(request));
    if (result.status !== "VERIFIED") return result;
    this.cookies.set(response, SelfServicePortal.AFFILIATE, result.rawToken, result.expiresAt);
    return { status: result.status, sessionId: result.sessionId, csrfToken: result.csrfToken, expiresAt: result.expiresAt, scopes: result.scopes, assurance: result.assurance, portal: result.portal };
  }

  @Get("session") @UseGuards(SelfServiceSessionGuard)
  async session(@Req() request: SelfServiceRequest) {
    const principal = this.principal(request);
    const csrfToken = await this.sessions.rotateCsrf(principal);
    if (!csrfToken) throw new BadRequestException("No fue posible renovar la protección de la sesión.");
    return { status: "VERIFIED", portal: principal.portal, scopes: principal.scopes, assurance: principal.assurance, expiresAt: principal.expiresAt, csrfToken };
  }

  @Delete("session") @UseGuards(SelfServiceSessionGuard, SelfServiceCsrfGuard) @HttpCode(HttpStatus.OK)
  async logout(@Req() request: SelfServiceRequest, @Res({ passthrough: true }) response: Response) { await this.sessions.revoke(this.principal(request).sessionId); this.cookies.clear(response, SelfServicePortal.AFFILIATE); return { status: "VERIFIED" }; }

  @Get("summary") @UseGuards(SelfServiceSessionGuard) summary(@Req() request: SelfServiceRequest) { return this.affiliatePayload(request, "affiliate:summary:read", (ref) => this.gateway.core.getAffiliateSummary(ref), SELF_SERVICE_PUBLIC_FIELDS.affiliateSummary); }
  @Get("beneficiaries") @UseGuards(SelfServiceSessionGuard) beneficiaries(@Req() request: SelfServiceRequest) { return this.affiliateCollection(request, "affiliate:beneficiaries:read", (ref) => this.gateway.core.getAffiliateBeneficiaries(ref), SELF_SERVICE_PUBLIC_FIELDS.beneficiaries); }
  @Get("account-statement") @UseGuards(SelfServiceSessionGuard) statement(@Req() request: SelfServiceRequest) { return this.affiliatePayload(request, "affiliate:account:read", (ref) => this.gateway.core.getAffiliateAccountStatement(ref), SELF_SERVICE_PUBLIC_FIELDS.accountStatement); }
  @Get("obligations") @UseGuards(SelfServiceSessionGuard) obligations(@Req() request: SelfServiceRequest) { return this.affiliateCollection(request, "affiliate:account:read", (ref) => this.gateway.core.getAffiliateObligations(ref), SELF_SERVICE_PUBLIC_FIELDS.obligations); }
  @Get("payments") @UseGuards(SelfServiceSessionGuard) payments(@Req() request: SelfServiceRequest) { return this.affiliateCollection(request, "affiliate:payments:read", (ref) => this.gateway.core.getAffiliatePayments(ref), SELF_SERVICE_PUBLIC_FIELDS.payments); }
  @Get("receipts") @UseGuards(SelfServiceSessionGuard) receipts(@Req() request: SelfServiceRequest) { return this.affiliateCollection(request, "affiliate:payments:read", (ref) => this.gateway.core.getAffiliateReceipts(ref), SELF_SERVICE_PUBLIC_FIELDS.receipts); }
  @Get("documents") @UseGuards(SelfServiceSessionGuard) documents(@Req() request: SelfServiceRequest) { return this.affiliateCollection(request, "affiliate:documents:read", (ref) => this.gateway.core.getAffiliateDocuments(ref), SELF_SERVICE_PUBLIC_FIELDS.documents); }
  @Get("requests") @UseGuards(SelfServiceSessionGuard) requests(@Req() request: SelfServiceRequest) { return this.affiliateCollection(request, "affiliate:requests:read", (ref) => this.gateway.core.getAffiliateRequests(ref), SELF_SERVICE_PUBLIC_FIELDS.requests); }
  @Get("beneficiary-rules") @UseGuards(SelfServiceSessionGuard) rules(@Req() request: SelfServiceRequest) { return this.affiliatePayload(request, "affiliate:beneficiaries:read", (ref) => this.gateway.core.getAffiliateBeneficiaryRules(ref), SELF_SERVICE_PUBLIC_FIELDS.beneficiaryRules); }

  @Get("beneficiary-change-requests") @UseGuards(SelfServiceSessionGuard) listChanges(@Req() request: SelfServiceRequest) { return this.affiliateCollection(request, "affiliate:beneficiaries:read", (ref) => this.gateway.core.listAffiliateBeneficiaryChangeRequests(ref), SELF_SERVICE_PUBLIC_FIELDS.changeRequest); }
  @Get("beneficiary-change-requests/:requestId") @UseGuards(SelfServiceSessionGuard) getChange(@Req() request: SelfServiceRequest, @Param("requestId") requestId: string) { return this.affiliatePayload(request, "affiliate:beneficiaries:read", (ref) => this.gateway.core.getAffiliateBeneficiaryChangeRequest(ref, requestId), SELF_SERVICE_PUBLIC_FIELDS.changeRequest); }
  @Post("beneficiary-change-requests") @UseGuards(SelfServiceSessionGuard, SelfServiceCsrfGuard)
  createChange(@Req() request: SelfServiceRequest, @Body() dto: ProviderMutationDto, @Headers("idempotency-key") key?: string) { const p = this.principal(request); this.gateway.assertScope(p, "affiliate:beneficiaries:manage"); return this.gateway.mutate(p, "BENEFICIARY_CHANGE_CREATE", key, dto.payload, () => this.gateway.core.createAffiliateBeneficiaryChangeRequest(p.subjectRef, dto.payload, key!)); }
  @Patch("beneficiary-change-requests/:requestId") @UseGuards(SelfServiceSessionGuard, SelfServiceCsrfGuard)
  updateChange(@Req() request: SelfServiceRequest, @Param("requestId") id: string, @Body() dto: ProviderMutationDto, @Headers("idempotency-key") key?: string) { const p = this.principal(request); this.gateway.assertScope(p, "affiliate:beneficiaries:manage"); return this.gateway.mutate(p, "BENEFICIARY_CHANGE_UPDATE", key, { id, ...dto.payload }, () => this.gateway.core.updateAffiliateBeneficiaryChangeRequest(p.subjectRef, id, dto.payload, key!)); }
  @Post("beneficiary-change-requests/:requestId/documents") @UseGuards(SelfServiceSessionGuard, SelfServiceCsrfGuard) @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 5 * 1024 * 1024, files: 1 } }))
  uploadDocument(@Req() request: SelfServiceRequest, @Param("requestId") id: string, @Body() dto: BeneficiaryDocumentDto, @UploadedFile() file: Express.Multer.File | undefined, @Headers("idempotency-key") key?: string) {
    const p = this.principal(request); this.gateway.assertScope(p, "affiliate:documents:upload");
    if (!file || !["application/pdf", "image/jpeg", "image/png"].includes(file.mimetype) || file.size < 1 || /[/\\\0]/.test(file.originalname)) throw new BadRequestException("Documento no válido. Usa PDF, JPG o PNG de hasta 5 MB.");
    const upload: BeneficiaryDocumentUpload = { documentType: dto.documentType, originalName: file.originalname, mimeType: file.mimetype, size: file.size, buffer: file.buffer };
    return this.gateway.mutate(p, "BENEFICIARY_CHANGE_DOCUMENT", key, { id, documentType: dto.documentType, originalName: file.originalname, mimeType: file.mimetype, size: file.size }, () => this.gateway.core.uploadAffiliateBeneficiaryChangeDocument(p.subjectRef, id, upload, key!));
  }
  @Post("beneficiary-change-requests/:requestId/submit") @UseGuards(SelfServiceSessionGuard, SelfServiceCsrfGuard)
  submitChange(@Req() request: SelfServiceRequest, @Param("requestId") id: string, @Headers("idempotency-key") key?: string) { return this.changeAction(request, id, key, "BENEFICIARY_CHANGE_SUBMIT", (ref) => this.gateway.core.submitAffiliateBeneficiaryChangeRequest(ref, id, key!)); }
  @Post("beneficiary-change-requests/:requestId/cancel") @UseGuards(SelfServiceSessionGuard, SelfServiceCsrfGuard)
  cancelChange(@Req() request: SelfServiceRequest, @Param("requestId") id: string, @Headers("idempotency-key") key?: string) { return this.changeAction(request, id, key, "BENEFICIARY_CHANGE_CANCEL", (ref) => this.gateway.core.cancelAffiliateBeneficiaryChangeRequest(ref, id, key!)); }

  @Post("contact-updates/start") @UseGuards(SelfServiceSessionGuard, SelfServiceCsrfGuard)
  startContactUpdate(@Req() request: SelfServiceRequest, @Body() dto: ContactUpdateStartDto, @Headers("idempotency-key") key?: string) {
    const principal = this.principal(request);
    this.gateway.assertScope(principal, "affiliate:contact:manage");
    this.gateway.assertScope(principal, "affiliate:profile:update");
    return this.gateway.mutate(principal, "CONTACT_UPDATE_START", key, dto, () => this.contactUpdates.start(principal, dto.channel, dto.newDestination, buildRequestContext(request)));
  }

  @Post("contact-updates/request-code") @UseGuards(SelfServiceSessionGuard, SelfServiceCsrfGuard)
  requestContactUpdateCode(@Req() request: SelfServiceRequest, @Body() dto: ContactUpdateRequestCodeDto, @Headers("idempotency-key") key?: string) {
    const principal = this.principal(request);
    this.gateway.assertScope(principal, "affiliate:contact:manage");
    this.gateway.assertScope(principal, "affiliate:profile:update");
    return this.gateway.mutate(principal, "CONTACT_UPDATE_REQUEST_CODE", key, dto, () => this.contactUpdates.requestCode(principal, dto.requestId, buildRequestContext(request)));
  }

  @Post("contact-updates/verify") @UseGuards(SelfServiceSessionGuard, SelfServiceCsrfGuard)
  verifyContactUpdate(@Req() request: SelfServiceRequest, @Body() dto: ContactUpdateVerifyDto, @Headers("idempotency-key") key?: string) {
    const principal = this.principal(request);
    this.gateway.assertScope(principal, "affiliate:contact:manage");
    this.gateway.assertScope(principal, "affiliate:profile:update");
    return this.gateway.mutate(principal, "CONTACT_UPDATE_VERIFY", key, dto, () => this.contactUpdates.verify(principal, dto.requestId, dto.code, key!, buildRequestContext(request)));
  }

  @Get("contact-updates/:requestId/status") @UseGuards(SelfServiceSessionGuard)
  contactUpdateStatus(@Req() request: SelfServiceRequest, @Param("requestId", new ParseUUIDPipe()) requestId: string) {
    const principal = this.principal(request);
    this.gateway.assertScope(principal, "affiliate:contact:manage");
    this.gateway.assertScope(principal, "affiliate:profile:update");
    return this.contactUpdates.status(principal, requestId);
  }

  private affiliatePayload(request: SelfServiceRequest, scope: string, operation: (subjectRef: string) => Promise<ProviderResult<Readonly<Record<string, unknown>>>>, fields: readonly string[]) { const p = this.principal(request); this.gateway.assertScope(p, scope); return this.gateway.readPayload(() => operation(p.subjectRef), fields); }
  private affiliateCollection(request: SelfServiceRequest, scope: string, operation: (subjectRef: string) => Promise<ProviderResult<readonly Readonly<Record<string, unknown>>[]>>, fields: readonly string[]) { const p = this.principal(request); this.gateway.assertScope(p, scope); return this.gateway.readCollection(() => operation(p.subjectRef), fields); }
  private changeAction(request: SelfServiceRequest, id: string, key: string | undefined, name: string, operation: (subjectRef: string) => ReturnType<SelfServiceGatewayService["core"]["submitAffiliateBeneficiaryChangeRequest"]>) { const p = this.principal(request); this.gateway.assertScope(p, "affiliate:beneficiaries:manage"); return this.gateway.mutate(p, name, key, { id }, () => operation(p.subjectRef)); }
  private principal(request: SelfServiceRequest) { if (!request.selfService) throw new BadRequestException("Sesión no disponible."); return request.selfService; }
}
