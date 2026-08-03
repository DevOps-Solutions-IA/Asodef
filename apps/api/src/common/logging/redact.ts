const SENSITIVE_KEY_FRAGMENTS = [
  "password",
  "passwordhash",
  "token",
  "tokenhash",
  "secret",
  "authorization",
  "cookie",
  "apikey",
  "api_key",
  "jwt",
  "refreshtoken",
  "encryptionkey",
  "databaseurl",
  "database_url",
];

const REDACTED = "[REDACTED]";

function isSensitiveKey(key: string): boolean {
  const normalized = key.toLowerCase();
  return SENSITIVE_KEY_FRAGMENTS.some((fragment) => normalized.includes(fragment));
}

/**
 * Recursively redacts any object property whose key name looks like it
 * holds a secret. Used by AppLogger before anything is written to stdout.
 */
export function redactObject(input: unknown, seen: WeakSet<object> = new WeakSet()): unknown {
  if (input === null || typeof input !== "object") {
    return typeof input === "string" ? redactString(input) : input;
  }
  if (input instanceof Date) {
    return input;
  }
  if (seen.has(input)) {
    return "[CIRCULAR]";
  }
  seen.add(input);

  if (Array.isArray(input)) {
    return input.map((item) => redactObject(item, seen));
  }

  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (isSensitiveKey(key)) {
      output[key] = REDACTED;
    } else if (typeof value === "object" && value !== null) {
      output[key] = redactObject(value, seen);
    } else if (typeof value === "string") {
      output[key] = redactString(value);
    } else {
      output[key] = value;
    }
  }
  return output;
}

// Matches scheme://user:password@ in connection strings (postgres, redis, etc.)
const CONNECTION_STRING_CREDENTIALS = /(\b\w+:\/\/)[^\s@:/]+:[^\s@]+@/gi;

/**
 * Scrubs connection-string-style embedded credentials from a plain string
 * message (e.g. an error thrown by a driver that echoes DATABASE_URL).
 */
export function redactString(input: string): string {
  return input.replace(CONNECTION_STRING_CREDENTIALS, (_match, scheme: string) => `${scheme}[REDACTED]@`);
}
