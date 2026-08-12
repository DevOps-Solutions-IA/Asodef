import {
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Req,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { Public } from "../../auth/decorators/public.decorator";
import { RateLimiterService } from "../../auth/rate-limiter.service";
import { BingoPublicReadService } from "./bingo-public-read.service";

const PUBLIC_READ_LIMIT = 120;
const PUBLIC_READ_WINDOW_SECONDS = 60;

@Public()
@ApiTags("bingo-public")
@Controller("public/bingo/events")
export class BingoPublicReadController {
  constructor(
    private readonly reads: BingoPublicReadService,
    private readonly limiter: RateLimiterService,
  ) {}

  @Get(":eventSlug")
  async event(@Param("eventSlug") eventSlug: string, @Req() request: Request) {
    await this.enforceRateLimit(request);
    return this.reads.getEvent(this.validSlug(eventSlug));
  }

  @Get(":eventSlug/snapshot")
  async snapshot(@Param("eventSlug") eventSlug: string, @Req() request: Request) {
    await this.enforceRateLimit(request);
    return this.reads.getSnapshot(this.validSlug(eventSlug));
  }

  private validSlug(value: string): string {
    if (!/^[a-z0-9](?:[a-z0-9-]{0,98}[a-z0-9])?$/.test(value)) {
      throw new HttpException("Bingo no encontrado.", HttpStatus.NOT_FOUND);
    }
    return value;
  }

  private async enforceRateLimit(request: Request): Promise<void> {
    const result = await this.limiter.checkAndIncrement(
      `bingo:public:${request.ip || "unknown"}`,
      PUBLIC_READ_LIMIT,
      PUBLIC_READ_WINDOW_SECONDS,
    );
    if (result.limited) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: "Demasiadas solicitudes. Intenta de nuevo más tarde.",
          retryAfterSeconds: result.retryAfterSeconds,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }
}
