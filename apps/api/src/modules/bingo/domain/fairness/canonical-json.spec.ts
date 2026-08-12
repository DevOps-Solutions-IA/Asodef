import {
  calculateConfigurationHash,
  canonicalJsonBytes,
  canonicalizeJson,
  parseIsoUtcTimestamp,
} from "./index";
import { BingoFairnessErrorCode } from "./fairness-errors";

describe("RFC 8785 canonical JSON", () => {
  it("matches the RFC 8785 serialization sample", () => {
    const value = {
      numbers: [Number("333333333.33333329"), 1e30, 4.5, 2e-3, 1e-27],
      string: '€$\u000f\nA\'B"\\"/',
      literals: [null, true, false],
    };

    expect(canonicalizeJson(value)).toBe(
      String.raw`{"literals":[null,true,false],"numbers":[333333333.3333333,1e+30,4.5,0.002,1e-27],"string":"€$\u000f\nA'B\"\\\"/"}`,
    );
  });

  it("uses UTF-16 lexical key order and preserves Unicode without normalization", () => {
    expect(canonicalizeJson({ ö: 1, a: 2, "€": 3, "😀": 4 })).toBe(
      '{"a":2,"ö":1,"€":3,"😀":4}',
    );
    expect(canonicalizeJson({ composed: "é", decomposed: "e\u0301" })).toBe(
      '{"composed":"é","decomposed":"é"}',
    );
  });

  it("produces identical UTF-8 bytes for the same logical object and no formatting whitespace", () => {
    const first = { z: [3, 2, 1], nested: { beta: true, alpha: null } };
    const second = { nested: { alpha: null, beta: true }, z: [3, 2, 1] };
    expect(canonicalJsonBytes(first)).toEqual(canonicalJsonBytes(second));
    expect(canonicalizeJson(first)).toBe(
      '{"nested":{"alpha":null,"beta":true},"z":[3,2,1]}',
    );
  });

  it("uses ECMAScript finite-number serialization required by JCS", () => {
    expect(canonicalizeJson([-0, 1e-7, 1e20, 1e21, 0.000001])).toBe(
      "[0,1e-7,100000000000000000000,1e+21,0.000001]",
    );
  });

  it("matches a known SHA-256 configuration vector", () => {
    expect(calculateConfigurationHash({})).toBe(
      "44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a",
    );
  });

  it.each([
    ["non-finite", { value: Number.NaN }],
    ["infinity", { value: Number.POSITIVE_INFINITY }],
    ["undefined", { value: undefined }],
    ["bigint", { value: 1n }],
    ["date", { value: new Date("2026-08-09T00:00:00.000Z") }],
    ["function", { value: (): void => undefined }],
    ["sparse array", { value: Array(2) }],
  ])(
    "rejects %s instead of applying JSON fallback behavior",
    (_label, value) => {
      expect(() => canonicalizeJson(value as never)).toThrow(
        expect.objectContaining({
          code: BingoFairnessErrorCode.INVALID_CANONICAL_VALUE,
        }),
      );
    },
  );

  it("rejects cycles, accessors, symbols and non-plain objects", () => {
    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;
    const accessor = Object.defineProperty({}, "value", {
      enumerable: true,
      get: () => 1,
    });
    const symbol = { value: 1, [Symbol("hidden")]: 2 };

    const accessorArray = Object.defineProperty([], "0", {
      enumerable: true,
      get: () => 1,
    });
    accessorArray.length = 1;
    const extendedArray = [1] as number[] & { metadata?: string };
    extendedArray.metadata = "not-json-array-data";

    for (const value of [
      cycle,
      accessor,
      symbol,
      accessorArray,
      extendedArray,
      new Map(),
    ]) {
      expect(() => canonicalizeJson(value as never)).toThrow(
        expect.objectContaining({
          code: BingoFairnessErrorCode.INVALID_CANONICAL_VALUE,
        }),
      );
    }
  });

  it("rejects lone Unicode surrogates in values and keys", () => {
    expect(() => canonicalizeJson({ value: "\ud800" })).toThrow(
      expect.objectContaining({ code: BingoFairnessErrorCode.INVALID_UNICODE }),
    );
    expect(() => canonicalizeJson({ ["\udc00"]: "value" })).toThrow(
      expect.objectContaining({ code: BingoFairnessErrorCode.INVALID_UNICODE }),
    );
  });

  it("admits dates only through the explicit canonical ISO UTC contract", () => {
    expect(parseIsoUtcTimestamp("2026-08-09T20:30:00.123Z")).toBe(
      "2026-08-09T20:30:00.123Z",
    );
    for (const value of [
      "2026-08-09",
      "2026-08-09T20:30:00Z",
      "2026-08-09T15:30:00.123-05:00",
      "2026-02-30T00:00:00.000Z",
    ]) {
      expect(() => parseIsoUtcTimestamp(value)).toThrow(
        expect.objectContaining({
          code: BingoFairnessErrorCode.INVALID_ISO_TIMESTAMP,
        }),
      );
    }
  });
});
