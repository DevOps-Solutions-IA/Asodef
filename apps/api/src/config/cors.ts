/**
 * CORS_ORIGIN is a comma-separated allowlist (e.g.
 * "https://asodef.com.co,https://www.asodef.com.co"). Empty/whitespace-only
 * entries are dropped so a trailing comma can't accidentally produce a
 * wildcard-like empty-string origin.
 */
export function parseCorsOrigins(corsOriginEnv: string): string[] {
  return corsOriginEnv
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}
