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
 *  - contains no backslash or encoded path-normalization trick;
 *  - resolves against a fixed trusted origin without changing that origin.
 */
export function isSafeInternalPath(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 2_048) return false;
  if (!value.startsWith("/")) return false;
  if (value.startsWith("//")) return false;
  if (value.includes("\\") || containsControlCharacter(value)) return false;

  // URL parsers normalize backslashes and encoded separators differently.
  // Decode a small, bounded number of layers before trusting the path so
  // `%5c` and `%255c` cannot become an external destination later.
  let decoded = value;
  for (let depth = 0; depth < 3; depth += 1) {
    if (decoded.includes("\\") || containsControlCharacter(decoded) || decoded.startsWith("//") || decoded.includes("://")) return false;
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    } catch {
      return false;
    }
  }

  try {
    const trustedOrigin = "https://asodef.invalid";
    const resolved = new URL(decoded, trustedOrigin);
    return resolved.origin === trustedOrigin && resolved.pathname.startsWith("/");
  } catch {
    return false;
  }
}

function containsControlCharacter(value: string): boolean {
  return Array.from(value).some((character) => {
    const code = character.charCodeAt(0);
    return code <= 0x1f || code === 0x7f;
  });
}
