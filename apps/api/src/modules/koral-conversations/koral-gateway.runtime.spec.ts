import { KoralGatewayRuntime } from "./koral-gateway.runtime";

describe("KoralGatewayRuntime", () => {
  const ai = { infer: jest.fn().mockResolvedValue({ kind: "ASSISTANT_RESPONSE" }) };
  const tools = { invoke: jest.fn().mockResolvedValue({ kind: "SUCCEEDED" }) };
  const knowledge = { search: jest.fn().mockResolvedValue({ kind: "FOUND" }) };
  const runtime = new KoralGatewayRuntime(ai as never, tools as never, knowledge as never);
  const context = { deadlineAt: new Date(Date.now() + 10_000).toISOString() } as never;

  beforeEach(() => jest.clearAllMocks());

  it("uses only canonical Koral gateway adapters and preserves the context", async () => {
    await runtime.infer({ agentProfileKey: "support", messages: [] }, context);
    await runtime.invokeTool({ toolName: "crm.read", input: {}, idempotencyKey: "key-1" } as never, context);
    await runtime.searchKnowledge({ query: "policy" } as never, context);
    expect(ai.infer).toHaveBeenCalledWith(expect.anything(), context);
    expect(tools.invoke).toHaveBeenCalledWith(expect.anything(), context);
    expect(knowledge.search).toHaveBeenCalledWith(expect.anything(), context);
  });

  it("fails closed before invoking a gateway after the deadline", async () => {
    expect(() => runtime.infer({ agentProfileKey: "support", messages: [] }, { deadlineAt: new Date(Date.now() - 1).toISOString() } as never))
      .toThrow("DEADLINE_EXCEEDED");
    expect(ai.infer).not.toHaveBeenCalled();
  });
});
