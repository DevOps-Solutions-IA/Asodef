import type { MasterDecimal } from "./master.models";

/**
 * Converts a positive Firebird decimal string into integer minor units without
 * ever passing through JavaScript floating-point arithmetic.
 *
 * Firebird numeric columns can be surfaced with a scale wider than two (for
 * example "50000.0000"). Extra fractional digits are accepted only when they
 * are zero; otherwise the value cannot be represented exactly as COP cents and
 * the caller must fail closed rather than round a financial amount silently.
 */
export function positiveMasterDecimalToCents(value: MasterDecimal | null): number | null {
  if (!value) return null;
  const match = /^(\d+)(?:\.(\d+))?$/.exec(value.trim());
  if (!match) return null;

  const integerPart = match[1];
  if (!integerPart) return null;
  const fraction = match[2] ?? "";
  if (fraction.length > 2 && /[^0]/.test(fraction.slice(2))) return null;

  const fractionCents = (fraction.slice(0, 2) + "00").slice(0, 2);

  try {
    const cents = BigInt(integerPart) * 100n + BigInt(fractionCents);
    if (cents <= 0n || cents > BigInt(Number.MAX_SAFE_INTEGER)) return null;
    return Number(cents);
  } catch {
    return null;
  }
}
