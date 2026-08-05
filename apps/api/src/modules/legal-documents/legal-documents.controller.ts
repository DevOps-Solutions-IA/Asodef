import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post } from "@nestjs/common";
import { ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import { Public } from "../auth/decorators/public.decorator";
import { RequirePermissions } from "../auth/decorators/permissions.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import type { RequestUser } from "../auth/types/request-user.type";
import { LegalDocumentsService } from "./legal-documents.service";
import { CreateLegalDocumentDto } from "./dto/create-legal-document.dto";
import { CreateLegalDocumentVersionDto } from "./dto/create-legal-document-version.dto";
import { UpdateLegalDocumentVersionDto } from "./dto/update-legal-document-version.dto";

@ApiTags("legal-documents")
@Controller()
export class LegalDocumentsController {
  constructor(private readonly legalDocumentsService: LegalDocumentsService) {}

  /** US-045's own future consumer - only ever a currently-effective
   * PUBLISHED version, never draft/review/pending-approval content. */
  @Public()
  @Get("legal-documents/:slug")
  getPublished(@Param("slug") slug: string) {
    return this.legalDocumentsService.getPublishedBySlug(slug);
  }

  @ApiCookieAuth("asodef_at")
  @RequirePermissions("content.manage")
  @Post("admin/legal-documents")
  @HttpCode(HttpStatus.CREATED)
  createDocument(@CurrentUser() actor: RequestUser, @Body() dto: CreateLegalDocumentDto) {
    return this.legalDocumentsService.createDocument(actor.id, dto);
  }

  @ApiCookieAuth("asodef_at")
  @RequirePermissions("content.manage")
  @Get("admin/legal-documents/:documentId")
  getDocument(@Param("documentId", ParseUUIDPipe) documentId: string) {
    return this.legalDocumentsService.getDocument(documentId);
  }

  @ApiCookieAuth("asodef_at")
  @RequirePermissions("content.manage")
  @Post("admin/legal-documents/:documentId/versions")
  @HttpCode(HttpStatus.CREATED)
  createVersion(
    @Param("documentId", ParseUUIDPipe) documentId: string,
    @CurrentUser() actor: RequestUser,
    @Body() dto: CreateLegalDocumentVersionDto,
  ) {
    return this.legalDocumentsService.createVersion(documentId, actor.id, dto);
  }

  @ApiCookieAuth("asodef_at")
  @RequirePermissions("content.manage")
  @Patch("admin/legal-documents/versions/:versionId")
  updateDraft(
    @Param("versionId", ParseUUIDPipe) versionId: string,
    @CurrentUser() actor: RequestUser,
    @Body() dto: UpdateLegalDocumentVersionDto,
  ) {
    return this.legalDocumentsService.updateDraft(versionId, actor.id, dto);
  }

  @ApiCookieAuth("asodef_at")
  @RequirePermissions("content.manage")
  @Post("admin/legal-documents/versions/:versionId/submit-for-review")
  @HttpCode(HttpStatus.OK)
  submitForReview(@Param("versionId", ParseUUIDPipe) versionId: string, @CurrentUser() actor: RequestUser) {
    return this.legalDocumentsService.submitForReview(versionId, actor.id);
  }

  @ApiCookieAuth("asodef_at")
  @RequirePermissions("content.manage")
  @Post("admin/legal-documents/versions/:versionId/submit-for-approval")
  @HttpCode(HttpStatus.OK)
  submitForApproval(@Param("versionId", ParseUUIDPipe) versionId: string, @CurrentUser() actor: RequestUser) {
    return this.legalDocumentsService.submitForApproval(versionId, actor.id);
  }

  @ApiCookieAuth("asodef_at")
  @RequirePermissions("content.manage")
  @Post("admin/legal-documents/versions/:versionId/reject")
  @HttpCode(HttpStatus.OK)
  reject(@Param("versionId", ParseUUIDPipe) versionId: string, @CurrentUser() actor: RequestUser) {
    return this.legalDocumentsService.reject(versionId, actor.id);
  }

  @ApiCookieAuth("asodef_at")
  @RequirePermissions("legal.approve")
  @Post("admin/legal-documents/versions/:versionId/approve")
  @HttpCode(HttpStatus.OK)
  approve(@Param("versionId", ParseUUIDPipe) versionId: string, @CurrentUser() actor: RequestUser) {
    return this.legalDocumentsService.approve(versionId, actor.id);
  }

  @ApiCookieAuth("asodef_at")
  @RequirePermissions("legal.approve")
  @Post("admin/legal-documents/versions/:versionId/publish")
  @HttpCode(HttpStatus.OK)
  publish(@Param("versionId", ParseUUIDPipe) versionId: string, @CurrentUser() actor: RequestUser) {
    return this.legalDocumentsService.publish(versionId, actor.id);
  }
}
