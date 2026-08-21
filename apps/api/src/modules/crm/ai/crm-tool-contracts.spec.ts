import { CRM_TOOL_CONTRACTS } from "./crm-tool-contracts";

describe("governed CRM AI tool contracts", () => {
  it("declares the complete approved tool set with authz and structured bounded schemas", () => {
    expect(Object.keys(CRM_TOOL_CONTRACTS).sort()).toEqual([
      "complete_activity", "create_activity", "create_followup", "create_lead", "get_company", "get_lead", "get_opportunity", "get_partner", "list_opportunities", "search_leads", "update_lead", "update_opportunity_stage",
    ].sort());
    for (const contract of Object.values(CRM_TOOL_CONTRACTS)) {
      expect(contract.permission).toMatch(/^(crm\.(read|manage)|companies\.read|partners\.manage)$/);
      expect(contract.serviceMethod).toMatch(/Service\./);
      expect(contract.inputSchema).toMatchObject({ type: "object", additionalProperties: false });
      expect(contract.outputSchema).toMatchObject({ type: "object", required: ["data", "meta"] });
      expect(JSON.stringify(contract)).not.toMatch(/sql|secret|password/i);
      if (contract.mutation) expect(contract.idempotency).toBe("required");
    }
  });
});
