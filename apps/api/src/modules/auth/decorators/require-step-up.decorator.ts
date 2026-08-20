import { SetMetadata } from "@nestjs/common";

export const REQUIRE_STEP_UP_KEY = "requireStepUp";

/**
 * Requires the current administrative session to have completed MFA and a
 * recent authentication ceremony. This metadata is enforced by the global
 * StepUpGuard; decorating a route never performs authentication by itself.
 */
export const RequireStepUp = () => SetMetadata(REQUIRE_STEP_UP_KEY, true);
