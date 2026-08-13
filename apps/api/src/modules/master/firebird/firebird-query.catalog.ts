import { MasterQueryNotReadyError } from "../domain/master.errors";

export const MASTER_FUNCTIONAL_TABLES = [
  "TBLPERSONA",
  "TBLCONTRATO",
  "TBLCUOTASCONTRATO",
  "TBLPAGOS",
  "TBLPAGOSDETALLE",
  "TBLEMPRESAS",
  "TBLPLANES",
  "TBLTIPOPLAN",
  "TBLFORMAPAGO",
  "TBLMODALIDADPAGO",
  "TBLCONTRATOSEMPRESA",
  "TBLRELEMPRESAPLAN",
  "TBLCONTRATOVALORCUOTA",
  "TBLRENOVACION",
  "TBLRETIROS",
  "TBLCARNET",
  "TBLTIPOIDENTIFICACION",
  "TBLPARENTESCO",
  "TBLPLANPARENTESCO",
] as const;

export type MasterFunctionalTable = (typeof MASTER_FUNCTIONAL_TABLES)[number];
export type MasterQueryName =
  | "currentUser"
  | "contractCountGate"
  | "health"
  | "findPersonByDocument"
  | "findPersonByNormalizedDocument"
  | "findCompanyByNit"
  | "getContract"
  | "getContractsByPerson"
  | "getCompanyContracts"
  | "getPlan"
  | "getContractInstallments"
  | "getOutstandingInstallments"
  | "getPaymentHistory"
  | "getPaymentReceipt"
  | "getContractBeneficiaries"
  | "getContractStatus";

export interface FirebirdQueryDefinition {
  name: MasterQueryName;
  sql: string;
  tables: readonly (MasterFunctionalTable | "RDB$DATABASE")[];
  parameterCount: number;
  purpose: "HEALTH" | "SECURITY_GATE" | "FUNCTIONAL";
}

export interface BlockedFirebirdQueryDefinition {
  name: MasterQueryName;
  readiness: "BLOCKED_WITH_EVIDENCE";
  reason: string;
  tables: readonly MasterFunctionalTable[];
}

const CONTRACT_COLUMNS = `
  c.IDCONTRATO,
  c.IDPERSONA,
  c.FECHA,
  c.DESDE,
  c.HASTA,
  c.VALOR,
  c.VALORINICIAL,
  c.NOCUOTAS,
  c.ESTADO,
  c.IDPLAN,
  c.PAGOHASTA,
  c.SALDO,
  c.CUOTAS,
  c.VALORCUOTAFORMAPAGO,
  c.NIT,
  c.MESESENCARTERA,
  c.DIASENCARTERA,
  c.FECHAULTIMOPAGO,
  c.VALORULTIMOPAGO,
  c.IDFORMAPAGO,
  c.IDMODALIDAD`;

