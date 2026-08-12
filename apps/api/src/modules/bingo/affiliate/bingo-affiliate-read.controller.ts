import {
  BadRequestException,
  Controller,
  Get,
  ForbiddenException,
  Param,
  ParseUUIDPipe,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import { SelfServicePortal } from "@prisma/client";
import { Public } from "../../auth/decorators/public.decorator";
import { AffiliateIdentityService } from "../../self-service/affiliate-identity.service";
import {
  RequireSelfServicePortal,
  SelfServiceSessionGuard,
  type SelfServiceRequest,
} from "../../self-service/self-service.guards";
import type { BingoAffiliateActorContract } from "../contracts/affiliate";
import { BINGO_AFFILIATE_SCOPE } from "../contracts/common";
import { RequireBingoSurface } from "../feature-flags";
import { BingoAffiliateReadService } from "./bingo-affiliate-read.service";

@Public()
@ApiTags("bingo-affiliate")
@ApiCookieAuth("asodef_affiliate_ss")
@RequireBingoSurface("affiliate")
@Controller("self-service/affiliate/bingo")
@RequireSelfServicePortal(SelfServicePortal.AFFILIATE)
@UseGuards(SelfServiceSessionGuard)
export class BingoAffiliateReadController {
  constructor(
    private readonly reads: BingoAffiliateReadService,
    private readonly identities: AffiliateIdentityService,
  ) {}

  @Get("events")
  async listEvents(@Req() request: SelfServiceRequest) {
    return this.reads.listMyEvents(await this.actor(request));
  }

  @Get("events/:eventId/cards")
  async listCards(
    @Req() request: SelfServiceRequest,
    @Param("eventId", ParseUUIDPipe) eventId: string,
  ) {
    return this.reads.listMyCards(await this.actor(request), eventId);
  }

  @Get("events/:eventId/cards/:cardId")
  async getCard(
    @Req() request: SelfServiceRequest,
    @Param("eventId", ParseUUIDPipe) eventId: string,
    @Param("cardId", ParseUUIDPipe) cardId: string,
  ) {
    return this.reads.getMyCard(await this.actor(request), eventId, cardId);
  }

  @Get("events/:eventId/state")
  async state(
    @Req() request: SelfServiceRequest,
    @Param("eventId", ParseUUIDPipe) eventId: string,
  ) {
    return this.reads.getRoundState(await this.actor(request), eventId);
  }

  @Get("events/:eventId/history")
  async history(
    @Req() request: SelfServiceRequest,
    @Param("eventId", ParseUUIDPipe) eventId: string,
  ) {
    return this.reads.getHistory(await this.actor(request), eventId);
  }

  private async actor(request: SelfServiceRequest): Promise<BingoAffiliateActorContract> {
    const principal = request.selfService;
    if (!principal) throw new BadRequestException("Sesión no disponible.");
    if (!principal.scopes.includes(BINGO_AFFILIATE_SCOPE)) {
      throw new ForbiddenException("La sesión no autoriza esta operación.");
    }
    const identity = await this.identities.resolveSubject(principal.subjectRef);
    return {
      sessionId: principal.sessionId,
      affiliateId: identity.affiliateId,
      identityId: identity.identityId,
      identityIssuer: identity.issuer,
      assurance: principal.assurance,
      scope: BINGO_AFFILIATE_SCOPE,
    };
  }
}
