import type { Installment } from "./master.models";

function dateKey(value: string | null): string | null {
  if (!value) return null;
  const direct = /^(\d{4}-\d{2}-\d{2})/.exec(value)?.[1];
  if (direct) return direct;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(parsed);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  return year && month && day ? `${year}-${month}-${day}` : null;
}

function todayKey(now: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  if (!year || !month || !day) throw new Error("Unable to resolve America/Bogota business date");
  return `${year}-${month}-${day}`;
}

function hasPositiveBalance(installment: Installment): boolean {
  if (installment.balance === null) return false;
  const value = Number(installment.balance);
  return Number.isFinite(value) && value > 0;
}

/**
 * Approved ASODEF collection rule:
 * - every overdue installment with remaining balance is payable;
 * - the current installment is the earliest non-overdue installment with
 *   remaining balance (all rows sharing that due date are included);
 * - future installments after the current one are not exposed as required;
 * - partial payments are represented by SALDO, so only the remaining balance
 *   is considered payable.
 */
export function selectPayableInstallments(
  installments: readonly Installment[],
  now = new Date(),
): readonly Installment[] {
  const today = todayKey(now);
  const candidates = installments
    .map((installment) => ({ installment, due: dateKey(installment.dueDate) }))
    .filter((item): item is { installment: Installment; due: string } =>
      item.due !== null && hasPositiveBalance(item.installment),
    )
    .sort((a, b) =>
      a.due.localeCompare(b.due) ||
      (a.installment.installmentNumber ?? Number.MAX_SAFE_INTEGER) -
        (b.installment.installmentNumber ?? Number.MAX_SAFE_INTEGER),
    );

  const overdue = candidates.filter((item) => item.due < today);
  const nonOverdue = candidates.filter((item) => item.due >= today);
  const currentDue = nonOverdue[0]?.due;
  const current = currentDue ? nonOverdue.filter((item) => item.due === currentDue) : [];

  return [...overdue, ...current].map((item) => item.installment);
}

export function payableInstallmentStatus(
  installment: Installment,
  now = new Date(),
): "OVERDUE" | "CURRENT" | null {
  if (!hasPositiveBalance(installment)) return null;
  const due = dateKey(installment.dueDate);
  if (!due) return null;
  return due < todayKey(now) ? "OVERDUE" : "CURRENT";
}
