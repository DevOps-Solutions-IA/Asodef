import { BingoFairnessErrorCode, failFairness } from "./fairness-errors";

export type CanonicalJsonPrimitive = null | boolean | number | string;
export type CanonicalJsonValue =
  | CanonicalJsonPrimitive
  | readonly CanonicalJsonValue[]
  | { readonly [key: string]: CanonicalJsonValue };

export type IsoUtcTimestamp = string & {
  readonly __isoUtcTimestamp: unique symbol;
};

function assertValidUnicode(value: string, path: string): void {
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const low = value.charCodeAt(index + 1);
      if (!(low >= 0xdc00 && low <= 0xdfff)) {
        failFairness(BingoFairnessErrorCode.INVALID_UNICODE, { path });
      }
      index += 1;
    } else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      failFairness(BingoFairnessErrorCode.INVALID_UNICODE, { path });
    }
  }
}

function quote(value: string, path: string): string {
  assertValidUnicode(value, path);
  return JSON.stringify(value);
}

function canonicalize(
  value: unknown,
  path: string,
  ancestors: Set<object>,
): string {
  if (value === null) {
    return "null";
  }
  if (typeof value === "string") {
    return quote(value, path);
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      failFairness(BingoFairnessErrorCode.INVALID_CANONICAL_VALUE, { path });
    }
    return JSON.stringify(value);
  }
  if (typeof value !== "object") {
    failFairness(BingoFairnessErrorCode.INVALID_CANONICAL_VALUE, { path });
  }
  if (value instanceof Date) {
    failFairness(BingoFairnessErrorCode.INVALID_CANONICAL_VALUE, { path });
  }
  if (ancestors.has(value)) {
    failFairness(BingoFairnessErrorCode.INVALID_CANONICAL_VALUE, { path });
  }

  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      const allowedKeys = new Set([
        "length",
        ...Array.from({ length: value.length }, (_, i) => `${i}`),
      ]);
      if (
        Reflect.ownKeys(value).some(
          (key) => typeof key !== "string" || !allowedKeys.has(key),
        )
      ) {
        failFairness(BingoFairnessErrorCode.INVALID_CANONICAL_VALUE, { path });
      }
      const items: string[] = [];
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(value, `${index}`);
        if (
          descriptor === undefined ||
          !descriptor.enumerable ||
          !("value" in descriptor)
        ) {
          failFairness(BingoFairnessErrorCode.INVALID_CANONICAL_VALUE, {
            path: `${path}[${index}]`,
          });
        }
        items.push(
          canonicalize(descriptor.value, `${path}[${index}]`, ancestors),
        );
      }
      return `[${items.join(",")}]`;
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      failFairness(BingoFairnessErrorCode.INVALID_CANONICAL_VALUE, { path });
    }

    const properties = Reflect.ownKeys(value);
    if (properties.some((key) => typeof key === "symbol")) {
      failFairness(BingoFairnessErrorCode.INVALID_CANONICAL_VALUE, { path });
    }
    const keys = properties as string[];
    keys.sort();

    const entries = keys.map((key) => {
      assertValidUnicode(key, `${path}.{key}`);
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (
        descriptor === undefined ||
        !descriptor.enumerable ||
        !("value" in descriptor)
      ) {
        failFairness(BingoFairnessErrorCode.INVALID_CANONICAL_VALUE, {
          path: `${path}.${key}`,
        });
      }
      return `${quote(key, `${path}.{key}`)}:${canonicalize(
        descriptor.value,
        `${path}.${key}`,
        ancestors,
      )}`;
    });
    return `{${entries.join(",")}}`;
  } finally {
    ancestors.delete(value);
  }
}

/** RFC 8785 JSON Canonicalization Scheme for the admitted I-JSON value set. */
export function canonicalizeJson(value: CanonicalJsonValue): string {
  return canonicalize(value, "$", new Set());
}

export function canonicalJsonBytes(value: CanonicalJsonValue): Buffer {
  return Buffer.from(canonicalizeJson(value), "utf8");
}

/** Dates entering committed configuration must cross this explicit boundary. */
export function parseIsoUtcTimestamp(value: string): IsoUtcTimestamp {
  const format = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
  const parsed = new Date(value);
  if (
    !format.test(value) ||
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString() !== value
  ) {
    failFairness(BingoFairnessErrorCode.INVALID_ISO_TIMESTAMP, {
      field: "timestamp",
    });
  }
  return value as IsoUtcTimestamp;
}