const READY_QUERIES = {
  currentUser: {
    name: "currentUser",
    sql: "SELECT CURRENT_USER AS CURRENT_USER_NAME FROM RDB$DATABASE",
    tables: ["RDB$DATABASE"],
    parameterCount: 0,
    purpose: "SECURITY_GATE",
  },
  health: {
    name: "health",
    sql: "SELECT 1 AS HEALTH_VALUE FROM RDB$DATABASE",
    tables: ["RDB$DATABASE"],
    parameterCount: 0,
    purpose: "HEALTH",
  },
  contractCountGate: {
    name: "contractCountGate",
    sql: "SELECT COUNT(*) AS CONTRACT_COUNT FROM TBLCONTRATO",
    tables: ["TBLCONTRATO"],
    parameterCount: 0,
    purpose: "SECURITY_GATE",
  },
  findPersonByDocument: {
    name: "findPersonByDocument",
    sql: `SELECT FIRST 2
      p.IDPERSONA AS PERSON_ID,
      p.IDPERSONA AS DOCUMENT,
      ti.IDENTIFICACION AS DOCUMENT_TYPE,
      p.NOMBRES AS NAMES,
      p.APELLIDOS AS SURNAMES,
      p.TELEFONO AS PHONE,
      p.NROWHATSAPP AS WHATSAPP,
      p.DIRECCION AS ADDRESS,
      p.FECHAAFILIACION AS AFFILIATION_DATE,
      p.FECHARETIRO AS WITHDRAWAL_DATE,
      p.RETIRADO AS WITHDRAWN,
      p.PARENTESCO AS RELATIONSHIP,
      p.NROCONTRATO AS CONTRACT_ID,
      p.IDPLAN AS PLAN_ID
    FROM TBLPERSONA p
    JOIN TBLTIPOIDENTIFICACION ti
      ON ti.IDTIPOIDENTIFICACION = p.IDTIPOIDENTIFICACION
    WHERE p.IDPERSONA = ?`,
    tables: ["TBLPERSONA", "TBLTIPOIDENTIFICACION"],
    parameterCount: 1,
    purpose: "FUNCTIONAL",
  },
  findPersonByNormalizedDocument: {
    name: "findPersonByNormalizedDocument",
    sql: `SELECT FIRST 2
      p.IDPERSONA AS PERSON_ID,
      p.IDPERSONA AS DOCUMENT,
      ti.IDENTIFICACION AS DOCUMENT_TYPE,
      p.NOMBRES AS NAMES,
      p.APELLIDOS AS SURNAMES,
      p.TELEFONO AS PHONE,
      p.NROWHATSAPP AS WHATSAPP,
      p.DIRECCION AS ADDRESS,
      p.FECHAAFILIACION AS AFFILIATION_DATE,
      p.FECHARETIRO AS WITHDRAWAL_DATE,
      p.RETIRADO AS WITHDRAWN,
      p.PARENTESCO AS RELATIONSHIP,
      p.NROCONTRATO AS CONTRACT_ID,
      p.IDPLAN AS PLAN_ID
    FROM TBLPERSONA p
    JOIN TBLTIPOIDENTIFICACION ti
      ON ti.IDTIPOIDENTIFICACION = p.IDTIPOIDENTIFICACION
    WHERE TRIM(p.IDPERSONA) = ?`,
    tables: ["TBLPERSONA", "TBLTIPOIDENTIFICACION"],
    parameterCount: 1,
    purpose: "FUNCTIONAL",
  },
  findCompanyByNit: {
    name: "findCompanyByNit",
    sql: `SELECT e.NIT FROM TBLEMPRESAS e WHERE e.NIT = ?`,
    tables: ["TBLEMPRESAS"],
    parameterCount: 1,
    purpose: "FUNCTIONAL",
  },
  getContract: {
    name: "getContract",
    sql: `SELECT ${CONTRACT_COLUMNS} FROM TBLCONTRATO c WHERE c.IDCONTRATO = ?`,
    tables: ["TBLCONTRATO"],
    parameterCount: 1,
    purpose: "FUNCTIONAL",
  },
  getContractsByPerson: {
    name: "getContractsByPerson",
    sql: `SELECT ${CONTRACT_COLUMNS} FROM TBLCONTRATO c WHERE c.IDPERSONA = ? ORDER BY c.FECHA DESC, c.IDCONTRATO DESC`,
    tables: ["TBLCONTRATO"],
    parameterCount: 1,
    purpose: "FUNCTIONAL",
  },
  getCompanyContracts: {
    name: "getCompanyContracts",
    sql: `SELECT ${CONTRACT_COLUMNS} FROM TBLCONTRATOSEMPRESA ce JOIN TBLCONTRATO c ON c.IDCONTRATO = ce.IDCONTRATO WHERE ce.NIT = ? ORDER BY c.FECHA DESC, c.IDCONTRATO DESC`,
    tables: ["TBLCONTRATOSEMPRESA", "TBLCONTRATO"],
    parameterCount: 1,
    purpose: "FUNCTIONAL",
  },
  getPlan: {
    name: "getPlan",
    sql: "SELECT p.IDPLAN FROM TBLPLANES p WHERE p.IDPLAN = ?",
    tables: ["TBLPLANES"],
    parameterCount: 1,
    purpose: "FUNCTIONAL",
  },
  getContractInstallments: {
    name: "getContractInstallments",
    sql: `SELECT
      q.IDCUOTA,
      q.IDCONTRATO,
      q.IDRENOVACION,
      q.FECHAVENCE,
      q.NROCUOTA,
      q.VALOR,
      q.IVA,
      q.ABONO,
      q.SALDO,
      q.APORTEEMPRESA,
      q.APORTETRABAJADOR,
      q.ACUERDO,
      q.ESTADO,
      q.F_ACUERDO,
      q.OBSERVACION
    FROM TBLCUOTASCONTRATO q
    WHERE q.IDCONTRATO = ?
    ORDER BY q.FECHAVENCE, q.NROCUOTA, q.IDCUOTA`,
    tables: ["TBLCUOTASCONTRATO"],
    parameterCount: 1,
    purpose: "FUNCTIONAL",
  },
  getPaymentHistory: {
    name: "getPaymentHistory",
    sql: `SELECT
      p.IDCONTRATO,
      p.FECHA,
      p.VALOR,
      p.NORECIBO,
      p.DESDE,
      p.HASTA,
      p.DETALLE,
      p.IDCOBRADOR,
      p.ANULADO,
      p.USUARIO,
      p.SALDO,
      p.TIPOPAGO,
      p.DESCUENTO,
      p.NRODOCUMENTO,
      p.TIPODOCUMENTO,
      p.IDCAJA,
      p.PREFIJO
    FROM TBLPAGOS p
    WHERE p.IDCONTRATO = ?
    ORDER BY p.FECHA DESC, p.NORECIBO DESC`,
    tables: ["TBLPAGOS"],
    parameterCount: 1,
    purpose: "FUNCTIONAL",
  },
  getContractStatus: {
    name: "getContractStatus",
    sql: "SELECT c.IDCONTRATO, c.ESTADO, c.DESDE, c.HASTA, c.PAGOHASTA, c.SALDO FROM TBLCONTRATO c WHERE c.IDCONTRATO = ?",
    tables: ["TBLCONTRATO"],
    parameterCount: 1,
    purpose: "FUNCTIONAL",
  },
} as const satisfies Partial<Record<MasterQueryName, FirebirdQueryDefinition>>;

