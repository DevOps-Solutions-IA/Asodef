import { randomUUID } from "node:crypto";
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { RequirePermissions } from "../auth/decorators/permissions.decorator";
import { RequireStepUp } from "../auth/decorators/require-step-up.decorator";
import type {
  AuthenticatedRequest,
  RequestUser,
} from "../auth/types/request-user.type";
import {
  CreateFileKnowledgeDto,
  CreateManualKnowledgeDto,
  KnowledgeLifecycleCommandDto,
  KnowledgePreviewDto,
  KnowledgeRetrievalTestDto,
  ListKnowledgeItemsQueryDto,
  OfficialWebImportDto,
} from "./knowledge.dto";
import {
  KnowledgeService,
  type KnowledgeMutationContext,
} from "./knowledge.service";

const MAX_KNOWLEDGE_FILE_BYTES = 10 * 1024 * 1024;

/**
 * Governed administrative surface for Knowledge V1. There is intentionally no
 * public draft/review/approved read route here: Koral retrieval goes through
 * KnowledgeGateway and applies publication, scope and classification filters.
 */
@ApiTags("admin-knowledge")
@ApiCookieAuth("asodef_at")
@Controller("admin/knowledge")
export class KnowledgeController {
  constructor(private readonly knowledge: KnowledgeService) {}

  @RequirePermissions("knowledge.read")
  @Get("items")
  listItems(@Query() query: ListKnowledgeItemsQueryDto) {
    return this.knowledge.listItems(query);
  }

  @RequirePermissions("knowledge.read")
  @Get("items/:id")
  getItem(@Param("id", ParseUUIDPipe) id: string) {
    return this.knowledge.getItem(id);
  }

  @RequirePermissions("knowledge.manage")
  @RequireStepUp()
  @Post("versions/:id/diff")
  @HttpCode(HttpStatus.OK)
  getVersionDiff(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() actor: RequestUser,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.knowledge.getVersionDiff(id, mutationContext(actor, request));
  }

  @RequirePermissions("knowledge.read")
  @Post("retrieval")
  @HttpCode(HttpStatus.OK)
  testPublishedRetrieval(
    @Body() dto: KnowledgeRetrievalTestDto,
    @CurrentUser() actor: RequestUser,
    @Req() request: AuthenticatedRequest,
  ) {
    const contextual = request as AuthenticatedRequest & {
      requestId?: string;
      correlationId?: string;
    };
    const correlationId = contextual.correlationId ?? contextual.requestId ?? randomUUID();
    return this.knowledge.search(
      { version: "v1", query: dto.query, domainKeys: dto.domainKeys, limit: dto.limit },
      {
        version: "v1",
        identity: {
          principalType: "HUMAN_AGENT",
          principalId: actor.id,
          effectiveActorId: actor.id,
          identityLevel: "AUTHENTICATED",
          permissions: actor.permissions,
        },
        audit: { correlationId, ...(contextual.requestId ? { requestId: contextual.requestId } : {}) },
        policy: {
          purpose: "ADMIN_KNOWLEDGE_RETRIEVAL_TEST",
          consentPurposeKeys: [],
          consentVerified: false,
          piiPolicy: "MINIMIZE",
          dataClassification: "SENSITIVE",
        },
        effectiveScope: {
          authority: "SERVER_SIDE",
          tenantKey: "ASODEF",
          audience: "ADMIN_ONLY",
          organizationIds: [],
          maximumDataClassification: "SENSITIVE",
        },
        deadlineAt: new Date(Date.now() + 5_000).toISOString(),
      },
    );
  }

  @RequirePermissions("knowledge.manage")
  @RequireStepUp()
  @Post("versions/manual")
  createManualDraft(
    @Body() dto: CreateManualKnowledgeDto,
    @CurrentUser() actor: RequestUser,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.knowledge.createManualDraft(
      dto,
      mutationContext(actor, request),
    );
  }

  @RequirePermissions("knowledge.manage")
  @RequireStepUp()
  @Post("versions/file")
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: MAX_KNOWLEDGE_FILE_BYTES, files: 1 },
    }),
  )
  createFileDraft(
    @Body() dto: CreateFileKnowledgeDto,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() actor: RequestUser,
    @Req() request: AuthenticatedRequest,
  ) {
    if (!file) throw new BadRequestException("El archivo es obligatorio.");
    return this.knowledge.createFileDraft(
      dto,
      {
        originalname: file.originalname,
        mimetype: file.mimetype,
        buffer: file.buffer,
      },
      mutationContext(actor, request),
    );
  }

  @RequirePermissions("knowledge.manage")
  @RequireStepUp()
  @Post("imports/official-web")
  registerOfficialWebImport(@Body() dto: OfficialWebImportDto) {
    // The service validates the governed request and fails closed while DNS
    // pinning/rebinding-resistant transport remains explicitly deferred.
    return this.knowledge.registerOfficialWebImport(dto);
  }

  @RequirePermissions("knowledge.manage")
  @RequireStepUp()
  @Post("versions/:id/submit-review")
  @HttpCode(HttpStatus.OK)
  submitReview(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: KnowledgeLifecycleCommandDto,
    @CurrentUser() actor: RequestUser,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.knowledge.submitReview(
      id,
      dto,
      mutationContext(actor, request),
    );
  }

  @RequirePermissions("knowledge.manage")
  @RequireStepUp()
  @Post("versions/:id/return-draft")
  @HttpCode(HttpStatus.OK)
  returnToDraft(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: KnowledgeLifecycleCommandDto,
    @CurrentUser() actor: RequestUser,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.knowledge.returnToDraft(
      id,
      dto,
      mutationContext(actor, request),
    );
  }

  @RequirePermissions("knowledge.publish")
  @RequireStepUp()
  @Post("versions/:id/approve")
  @HttpCode(HttpStatus.OK)
  approve(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: KnowledgeLifecycleCommandDto,
    @CurrentUser() actor: RequestUser,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.knowledge.approve(id, dto, mutationContext(actor, request));
  }

  @RequirePermissions("knowledge.publish")
  @RequireStepUp()
  @Post("versions/:id/publish")
  @HttpCode(HttpStatus.OK)
  publish(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: KnowledgeLifecycleCommandDto,
    @CurrentUser() actor: RequestUser,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.knowledge.publish(id, dto, mutationContext(actor, request));
  }

  @RequirePermissions("knowledge.publish")
  @RequireStepUp()
  @Post("versions/:id/retire")
  @HttpCode(HttpStatus.OK)
  retire(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: KnowledgeLifecycleCommandDto,
    @CurrentUser() actor: RequestUser,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.knowledge.retire(id, dto, mutationContext(actor, request));
  }

  @RequirePermissions("knowledge.publish")
  @RequireStepUp()
  @Post("versions/:id/preview")
  @HttpCode(HttpStatus.OK)
  preview(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: KnowledgePreviewDto,
    @CurrentUser() actor: RequestUser,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.knowledge.preview(id, dto, mutationContext(actor, request));
  }
}

function mutationContext(
  actor: RequestUser,
  request: AuthenticatedRequest,
): KnowledgeMutationContext {
  const contextual = request as AuthenticatedRequest & {
    requestId?: string;
    correlationId?: string;
  };
  return {
    actorUserId: actor.id,
    requestId: contextual.requestId,
    correlationId: contextual.correlationId,
  };
}
