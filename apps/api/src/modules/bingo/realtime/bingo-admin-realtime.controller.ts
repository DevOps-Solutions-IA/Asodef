import {
  Controller,
  Headers,
  Param,
  ParseUUIDPipe,
  Sse,
} from "@nestjs/common";
import { ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import { RequirePermissions } from "../../auth/decorators/permissions.decorator";
import { parseBingoLastEventId } from "../contracts/realtime";
import { BingoRealtimeRepository } from "./bingo-realtime.repository";
import { BingoRealtimeStreamService } from "./bingo-realtime-stream.service";

@ApiTags("bingo-admin")
@ApiCookieAuth("asodef_at")
@Controller("admin/bingo")
export class BingoAdminRealtimeController {
  constructor(
    private readonly repository: BingoRealtimeRepository,
    private readonly streams: BingoRealtimeStreamService,
  ) {}

  @Sse("events/:eventId/stream")
  @RequirePermissions("bingo.read")
  async stream(
    @Param("eventId", ParseUUIDPipe) eventId: string,
    @Headers("last-event-id") lastEventId: string | undefined,
  ) {
    const access = await this.repository.adminAccess(eventId);
    return this.streams.open(
      access,
      parseBingoLastEventId(lastEventId),
      `/admin/bingo/events/${eventId}`,
    );
  }
}
