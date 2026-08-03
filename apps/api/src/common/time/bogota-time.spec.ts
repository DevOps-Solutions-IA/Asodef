import { formatBogotaTime } from "./bogota-time";

describe("formatBogotaTime", () => {
  it("renders a UTC instant in America/Bogota local time (UTC-5, no DST)", () => {
    // Colombia does not observe daylight saving time - always UTC-5.
    const utcInstant = new Date("2026-06-15T15:30:00.000Z");
    const formatted = formatBogotaTime(utcInstant);

    expect(formatted).toContain("10:30:00");
    expect(formatted).toContain("2026");
  });

  it("stays at UTC-5 in a different month (June and January both UTC-5)", () => {
    const utcInstant = new Date("2026-01-01T05:00:00.000Z");
    const formatted = formatBogotaTime(utcInstant);

    expect(formatted).toContain("00:00:00");
  });

  it("does not mutate the original Date's underlying UTC instant", () => {
    const utcInstant = new Date("2026-06-15T15:30:00.000Z");
    const originalTime = utcInstant.getTime();

    formatBogotaTime(utcInstant);

    expect(utcInstant.getTime()).toBe(originalTime);
    expect(utcInstant.toISOString()).toBe("2026-06-15T15:30:00.000Z");
  });
});
