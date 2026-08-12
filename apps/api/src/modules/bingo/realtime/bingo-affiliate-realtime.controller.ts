import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Headers,
  Param,
  ParseUUIDPipe,
  Req,
  Sse,
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
import { parseBingoLastEventId } from "../contracts/realtime";
import { BINGO_AFFILIATE_SCOPE } from "../contracts/common";
import { BingoRealtimeRepository } from "./bingo-realtime.repository";
import { BingoRealtimeStreamService } from "./bingo-realtime-stream.service";

@Public()
@ApiTags("bingo-affiliate")
@ApiCookieAuth("asodef_affiliate_ss")
@Controller("self-service/affiliate/bingo")
@RequireSelfServicePortal(SelfServicePortal.AFFILIATE)
@UseGuards(SelfServiceSessionGuard)
export class BingoAffiliateRealtimeController {
  constructor(
    private readonly repository: BingoRealtimeRepository,
    private readonly streams: BingoRealtimeStreamService,
    private readonly identities: AffiliateIdentityService,
  ) {}

  @Sse("events/:eventId/stream")
  async stream(
    @Req() request: SelfServiceRequest,
    @Param("eventId", ParseUUIDPipe) eventId: string,
    @Headers("last-event-id") lastEventId: string | undefined,
  ) {
    if (!request.selfService) throw new BadRequestException("Sesión no disponible.");
    if (
      !request.selfService.scopes.includes(BINGO_AFFILIATE_SCOPE) &&
      !request.selfService.scopes.includes("affiliate:summary:read")
    ) {
      throw new ForbiddenException("La sesión no autoriza esta operación.");
    }
    const identity = await this.identities.resolveSubject(
      request.selfService.subjectRef,
    );
    const access = await this.repository.affiliateAccess(
      eventId,
      identity.affiliateId,
    );
    return this.streams.open(
      access,
      parseBingoLastEventId(lastEventId),
      `/self-service/affiliate/bingo/events/${eventId}/state`,
    );
  }
}
