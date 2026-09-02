export type MasterIdentifier = string;
export type MasterDecimal = string;
export type MasterDate = string;

export interface Person {
  personId: MasterIdentifier;
  document: string | null;
  documentType: string | null;
  names: string | null;
  surnames: string | null;
  phone: string | null;
  whatsapp: string | null;
  address: string | null;
  affiliationDate: MasterDate | null;
  withdrawalDate: MasterDate | null;
  withdrawn: boolean | null;
  relationship: string | null;
  contractId: MasterIdentifier | null;
  planId: MasterIdentifier | null;
}

export interface Contract {
  contractId: MasterIdentifier;
  personId: MasterIdentifier;
  createdAt: MasterDate | null;
  validFrom: MasterDate | null;
  validUntil: MasterDate | null;
  value: MasterDecimal | null;
  initialValue: MasterDecimal | null;
  installmentCount: number | null;
  legacyStatus: string | null;
  planId: MasterIdentifier | null;
  paidThrough: MasterDate | null;
  balance: MasterDecimal | null;
  installments: number | null;
  paymentFrequencyAmount: MasterDecimal | null;
  companyNit: string | null;
  monthsInArrears: number | null;
  daysInArrears: number | null;
  lastPaymentAt: MasterDate | null;
  lastPaymentAmount: MasterDecimal | null;
  paymentMethodId: MasterIdentifier | null;
  paymentModalityId: MasterIdentifier | null;
}

export interface Company {
  nit: string;
  name: string | null;
  status: string | null;
  contactMobile: string | null;
  contactPhone: string | null;
  phone2: string | null;
  phone: string | null;
}

export interface Plan {
  planId: MasterIdentifier;
  name: string | null;
  planTypeId: MasterIdentifier | null;
  planType: string | null;
  status: string | null;
}

export interface Installment {
  installmentId: MasterIdentifier;
  contractId: MasterIdentifier;
  renewalId: MasterIdentifier | null;
  dueDate: MasterDate | null;
  installmentNumber: number | null;
  value: MasterDecimal | null;
  tax: MasterDecimal | null;
  amountPaid: MasterDecimal | null;
  balance: MasterDecimal | null;
  companyContribution: MasterDecimal | null;
  workerContribution: MasterDecimal | null;
  agreement: string | null;
  legacyStatus: string | null;
  agreementDate: MasterDate | null;
  observation: string | null;
}

export interface Payment {
  contractId: MasterIdentifier;
  paidAt: MasterDate | null;
  amount: MasterDecimal | null;
  receiptNumber: string;
  periodFrom: MasterDate | null;
  periodUntil: MasterDate | null;
  detail: string | null;
  collectorId: MasterIdentifier | null;
  annulled: boolean | null;
  operator: string | null;
  balance: MasterDecimal | null;
  paymentType: string | null;
  discount: MasterDecimal | null;
  document: string | null;
  documentType: string | null;
  cashRegisterId: MasterIdentifier | null;
  prefix: string | null;
}

export interface PaymentReceiptLine {
  description: string | null;
  amount: MasterDecimal | null;
}

export interface PaymentReceipt {
  receiptNumber: string;
  payment: Payment;
  lines: readonly PaymentReceiptLine[];
}

export interface ContractStatus {
  contractId: MasterIdentifier;
  legacyStatus: string | null;
  validFrom: MasterDate | null;
  validUntil: MasterDate | null;
  paidThrough: MasterDate | null;
  balance: MasterDecimal | null;
  withdrawalDate: MasterDate | null;
  derivedStatus: null;
}