export const BLOCKED_MASTER_QUERIES = {
  getOutstandingInstallments: {
    name: "getOutstandingInstallments",
    readiness: "BLOCKED_WITH_EVIDENCE",
    reason:
      "TBLCUOTASCONTRATO expone SALDO, ESTADO, ACUERDO y FECHAVENCE, pero no existe una regla aprobada que determine cuáles combinaciones representan una obligación pendiente",
    tables: ["TBLCUOTASCONTRATO"],
  },
  getPaymentReceipt: {
    name: "getPaymentReceipt",
    readiness: "BLOCKED_WITH_EVIDENCE",
    reason:
      "solo está confirmada la relación TBLPAGOSDETALLE.NORECIBO = TBLPAGOS.NORECIBO; no existe un catálogo aprobado de columnas del detalle para construir líneas de recibo",
    tables: ["TBLPAGOS", "TBLPAGOSDETALLE"],
  },
  getContractBeneficiaries: {
    name: "getContractBeneficiaries",
    readiness: "BLOCKED_WITH_EVIDENCE",
    reason:
      "TBLPERSONA confirma IDASOCIADO y NROCONTRATO, pero no se ha aprobado cómo RETIRADO, FECHARETIRO, TIPO y PARENTESCO determinan pertenencia y vigencia contractual",
    tables: ["TBLPERSONA", "TBLCONTRATO"],
  },
} as const satisfies Partial<Record<MasterQueryName, BlockedFirebirdQueryDefinition>>;

export const MASTER_QUERY_CATALOG: Readonly<Partial<Record<MasterQueryName, FirebirdQueryDefinition>>> = READY_QUERIES;

const FORBIDDEN_SQL = /\b(?:INSERT|UPDATE|DELETE|MERGE|ALTER|CREATE|DROP|TRUNCATE|EXECUTE|GRANT|REVOKE|P_PAGOSPISCOPAY|TBLPAYCONFIGURACION)\b/i;
const TABLE_REFERENCE = /\b(?:FROM|JOIN)\s+([A-Z0-9_$]+)/gi;

export function normalizeSqlForInspection(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\r\n]*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function assertReadOnlyQuery(definition: FirebirdQueryDefinition): void {
  const normalized = normalizeSqlForInspection(definition.sql);
  if (!/^SELECT\b/i.test(normalized) || FORBIDDEN_SQL.test(normalized) || normalized.includes(";")) {
    throw new Error(`Unsafe master query catalog entry: ${definition.name}`);
  }

  const referencedTables = [...normalized.matchAll(TABLE_REFERENCE)].map((match) => match[1]?.toUpperCase());
  const declared = new Set(definition.tables);
  for (const table of definition.tables) {
    if (table === "RDB$DATABASE") {
      const authorizedTechnicalQuery = definition.name === "health" || definition.name === "currentUser";
      if (!authorizedTechnicalQuery || definition.purpose === "FUNCTIONAL") {
        throw new Error("RDB$DATABASE is authorized only for master technical checks");
      }
    } else if (!MASTER_FUNCTIONAL_TABLES.includes(table)) {
      throw new Error(`Unapproved declared table in master query catalog entry: ${definition.name}`);
    }
  }
  for (const table of referencedTables) {
    if (!table || !declared.has(table as MasterFunctionalTable | "RDB$DATABASE")) {
      throw new Error(`Undeclared table in master query catalog entry: ${definition.name}`);
    }
    if (table === "RDB$DATABASE") {
      const authorizedTechnicalQuery = definition.name === "health" || definition.name === "currentUser";
      if (!authorizedTechnicalQuery || definition.purpose === "FUNCTIONAL") {
        throw new Error("RDB$DATABASE is authorized only for master technical checks");
      }
    }
    if (table !== "RDB$DATABASE" && !MASTER_FUNCTIONAL_TABLES.includes(table as MasterFunctionalTable)) {
      throw new Error(`Unapproved table in master query catalog entry: ${definition.name}`);
    }
  }
}

for (const definition of Object.values(MASTER_QUERY_CATALOG)) {
  if (definition) assertReadOnlyQuery(definition);
}

export function requireReadyQuery(name: MasterQueryName): FirebirdQueryDefinition {
  const definition = MASTER_QUERY_CATALOG[name];
  if (definition) return definition;
  const blocked = BLOCKED_MASTER_QUERIES[name as keyof typeof BLOCKED_MASTER_QUERIES];
  throw new MasterQueryNotReadyError(name, blocked?.reason ?? "no existe una consulta aprobada");
}
