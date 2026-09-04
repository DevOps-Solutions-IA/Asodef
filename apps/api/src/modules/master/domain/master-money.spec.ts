import { positiveMasterDecimalToCents } from "./master-money";

describe("positiveMasterDecimalToCents", () => {
  it.each<[string, number]>([
    ["1", 100],
    ["1.2", 120],
    ["1.23", 123],
    ["50000.00", 5_000_000],
    ["50000.0000", 5_000_000],
    ["00012.30", 1_230],
  ])("converts %s exactly to integer cents", (value, expected) => {
    expect(positiveMasterDecimalToCents(value)).toBe(expected);
  });

  it.each<Array<string | null>>([[null], [""], ["0"], ["0.00"], ["-1.00"], ["1.234"], ["abc"], ["1,23"]])(
    "fails closed for non-positive or non-cent-exact value %s",
    (value) => {
      expect(positiveMasterDecimalToCents(value)).toBeNull();
    },
  );

  it("fails closed when the result would exceed JavaScript's safe integer range", () => {
    expect(positiveMasterDecimalToCents("90071992547410.00")).toBeNull();
  });
});
