import { createHash } from "node:crypto";

type CanonicalValue =
  | string
  | number
  | boolean
  | bigint
  | null
  | readonly CanonicalValue[]
  | Readonly<{ [key: string]: CanonicalValue }>;

function canonicalize(value: CanonicalValue): string {
  if (typeof value === "bigint") return `{"$bigint":"${value.toString()}"}`;
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  const record = value as Readonly<Record<string, CanonicalValue>>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalize(record[key]!)}`)
    .join(",")}}`;
}

export function evidenceFingerprint(value: CanonicalValue): string {
  return createHash("sha256").update(canonicalize(value)).digest("hex");
}
