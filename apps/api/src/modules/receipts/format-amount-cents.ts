/**
 * US-034: "financial precision - amountCents arithmetic never
 * introduces float error". amountCents is always a whole integer
 * (never divided/multiplied anywhere except here, purely for display),
 * and toLocaleString's own rounding is what actually guards against
 * exposing a raw binary-float artifact (e.g. 1330/100 === 13.3 exactly
 * as a JS number, but is NOT exactly representable in binary - without
 * explicit fraction-digit rounding a naive `String(cents / 100)` could
 * eventually surface a trailing-9s/trailing-0000...1 artifact for some
 * inputs). Never used for any stored value or comparison - amountCents
 * itself remains the only source of truth everywhere else.
 */
export function formatAmountCents(amountCents: number): string {
  return (amountCents / 100).toLocaleString("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
