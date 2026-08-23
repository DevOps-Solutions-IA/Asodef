import { Global, Module } from "@nestjs/common";
import { AdminBusinessIdempotencyService } from "./admin-business-idempotency.service";

@Global()
@Module({ providers: [AdminBusinessIdempotencyService], exports: [AdminBusinessIdempotencyService] })
export class AdminBusinessIdempotencyModule {}
