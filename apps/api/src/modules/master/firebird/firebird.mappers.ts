import { MasterInvalidResponseError } from "../domain/master.errors";
import type {
  Company,
  Contract,
  ContractStatus,
  Installment,
  MasterDate,
  MasterDecimal,
  Payment,
  PaymentReceipt,
  PaymentReceiptLine,
  Person,
  Plan,
} from "../domain/master.models";
import type { FirebirdRow } from "../ports/firebird-read-client";

function optionalString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string" && typeof value !== "number" && typeof value !== "bigint") return null;
  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : null;
}

function requiredString(value: unknown, operation: string): string {
  const normalized = optionalString(value);
  if (!normalized) throw new MasterInvalidResponseError(operation);
  return normalized;
}

function optionalDecimal(value: unknown): MasterDecimal | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : null;
  if (typeof value === "bigint") return value.toString();
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(",", ".");
  return /^-?\d+(?:\.\d+)?$/.test(normalized) ? normalized : null;
}

function optionalInteger(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function optionalDate(value: unknown): MasterDate | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function optionalLegacyBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (value === 1 || value === "1") return true;
  if (value === 0 || value === "0") return false;
  return null;
}

export function mapPerson(row: FirebirdRow): Person {
  return {
    personId: requiredString(row.PERSON_ID ?? row.IDPERSONA, "findPersonByDocument"),
    document: optionalString(row.DOCUMENT),
    documentType: optionalString(row.DOCUMENT_TYPE),
    names: optionalString(row.NAMES),
    surnames: optionalString(row.SURNAMES),
    phone: optionalString(row.PHONE),
    whatsapp: optionalString(row.WHATSAPP),
    address: optionalString(row.ADDRESS),
    affiliationDate: optionalDate(row.AFFILIATION_DATE),
    withdrawalDate: optionalDate(row.WITHDRAWAL_DATE),
    withdrawn: optionalLegacyBoolean(row.WITHDRAWN),
    relationship: optionalString(row.RELATIONSHIP),
    contractId: optionalString(row.CONTRACT_ID ?? row.NROCONTRATO),
    planId: optionalString(row.PLAN_ID),
  };
}

export function mapContract(row: FirebirdRow): Contract {
  return {
    contractId: requiredString(row.IDCONTRATO, "contract"),
    personId: requiredString(row.IDPERSONA, "contract"),
    createdAt: optionalDate(row.FECHA),
    validFrom: optionalDate(row.DESDE),
    validUntil: optionalDate(row.HASTA),
    value: optionalDecimal(row.VALOR),
    initialValue: optionalDecimal(row.VALORINICIAL),
    installmentCount: optionalInteger(row.NOCUOTAS),
    legacyStatus: optionalString(row.ESTADO),
    planId: optionalString(row.IDPLAN),
    paidThrough: optionalDate(row.PAGOHASTA),
    balance: optionalDecimal(row.SALDO),
    installments: optionalInteger(row.CUOTAS),
    paymentFrequencyAmount: optionalDecimal(row.VALORCUOTAFORMAPAGO),
    companyNit: optionalString(row.NIT),
    monthsInArrears: optionalInteger(row.MESESENCARTERA),
    daysInArrears: optionalInteger(row.DIASENCARTERA),
    lastPaymentAt: optionalDate(row.FECHAULTIMOPAGO),
    lastPaymentAmount: optionalDecimal(row.VALORULTIMOPAGO),
    paymentMethodId: optionalString(row.IDFORMAPAGO),
    paymentModalityId: optionalString(row.IDMODALIDAD),
  };
}

export function mapCompany(row: FirebirdRow): Company {
  return {
    nit: requiredString(row.NIT, "findCompanyByNit"),
    name: optionalString(row.COMPANY_NAME),
    status: optionalString(row.COMPANY_STATUS),
  };
}

export function mapPlan(row: FirebirdRow): Plan {
  return {
    planId: requiredString(row.IDPLAN, "getPlan"),
    name: optionalString(row.PLAN_NAME),
    planTypeId: optionalString(row.PLAN_TYPE_ID),
    planType: optionalString(row.PLAN_TYPE),
    status: optionalString(row.PLAN_STATUS),
  };
}

export function mapInstallment(row: FirebirdRow): Installment {
  return {
    installmentId: requiredString(row.IDCUOTA, "getContractInstallments"),
    contractId: requiredString(row.IDCONTRATO, "getContractInstallments"),
    renewalId: optionalString(row.IDRENOVACION),
    dueDate: optionalDate(row.FECHAVENCE),
    installmentNumber: optionalInteger(row.NROCUOTA),
    value: optionalDecimal(row.VALOR),
    tax: optionalDecimal(row.IVA),
    amountPaid: optionalDecimal(row.ABONO),
    balance: optionalDecimal(row.SALDO),
    companyContribution: optionalDecimal(row.APORTEEMPRESA),
    workerContribution: optionalDecimal(row.APORTETRABAJADOR),
    agreement: optionalString(row.ACUERDO),
    legacyStatus: optionalString(row.ESTADO),
    agreementDate: optionalDate(row.F_ACUERDO),
    observation: optionalString(row.OBSERVACION),
  };
}

export function mapPayment(row: FirebirdRow): Payment {
  return {
    contractId: requiredString(row.IDCONTRATO, "getPaymentHistory"),
    paidAt: optionalDate(row.FECHA),
    amount: optionalDecimal(row.VALOR),
    receiptNumber: requiredString(row.NORECIBO, "getPaymentHistory"),
    periodFrom: optionalDate(row.DESDE),
    periodUntil: optionalDate(row.HASTA),
    detail: optionalString(row.DETALLE),
    collectorId: optionalString(row.IDCOBRADOR),
    annulled: optionalLegacyBoolean(row.ANULADO),
    operator: optionalString(row.USUARIO),
    balance: optionalDecimal(row.SALDO),
    paymentType: optionalString(row.TIPOPAGO),
    discount: optionalDecimal(row.DESCUENTO),
    document: optionalString(row.NRODOCUMENTO),
    documentType: optionalString(row.TIPODOCUMENTO),
    cashRegisterId: optionalString(row.IDCAJA),
    prefix: optionalString(row.PREFIJO),
  };
}

export function mapPaymentReceipt(paymentRow: FirebirdRow, detailRows: readonly FirebirdRow[]): PaymentReceipt {
  const payment = mapPayment(paymentRow);
  const lines: readonly PaymentReceiptLine[] = detailRows.map((row) => ({
    description: optionalString(row.LINE_DESCRIPTION),
    amount: optionalDecimal(row.LINE_AMOUNT),
  }));
  return { receiptNumber: payment.receiptNumber, payment, lines };
}

export function mapContractStatus(row: FirebirdRow): ContractStatus {
  return {
    contractId: requiredString(row.IDCONTRATO, "getContractStatus"),
    legacyStatus: optionalString(row.ESTADO),
    validFrom: optionalDate(row.DESDE),
    validUntil: optionalDate(row.HASTA),
    paidThrough: optionalDate(row.PAGOHASTA),
    balance: optionalDecimal(row.SALDO),
    withdrawalDate: null,
    derivedStatus: null,
  };
}
