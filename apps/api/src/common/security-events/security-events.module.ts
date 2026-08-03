import { Module } from "@nestjs/common";
import { SecurityEventService } from "./security-event.service";

/**
 * Split out from the auth module (US-007) so other domains - starting
 * with notifications - can record typed security events without a
 * circular module dependency on AuthModule (which itself now imports
 * NotificationsModule for password-recovery emails).
 */
@Module({
  providers: [SecurityEventService],
  exports: [SecurityEventService],
})
export class SecurityEventsModule {}
