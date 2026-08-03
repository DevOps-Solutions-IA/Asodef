export const APP_TIMEZONE = "America/Bogota";

/**
 * All timestamps are stored in Postgres as TIMESTAMPTZ (a real UTC
 * instant - see prisma/schema.prisma). This only affects *display*: it
 * renders a Date in Colombia's local time (UTC-5, no DST) without ever
 * touching how the value is stored or transmitted internally.
 */
export function formatBogotaTime(date: Date, options?: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("es-CO", {
    timeZone: APP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    ...options,
  }).format(date);
}
