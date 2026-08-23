import type { JsonSchema } from "./ai-contracts";

const MAX_SCHEMA_DEPTH = 20;
const MAX_SCHEMA_NODES = 1_000;
const SUPPORTED_KEYWORDS = new Set([
  "$schema",
  "$id",
  "title",
  "description",
  "type",
  "const",
  "enum",
  "properties",
  "required",
  "additionalProperties",
  "items",
  "minItems",
  "maxItems",
  "minLength",
  "maxLength",
  "minimum",
  "maximum",
  "allOf",
  "anyOf",
  "oneOf",
]);

type SchemaObject = Readonly<Record<string, unknown>>;

/** A deliberately bounded JSON Schema subset used at both sides of the
 * provider boundary. Unsupported constructs fail closed instead of being
 * silently ignored. This keeps structured output validation independent of
 * provider promises and avoids executing generated code. */
export class JsonSchemaValidator {
  assertSupported(schema: JsonSchema): void {
    const state = { nodes: 0 };
    this.inspectSchema(schema, 0, state);
  }

  assertMatches(schema: JsonSchema, value: unknown): void {
    this.assertSupported(schema);
    if (!this.matches(schema, value, 0)) {
      throw new Error("OUTPUT_SCHEMA_VIOLATION");
    }
  }

  private inspectSchema(
    schema: SchemaObject,
    depth: number,
    state: { nodes: number },
  ): void {
    state.nodes += 1;
    if (depth > MAX_SCHEMA_DEPTH || state.nodes > MAX_SCHEMA_NODES) {
      throw new Error("INVALID_REQUEST:OUTPUT_SCHEMA_TOO_COMPLEX");
    }
    for (const keyword of Object.keys(schema)) {
      if (!SUPPORTED_KEYWORDS.has(keyword)) {
        throw new Error(
          `INVALID_REQUEST:UNSUPPORTED_SCHEMA_KEYWORD:${keyword}`,
        );
      }
    }
    if (schema.type !== undefined && !isSupportedType(schema.type)) {
      throw new Error("INVALID_REQUEST:UNSUPPORTED_SCHEMA_TYPE");
    }
    if (
      schema.required !== undefined &&
      (!Array.isArray(schema.required) ||
        !schema.required.every((item) => typeof item === "string"))
    ) {
      throw new Error("INVALID_REQUEST:INVALID_SCHEMA_REQUIRED");
    }
    if (
      schema.additionalProperties !== undefined &&
      typeof schema.additionalProperties !== "boolean"
    ) {
      throw new Error("INVALID_REQUEST:INVALID_ADDITIONAL_PROPERTIES");
    }
    if (schema.properties !== undefined) {
      if (!isObject(schema.properties)) {
        throw new Error("INVALID_REQUEST:INVALID_SCHEMA_PROPERTIES");
      }
      for (const child of Object.values(schema.properties)) {
        if (!isObject(child)) {
          throw new Error("INVALID_REQUEST:INVALID_SCHEMA_PROPERTY");
        }
        this.inspectSchema(child, depth + 1, state);
      }
    }
    if (schema.items !== undefined) {
      if (!isObject(schema.items)) {
        throw new Error("INVALID_REQUEST:INVALID_SCHEMA_ITEMS");
      }
      this.inspectSchema(schema.items, depth + 1, state);
    }
    for (const combinator of ["allOf", "anyOf", "oneOf"] as const) {
      const children = schema[combinator];
      if (children === undefined) continue;
      if (!Array.isArray(children) || children.length === 0) {
        throw new Error(
          `INVALID_REQUEST:INVALID_SCHEMA_${combinator.toUpperCase()}`,
        );
      }
      for (const child of children) {
        if (!isObject(child)) {
          throw new Error(
            `INVALID_REQUEST:INVALID_SCHEMA_${combinator.toUpperCase()}`,
          );
        }
        this.inspectSchema(child, depth + 1, state);
      }
    }
  }

  private matches(
    schema: SchemaObject,
    value: unknown,
    depth: number,
  ): boolean {
    if (depth > MAX_SCHEMA_DEPTH) return false;
    if (schema.const !== undefined && !deepEqual(schema.const, value))
      return false;
    if (
      Array.isArray(schema.enum) &&
      !schema.enum.some((item) => deepEqual(item, value))
    )
      return false;

    const allOf = schema.allOf;
    if (
      Array.isArray(allOf) &&
      !allOf.every((child) =>
        this.matches(child as SchemaObject, value, depth + 1),
      )
    )
      return false;
    const anyOf = schema.anyOf;
    if (
      Array.isArray(anyOf) &&
      !anyOf.some((child) =>
        this.matches(child as SchemaObject, value, depth + 1),
      )
    )
      return false;
    const oneOf = schema.oneOf;
    if (
      Array.isArray(oneOf) &&
      oneOf.filter((child) =>
        this.matches(child as SchemaObject, value, depth + 1),
      ).length !== 1
    )
      return false;

    if (schema.type === "null") return value === null;
    if (schema.type === "boolean") return typeof value === "boolean";
    if (schema.type === "number" || schema.type === "integer") {
      if (typeof value !== "number" || !Number.isFinite(value)) return false;
      if (schema.type === "integer" && !Number.isInteger(value)) return false;
      if (typeof schema.minimum === "number" && value < schema.minimum)
        return false;
      if (typeof schema.maximum === "number" && value > schema.maximum)
        return false;
      return true;
    }
    if (schema.type === "string") {
      if (typeof value !== "string") return false;
      if (
        typeof schema.minLength === "number" &&
        value.length < schema.minLength
      )
        return false;
      if (
        typeof schema.maxLength === "number" &&
        value.length > schema.maxLength
      )
        return false;
      return true;
    }
    if (schema.type === "array") {
      if (!Array.isArray(value)) return false;
      if (typeof schema.minItems === "number" && value.length < schema.minItems)
        return false;
      if (typeof schema.maxItems === "number" && value.length > schema.maxItems)
        return false;
      if (
        isObject(schema.items) &&
        !value.every((item) =>
          this.matches(schema.items as SchemaObject, item, depth + 1),
        )
      )
        return false;
      return true;
    }
    if (schema.type === "object") {
      if (!isObject(value)) return false;
      const required = Array.isArray(schema.required)
        ? (schema.required as string[])
        : [];
      if (
        required.some(
          (key) => !Object.prototype.hasOwnProperty.call(value, key),
        )
      )
        return false;
      const properties = isObject(schema.properties) ? schema.properties : {};
      for (const [key, child] of Object.entries(properties)) {
        if (
          Object.prototype.hasOwnProperty.call(value, key) &&
          !this.matches(child as SchemaObject, value[key], depth + 1)
        )
          return false;
      }
      if (schema.additionalProperties === false) {
        const allowed = new Set(Object.keys(properties));
        if (Object.keys(value).some((key) => !allowed.has(key))) return false;
      }
      return true;
    }
    return true;
  }
}

function isSupportedType(value: unknown): boolean {
  return [
    "object",
    "array",
    "string",
    "number",
    "integer",
    "boolean",
    "null",
  ].includes(String(value));
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function deepEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) && Array.isArray(right)) {
    return (
      left.length === right.length &&
      left.every((item, index) => deepEqual(item, right[index]))
    );
  }
  if (isObject(left) && isObject(right)) {
    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);
    return (
      leftKeys.length === rightKeys.length &&
      leftKeys.every(
        (key) =>
          Object.prototype.hasOwnProperty.call(right, key) &&
          deepEqual(left[key], right[key]),
      )
    );
  }
  return false;
}
