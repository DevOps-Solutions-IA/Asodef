import { CRM_TOOL_CONTRACTS } from "./crm-tool-contracts";

describe("governed CRM AI tool contracts", () => {
  it("reuses the complete approved tool set with versioned governance metadata", () => {
    expect(Object.keys(CRM_TOOL_CONTRACTS).sort()).toEqual(
      [
        "complete_activity",
        "create_activity",
        "create_followup",
        "create_lead",
        "get_company",
        "get_lead",
        "get_opportunity",
        "get_partner",
        "list_opportunities",
        "search_leads",
        "update_lead",
        "update_opportunity_stage",
      ].sort(),
    );
    for (const contract of Object.values(CRM_TOOL_CONTRACTS)) {
      expect(contract.version).toBe("v1");
      expect(contract.permission).toMatch(/^(crm\.(read|manage)|companies\.read|partners\.manage)$/);
      expect(contract.execution).toEqual(
        expect.objectContaining({ applicationServiceMethod: expect.stringMatching(/Service\./), directDataAccess: false }),
      );
      expect(contract.inputSchema).toMatchObject({ type: "object", additionalProperties: false });
      expect(contract.outputSchema).toMatchObject({ type: "object", required: ["data", "meta"] });
      expect(contract.errors.length).toBeGreaterThan(0);
      expect(contract.audit).toEqual(expect.objectContaining({ recordActor: true, recordResult: true }));
      expect(JSON.stringify(contract)).not.toMatch(/sql|prisma|secret|password/i);
      if (contract.idempotency.required) expect(contract.inputSchema).toHaveProperty("properties.idempotencyKey");
    }
    expect(CRM_TOOL_CONTRACTS.get_lead.status).toBe("REVIEW");
    expect(CRM_TOOL_CONTRACTS.update_lead.status).toBe("REVIEW");
  });
});
