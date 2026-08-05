import { IsBoolean, IsIn } from "class-validator";

/**
 * "Strictly necessary" is never submitted - it has no toggle (US-047
 * AC: "always on/disabled toggle"), so there is nothing to record a
 * choice about.
 */
export class RecordCookieConsentDto {
  @IsBoolean()
  preferences!: boolean;

  @IsBoolean()
  analytics!: boolean;

  @IsBoolean()
  marketing!: boolean;

  @IsIn(["accept_all", "reject_optional", "customize"], {
    message: "method debe ser accept_all, reject_optional o customize.",
  })
  method!: "accept_all" | "reject_optional" | "customize";
}
