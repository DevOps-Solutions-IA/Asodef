import type { Contract, ContractAcceptance, ContractSigner, ContractVersion } from "@prisma/client";

export interface AdminContractResponse {
  id: string;
  type: string;
  relatedCompanyId: string | null;
  relatedCustomerId: string | null;
  internalReference: string;
  currentVersionId: string | null;
  status: string;
  effectiveDate: Date | null;
  expirationDate: Date | null;
  notes: string | null;
  createdAt: Date;
}

export function toAdminContractResponse(contract: Contract): AdminContractResponse {
  return {
    id: contract.id,
    type: contract.type,
    relatedCompanyId: contract.relatedCompanyId,
    relatedCustomerId: contract.relatedCustomerId,
    internalReference: contract.internalReference,
    currentVersionId: contract.currentVersionId,
    status: contract.status,
    effectiveDate: contract.effectiveDate,
    expirationDate: contract.expirationDate,
    notes: contract.notes,
    createdAt: contract.createdAt,
  };
}

/** documentPath is deliberately never exposed here - it's an internal
 * filesystem location, only ever resolved server-side when a valid
 * signed download token is presented. */
export interface AdminContractVersionResponse {
  id: string;
  contractId: string;
  version: number;
  checksum: string;
  changeSummary: string | null;
  createdByUserId: string | null;
  createdAt: Date;
}

export function toAdminContractVersionResponse(version: ContractVersion): AdminContractVersionResponse {
  return {
    id: version.id,
    contractId: version.contractId,
    version: version.version,
    checksum: version.checksum,
    changeSummary: version.changeSummary,
    createdByUserId: version.createdByUserId,
    createdAt: version.createdAt,
  };
}

export interface AdminContractSignerResponse {
  id: string;
  contractVersionId: string;
  fullName: string;
  role: string | null;
  email: string;
}

export function toAdminContractSignerResponse(signer: ContractSigner): AdminContractSignerResponse {
  return {
    id: signer.id,
    contractVersionId: signer.contractVersionId,
    fullName: signer.fullName,
    role: signer.role,
    email: signer.email,
  };
}

export interface AdminContractAcceptanceResponse {
  id: string;
  contractVersionId: string;
  signerId: string;
  acceptedAt: Date;
  ipAddress: string | null;
  evidenceReference: string | null;
  /** Not persisted - computed at response time so a caller can see
   * immediately whether this acceptance completed the contract. */
  contractStatus: string;
}

export function toAdminContractAcceptanceResponse(acceptance: ContractAcceptance, contractStatus: string): AdminContractAcceptanceResponse {
  return {
    id: acceptance.id,
    contractVersionId: acceptance.contractVersionId,
    signerId: acceptance.signerId,
    acceptedAt: acceptance.acceptedAt,
    ipAddress: acceptance.ipAddress,
    evidenceReference: acceptance.evidenceReference,
    contractStatus,
  };
}
