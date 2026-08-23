import { Logger } from "@nestjs/common";
import type {
  OpenRouterTransport,
  OpenRouterTransportRequest,
  OpenRouterTransportResponse,
} from "./openrouter-provider";

const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

export interface OpenRouterCredentialSource {
  resolve(): string;
}

export interface OpenRouterClientConfig {
  baseUrl: string;
  timeoutMs: number;
  circuitFailureThreshold: number;
  circuitResetMs: number;
}

export type OpenRouterFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

/** Real HTTP transport. It owns the credential and never includes provider
 * payloads, response bodies, prompts or headers in errors/logs. Routing and
 * fallback remain in OpenRouterProvider, so OpenRouter receives one approved
 * model per request and its universal router is never used. */
export class OpenRouterClient implements OpenRouterTransport {
  private readonly logger = new Logger(OpenRouterClient.name);
  private readonly endpoint: string;
  private readonly circuit: OpenRouterCircuitBreaker;

  constructor(
    private readonly credentialSource: OpenRouterCredentialSource,
    private readonly config: OpenRouterClientConfig,
    private readonly fetcher: OpenRouterFetch = globalThis.fetch,
    now: () => number = Date.now,
  ) {
    const baseUrl = new URL(config.baseUrl);
    if (baseUrl.protocol !== "https:") {
      throw new Error("OPENROUTER_HTTPS_REQUIRED");
    }
    this.endpoint = `${baseUrl.toString().replace(/\/$/, "")}/chat/completions`;
    this.circuit = new OpenRouterCircuitBreaker(
      config.circuitFailureThreshold,
      config.circuitResetMs,
      now,
    );
  }

  async complete(
    request: OpenRouterTransportRequest,
  ): Promise<OpenRouterTransportResponse> {
    this.circuit.beforeRequest();
    const startedAt = Date.now();
    const controller = new AbortController();
    const timeoutMs = Math.max(
      1,
      Math.min(request.timeoutMs, this.config.timeoutMs),
    );
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const apiKey = this.credentialSource.resolve();
      if (!apiKey) throw new OpenRouterTransportError("PROVIDER_ERROR");
      const response = await this.fetcher(this.endpoint, {
        method: "POST",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "X-Title": "ASODEF Connect",
        },
        body: JSON.stringify(toOpenRouterRequest(request)),
      });
      const text = await response.text();
      if (Buffer.byteLength(text, "utf8") > MAX_RESPONSE_BYTES) {
        throw new OpenRouterTransportError("PROVIDER_ERROR", response.status);
      }
      if (!response.ok) {
        throw new OpenRouterTransportError(
          mapHttpStatus(response.status),
          response.status,
        );
      }
      const parsed = parseJson(text);
      const result = parseOpenRouterResponse(parsed, Date.now() - startedAt);
      this.circuit.recordSuccess();
      return result;
    } catch (error) {
      const mapped = mapTransportError(error);
      if (mapped.retryable) this.circuit.recordFailure();
      else this.circuit.recordIgnored();
      this.logger.warn(
        `openrouter_request_failed code=${mapped.code} status=${mapped.status ?? "none"} correlationId=${request.correlationId}`,
      );
      throw mapped;
    } finally {
      clearTimeout(timer);
    }
  }
}

export class OpenRouterTransportError extends Error {
  readonly retryable: boolean;

  constructor(
    readonly code:
      | "AUTHORIZATION_DENIED"
      | "MODEL_NOT_AVAILABLE"
      | "OUTPUT_SCHEMA_VIOLATION"
      | "PROVIDER_ERROR"
      | "RATE_LIMITED"
      | "TIMEOUT",
    readonly status?: number,
  ) {
    super(code);
    this.name = "OpenRouterTransportError";
    this.retryable = [
      "MODEL_NOT_AVAILABLE",
      "PROVIDER_ERROR",
      "RATE_LIMITED",
      "TIMEOUT",
    ].includes(code);
  }
}

function toOpenRouterRequest(request: OpenRouterTransportRequest) {
  return {
    model: request.model,
    messages: request.messages,
    max_tokens: request.maxOutputTokens,
    stream: false,
    provider: {
      allow_fallbacks: false,
      require_parameters: true,
    },
    ...(request.outputSchema
      ? {
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "asodef_structured_response",
              strict: true,
              schema: request.outputSchema,
            },
          },
        }
      : {}),
    ...(request.tools.length > 0
      ? {
          tools: request.tools.map((tool) => ({
            type: "function",
            function: {
              name: tool.name,
              description: tool.description,
              parameters: tool.inputSchema,
            },
          })),
          tool_choice: "auto",
          parallel_tool_calls: false,
        }
      : {}),
  };
}

