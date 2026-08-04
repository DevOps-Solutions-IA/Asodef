import { formatAmountCents } from "./format-amount-cents";

describe("formatAmountCents (US-034: financial precision - amountCents arithmetic never introduces float error)", () => {
  it.each([
    [100, "1,00"],
    [1, "0,01"],
    [99, "0,99"],
    [300, "3,00"],
    [1301, "13,01"],
    // 1330/100 === 13.3, a value with no exact binary representation -
    // the classic case where naive float-to-string conversion can leak
    // an artifact (e.g. "13.299999999999999") if not explicitly rounded.
    [1330, "13,30"],
    [999999, "9.999,99"],
    [5000000, "50.000,00"],
    [12345678, "123.456,78"],
    [1000000000, "10.000.000,00"],
  ])("formats %i cents as exactly %s, with no floating-point artifact", (cents, expected) => {
    const formatted = formatAmountCents(cents);
    expect(formatted).toBe(expected);
    expect(formatted).not.toMatch(/\d{4,}$/); // a leaked float artifact would produce many trailing digits
  });

  it("never produces more than 2 digits after the decimal separator, for any integer cent amount", () => {
    for (const cents of [1, 7, 33, 250, 1999, 123456789]) {
      const formatted = formatAmountCents(cents);
      const decimalPart = formatted.split(",")[1];
      expect(decimalPart).toHaveLength(2);
    }
  });
});
