import { JsonSchemaValidator } from "./json-schema-validator";

describe("JsonSchemaValidator", () => {
  const validator = new JsonSchemaValidator();
  const schema = {
    type: "object",
    required: ["answer", "references"],
    additionalProperties: false,
    properties: {
      answer: { type: "string", minLength: 1 },
      references: {
        type: "array",
        maxItems: 3,
        items: { type: "string" },
      },
    },
  } as const;

  it("accepts values that satisfy the bounded schema", () => {
    expect(() =>
      validator.assertMatches(schema, {
        answer: "ok",
        references: ["ref-1"],
      }),
    ).not.toThrow();
  });

  it("rejects invalid types, missing fields and undeclared fields", () => {
    expect(() =>
      validator.assertMatches(schema, { answer: 42, references: [] }),
    ).toThrow("OUTPUT_SCHEMA_VIOLATION");
    expect(() => validator.assertMatches(schema, { answer: "ok" })).toThrow(
      "OUTPUT_SCHEMA_VIOLATION",
    );
    expect(() =>
      validator.assertMatches(schema, {
        answer: "ok",
        references: [],
        injected: true,
      }),
    ).toThrow("OUTPUT_SCHEMA_VIOLATION");
  });

  it("fails closed on unsupported schema keywords", () => {
    expect(() =>
      validator.assertSupported({ type: "object", $ref: "#/$defs/value" }),
    ).toThrow("INVALID_REQUEST:UNSUPPORTED_SCHEMA_KEYWORD:$ref");
  });
});