function parseOpenRouterResponse(
  value: unknown,
  latencyMs: number,
): OpenRouterTransportResponse {
  if (
    !isObject(value) ||
    !Array.isArray(value.choices) ||
    value.choices.length !== 1
  ) {
    throw new OpenRouterTransportError("PROVIDER_ERROR");
  }
  const choice = value.choices[0];
  if (!isObject(choice) || !isObject(choice.message)) {
    throw new OpenRouterTransportError("PROVIDER_ERROR");
  }
  const message = choice.message;
  const content = message.content;
  if (content !== null && typeof content !== "string") {
    throw new OpenRouterTransportError("PROVIDER_ERROR");
  }
  const toolCalls = parseToolCalls(message.tool_calls);
  if (!isObject(value.usage)) {
    throw new OpenRouterTransportError("PROVIDER_ERROR");
  }
  const inputTokens = finiteNonNegativeInteger(value.usage.prompt_tokens);
  const outputTokens = finiteNonNegativeInteger(value.usage.completion_tokens);
  const totalTokens = finiteNonNegativeInteger(value.usage.total_tokens);
  if (
    inputTokens === null ||
    outputTokens === null ||
    totalTokens === null ||
    totalTokens < inputTokens + outputTokens
  ) {
    throw new OpenRouterTransportError("PROVIDER_ERROR");
  }
  const reportedCostMicros = costMicros(value.usage.cost);
  const text = content ?? "";
  let structuredOutput: unknown;
  if (text) {
    try {
      structuredOutput = JSON.parse(text);
    } catch {
      structuredOutput = undefined;
    }
  }
  return {
    content: text,
    structuredOutput,
    toolCalls,
    usage: {
      inputTokens,
      outputTokens,
      totalTokens,
      costMicros: reportedCostMicros,
    },
    costReportedByProvider: reportedCostMicros !== null,
    latencyMs,
  };
}

function parseToolCalls(value: unknown) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value))
    throw new OpenRouterTransportError("PROVIDER_ERROR");
  return value.map((item) => {
    if (
      !isObject(item) ||
      typeof item.id !== "string" ||
      !isObject(item.function) ||
      typeof item.function.name !== "string" ||
      typeof item.function.arguments !== "string"
    ) {
      throw new OpenRouterTransportError("PROVIDER_ERROR");
    }
    const parsedArguments = parseJson(item.function.arguments);
    if (!isObject(parsedArguments)) {
      throw new OpenRouterTransportError("PROVIDER_ERROR");
    }
    return {
      id: item.id,
      name: item.function.name,
      arguments: parsedArguments,
    };
  });
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw new OpenRouterTransportError("PROVIDER_ERROR");
  }
}

function finiteNonNegativeInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : null;
}

function costMicros(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return null;
  }
  return Math.round(value * 1_000_000);
}

function mapHttpStatus(status: number): OpenRouterTransportError["code"] {
  if (status === 401 || status === 403) return "AUTHORIZATION_DENIED";
  if (status === 404) return "MODEL_NOT_AVAILABLE";
  if (status === 408 || status === 504) return "TIMEOUT";
  if (status === 429) return "RATE_LIMITED";
  return "PROVIDER_ERROR";
}

function mapTransportError(error: unknown): OpenRouterTransportError {
  if (error instanceof OpenRouterTransportError) return error;
  if (isAbortError(error)) return new OpenRouterTransportError("TIMEOUT");
  return new OpenRouterTransportError("PROVIDER_ERROR");
}

function isAbortError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === "AbortError"
  );
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

class OpenRouterCircuitBreaker {
  private state: CircuitState = "CLOSED";
  private consecutiveFailures = 0;
  private openedAt = 0;
  private halfOpenProbeActive = false;

  constructor(
    private readonly failureThreshold: number,
    private readonly resetMs: number,
    private readonly now: () => number,
  ) {}

  beforeRequest(): void {
    if (this.state === "OPEN") {
      if (this.now() - this.openedAt < this.resetMs) {
        throw new OpenRouterTransportError("PROVIDER_ERROR");
      }
      this.state = "HALF_OPEN";
    }
    if (this.state === "HALF_OPEN") {
      if (this.halfOpenProbeActive) {
        throw new OpenRouterTransportError("PROVIDER_ERROR");
      }
      this.halfOpenProbeActive = true;
    }
  }

  recordSuccess(): void {
    this.state = "CLOSED";
    this.consecutiveFailures = 0;
    this.halfOpenProbeActive = false;
  }

  recordFailure(): void {
    this.halfOpenProbeActive = false;
    this.consecutiveFailures += 1;
    if (
      this.state === "HALF_OPEN" ||
      this.consecutiveFailures >= this.failureThreshold
    ) {
      this.state = "OPEN";
      this.openedAt = this.now();
    }
  }

  recordIgnored(): void {
    this.halfOpenProbeActive = false;
    if (this.state === "HALF_OPEN") {
      this.state = "CLOSED";
      this.consecutiveFailures = 0;
    }
  }
}
