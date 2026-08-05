import { describe, expect, it } from "vitest";
import { formatColombianNumber } from "./format-colombian-number";

describe("formatColombianNumber", () => {
  it("US-014 (AC, verbatim): formats with Colombian Spanish thousands separators, e.g. '8.405'", () => {
    expect(formatColombianNumber(8405)).toBe("8.405");
    expect(formatColombianNumber(54692)).toBe("54.692");
  });

  it("formats numbers under 1000 with no separator", () => {
    expect(formatColombianNumber(999)).toBe("999");
    expect(formatColombianNumber(0)).toBe("0");
  });

  it("formats numbers in the millions with multiple separators", () => {
    expect(formatColombianNumber(1_000_000)).toBe("1.000.000");
  });

  it("rounds a fractional in-progress animation value to a whole number", () => {
    expect(formatColombianNumber(8404.7)).toBe("8.405");
  });
});
