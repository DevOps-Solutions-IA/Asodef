import { BINGO_OPENAPI_V1_OPERATIONS } from "./openapi-contract";

describe("Bingo OpenAPI operation manifest", () => {
  it("has unique operation IDs and routes with explicit security surfaces", () => {
    expect(new Set(BINGO_OPENAPI_V1_OPERATIONS.map(({ operationId }) => operationId)).size).toBe(BINGO_OPENAPI_V1_OPERATIONS.length);
    for (const operation of BINGO_OPENAPI_V1_OPERATIONS) {
      expect(operation.path).toMatch(/^\/(admin\/bingo|self-service\/affiliate\/bingo|public\/bingo)/);
      expect(operation.responseContract).not.toBe("never");
      if (operation.surface === "PUBLIC") expect(operation.security).toBe("NONE");
      else expect(operation.security).not.toBe("NONE");
    }
  });
});
