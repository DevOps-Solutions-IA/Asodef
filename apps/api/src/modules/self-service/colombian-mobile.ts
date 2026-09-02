export function normalizeColombianMobile(value: string): string | null {
  const digits = value.replace(/\D/g, "");
  const national = digits.startsWith("57") && digits.length === 12
    ? digits.slice(2)
    : digits;
  if (!/^3\d{9}$/.test(national)) return null;
  return `57${national}`;
}
