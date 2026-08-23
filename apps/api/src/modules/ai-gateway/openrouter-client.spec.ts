import { Logger } from "@nestjs/common";
import {
  OpenRouterClient,
  OpenRouterTransportError,
  type OpenRouterFetch,
} from "./openrouter-client";

const credential = "unit-test-credential-never-real";
const baseRequest = {
  model: "approved/model-v1",
  messages: [{ role: "user" as const, content: "bounded test input" }],
  maxOutputTokens: 100,
  tools: [],
  correlationId: "correlation-test",
  timeoutMs: 5_000,
};

function successResponse(overrides: Record<string, unknown> = {}) {
  return new Response(
    JSON.stringify({
      id: "generation-1",
      choices: [
        {
          message: {
            role: "assistant",
            content: JSON.stringify({ answer: "ok" }),
          },
        },
      ],
      usage: {
        prompt_tokens: 10,
        completion_tokens: 2,
        total_tokens: 12,
        cost: 0.0001,
      },
      ...overrides,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

function buildClient(fetcher: OpenRouterFetch) {
  return new OpenRouterClient(
    { resolve: () => credential },
    {
      baseUrl: "https://openrouter.ai/api/v1",
      timeoutMs: 5_000,
      circuitFailureThreshold: 3,
      circuitResetMs: 30_000,
    },
    fetcher,
  );
}

describe("OpenRouterClient", () => {
  afterEach(() => jest.restoreAllMocks());

  it("sends one approved model with strict structured output and parses usage", async () => {
    let capturedUrl = "";
    let capturedInit: RequestInit | undefined;
    const client = buildClient(async (url, init) => {
      capturedUrl = String(url);
      capturedInit = init;
      return successResponse();
    });

    await expect(
      client.complete({
        ...baseRequest,
        outputSchema: {
          type: "object",
          properties: { answer: { type: "string" } },
          required: ["answer"],
          additionalProperties: false,
        },
      }),
    ).resolves.toMatchObject({
      content: '{"answer":"ok"}',
      structuredOutput: { answer: "ok" },
      costReportedByProvider: true,
      usage: {
        inputTokens: 10,
        outputTokens: 2,
        totalTokens: 12,
        costMicros: 100,
      },
    });

    expect(capturedUrl).toBe("https://openrouter.ai/api/v1/chat/completions");
    const headers = capturedInit?.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${credential}`);
    const body = JSON.parse(String(capturedInit?.body)) as Record<
      string,
      unknown
    >;
    expect(body.model).toBe(baseRequest.model);
    expect(body).not.toHaveProperty("models");
    expect(body).not.toHaveProperty("route");
    expect(body.provider).toEqual({
      allow_fallbacks: false,
      require_parameters: true,
    });
    expect(body.response_format).toMatchObject({
      type: "json_schema",
      json_schema: { strict: true },
    });
  });

  it.each([
    [429, "RATE_LIMITED"],
    [500, "PROVIDER_ERROR"],
    [503, "PROVIDER_ERROR"],
  ] as const)("maps HTTP %s to %s", async (status, code) => {
    const client = buildClient(
      async () => new Response('{"error":"provider detail"}', { status }),
    );
    await expect(client.complete(baseRequest)).rejects.toMatchObject({ code });
  });

  it("maps an aborted request to a bounded timeout error", async () => {
    const fetcher: OpenRouterFetch = async (_url, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("aborted", "AbortError"));
        });
      });
    const client = buildClient(fetcher);
    await expect(
      client.complete({ ...baseRequest, timeoutMs: 1 }),
    ).rejects.toMatchObject({ code: "TIMEOUT" });
  });

  it("rejects malformed success bodies and malformed tool arguments", async () => {
    const malformed = buildClient(
      async () => new Response('{"unexpected":true}', { status: 200 }),
    );
    await expect(malformed.complete(baseRequest)).rejects.toMatchObject({
      code: "PROVIDER_ERROR",
    });

    const invalidTool = buildClient(async () =>
      successResponse({
        choices: [
          {
            message: {
              role: "assistant",
              content: null,
              tool_calls: [
                {
                  id: "call-1",
                  function: { name: "get_lead", arguments: "not-json" },
                },
              ],
            },
          },
        ],
      }),
    );
    await expect(invalidTool.complete(baseRequest)).rejects.toMatchObject({
      code: "PROVIDER_ERROR",
    });
  });

  it("never includes the credential or provider body in errors or logs", async () => {
    const warn = jest.spyOn(Logger.prototype, "warn").mockImplementation();
    const client = buildClient(
      async () =>
        new Response(
          JSON.stringify({ error: `provider echoed ${credential}` }),
          { status: 500 },
        ),
    );
    let caught: unknown;
    try {
      await client.complete(baseRequest);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(OpenRouterTransportError);
    expect(String(caught)).not.toContain(credential);
    expect(JSON.stringify(warn.mock.calls)).not.toContain(credential);
  });

  it("rejects every non-HTTPS endpoint before resolving a credential", () => {
    let resolutions = 0;
    expect(
      () =>
        new OpenRouterClient(
          { resolve: () => (resolutions++, credential) },
          {
            baseUrl: "http://openrouter.ai/api/v1",
            timeoutMs: 5_000,
            circuitFailureThreshold: 3,
            circuitResetMs: 30_000,
          },
          async () => successResponse(),
        ),
    ).toThrow("OPENROUTER_HTTPS_REQUIRED");
    expect(resolutions).toBe(0);
  });
});
