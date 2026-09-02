export function normalizeColombianMobile(value: string): string | null {
  const digits = value.replace(/\D/g, "");
  if (/^3\d{9}$/.test(digits)) return `57${digits}`;
  if (/^573\d{9}$/.test(digits)) return digits;
  return null;
}

export function maskMobile(value: string): string {
  const normalized = normalizeColombianMobile(value);
  if (!normalized) return "Celular registrado";
  return `+57 *** *** ${normalized.slice(-4)}`;
}
