import { Controller, Headers, HttpException, HttpStatus, Param, Req, Sse } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { Public } from "../../auth/decorators/public.decorator";
import { RateLimiterService } from "../../auth/rate-limiter.service";
import { parseBingoLastEventId } from "../contracts/realtime";
import { BingoRealtimeRepository } from "./bingo-realtime.repository";
import { BingoRealtimeStreamService } from "./bingo-realtime-stream.service";

@Public()
@ApiTags("bingo-public")
@Controller("public/bingo/events")
export class BingoPublicRealtimeController {
  constructor(
    private readonly repository: BingoRealtimeRepository,
    private readonly streams: BingoRealtimeStreamService,
    private readonly limiter: RateLimiterService,
  ) {}

  @Sse(":eventSlug/stream")
  async stream(
    @Param("eventSlug") eventSlug: string,
    @Headers("last-event-id") lastEventId: string | undefined,
    @Req() request: Request,
  ) {
    const rate = await this.limiter.checkAndIncrement(
      `bingo:sse:public:${request.ip || "unknown"}`,
      30,
      60,
    );
    if (rate.limited) {
      throw new HttpException("Demasiadas conexiones.", HttpStatus.TOO_MANY_REQUESTS);
    }
    const slug = this.validSlug(eventSlug);
    const access = await this.repository.publicAccess(slug);
    return this.streams.open(
      access,
      parseBingoLastEventId(lastEventId),
      `/public/bingo/events/${encodeURIComponent(slug)}/snapshot`,
    );
  }

  private validSlug(value: string): string {
    if (!/^[a-z0-9](?:[a-z0-9-]{0,98}[a-z0-9])?$/.test(value)) {
      return "__not-found__";
    }
    return value;
  }
}
