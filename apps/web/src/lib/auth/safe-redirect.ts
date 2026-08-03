/**
 * Guards against an open redirect (US-010 section 1/11: "reject unsafe
 * external redirect targets"). The only place a return-location string
 * ever comes from is React Router's own in-memory navigation `state`
 * (never a URL query parameter, never localStorage - see
 * AuthenticatedRoute), but it is still validated here before ever being
 * passed to navigate(), since state is arbitrary, caller-supplied data.
 *
 * A safe internal path:
 *  - is a string
 *  - starts with exactly one leading "/" (rejects "//evil.com", the
 *    classic protocol-relative open-redirect trick, and rejects
 *    "https://..."/"javascript:..." absolute targets outright since they
 *    don't start with "/" at all)
 *  - never contains "://" anywhere (belt-and-braces against something
 *    like "/\evil.com" or an encoded variant)
 */
export function isSafeInternalPath(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0) return false;
  if (!value.startsWith("/")) return false;
  if (value.startsWith("//")) return false;
  if (value.includes("://")) return false;
  return true;
}
