import { z } from "zod";

/**
 * Mirrors apps/api's PasswordPolicyService defaults (env.validation.ts:
 * PASSWORD_MIN_LENGTH=12, PASSWORD_MAX_LENGTH=128) - US-010 section 3:
 * "use the same centralized password policy as represented by the API
 * contract; do not invent a contradictory frontend-only password
 * policy." This is a non-authoritative *hint* only, shown before
 * submission so the user isn't surprised - the backend remains the only
 * real enforcement point (common-password/history-reuse/email-reuse
 * checks all happen server-side and cannot be replicated safely or
 * usefully on the client). Deliberately no forced character-class rules
 * (no "must contain a symbol") - matches the backend's own NIST-aligned
 * length-over-composition approach; inventing extra frontend-only rules
 * here would be exactly the "contradictory policy" this section forbids.
 */
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

export const passwordFieldSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `La contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres.`)
  .max(PASSWORD_MAX_LENGTH, `La contraseña no puede tener más de ${PASSWORD_MAX_LENGTH} caracteres.`);
