import {
  assertReadOnlyQuery,
  BLOCKED_MASTER_QUERIES,
  MASTER_FUNCTIONAL_TABLES,
  MASTER_QUERY_CATALOG,
  normalizeSqlForInspection,
  requireReadyQuery,
  type FirebirdQueryDefinition,
} from "./firebird-query.catalog";

const FORBIDDEN = [
  "INSERT",
  "UPDATE",
  "DELETE",
  "MERGE",
  "ALTER",
  "CREATE",
  "DROP",
  "TRUNCATE",
  "EXECUTE",
  "GRANT",
  "REVOKE",
  "P_PAGOSPISCOPAY",
  "TBLPAYCONFIGURACION",
];

describe("Firebird read-only query catalog", () => {
  it("contains only normalized SELECT statements and none of the prohibited operations", () => {
    for (const definition of Object.values(MASTER_QUERY_CATALOG)) {
      if (!definition) continue;
      const normalized = normalizeSqlForInspection(definition.sql);
      expect(normalized).toMatch(/^SELECT\b/i);
      expect(normalized).not.toContain(";");
      for (const forbidden of FORBIDDEN) expect(normalized).not.toMatch(new RegExp(`\\b${forbidden}\\b`, "i"));
      expect(() => assertReadOnlyQuery(definition)).not.toThrow();
    }
  });

  it("allows only approved tables and reserves RDB$DATABASE for technical checks", () => {
    for (const definition of Object.values(MASTER_QUERY_CATALOG)) {
      if (!definition) continue;
      for (const table of definition.tables) {
        if (table === "RDB$DATABASE") {
          expect(["health", "currentUser"]).toContain(definition.name);
          expect(["HEALTH", "SECURITY_GATE"]).toContain(definition.purpose);
        } else {
          expect(MASTER_FUNCTIONAL_TABLES).toContain(table);
        }
      }
    }
  });

  it("rejects comments hiding a non-SELECT operation", () => {
    const unsafe = {
      name: "health",
      sql: "/* harmless */ UPDATE TBLCONTRATO SET ESTADO = ?",
      tables: ["TBLCONTRATO"],
      parameterCount: 1,
      purpose: "FUNCTIONAL",
    } satisfies FirebirdQueryDefinition;

    expect(() => assertReadOnlyQuery(unsafe)).toThrow(/Unsafe master query/);
  });

  it("keeps unconfirmed operations blocked instead of inventing SQL", () => {
    expect(BLOCKED_MASTER_QUERIES.findPersonByDocument).toMatchObject({
      readiness: "BLOCKED_WITH_EVIDENCE",
      tables: ["TBLPERSONA", "TBLTIPOIDENTIFICACION"],
    });
    expect(BLOCKED_MASTER_QUERIES.getOutstandingInstallments).toMatchObject({
      readiness: "BLOCKED_WITH_EVIDENCE",
      tables: ["TBLCUOTASCONTRATO"],
    });
    expect(BLOCKED_MASTER_QUERIES.getPaymentReceipt).toMatchObject({
      readiness: "BLOCKED_WITH_EVIDENCE",
      tables: ["TBLPAGOS", "TBLPAGOSDETALLE"],
    });
    expect(BLOCKED_MASTER_QUERIES.getContractBeneficiaries).toMatchObject({
      readiness: "BLOCKED_WITH_EVIDENCE",
      tables: ["TBLPERSONA", "TBLCONTRATO"],
    });

    expect(() => requireReadyQuery("findPersonByDocument")).toThrow(/número de documento/);
    expect(() => requireReadyQuery("getOutstandingInstallments")).toThrow(/obligación pendiente/);
    expect(() => requireReadyQuery("getPaymentReceipt")).toThrow(/catálogo aprobado/);
    expect(() => requireReadyQuery("getContractBeneficiaries")).toThrow(/pertenencia y vigencia/);
  });
});
