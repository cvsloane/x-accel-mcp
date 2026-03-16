import { z } from "zod";

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function withDescription(schema, jsonSchema) {
  return typeof jsonSchema.description === "string" && jsonSchema.description.length > 0
    ? schema.describe(jsonSchema.description)
    : schema;
}

function buildEnumSchema(values) {
  if (values.length === 0) {
    return z.never();
  }

  if (values.every((value) => typeof value === "string")) {
    return z.enum(values);
  }

  if (values.length === 1) {
    return z.literal(values[0]);
  }

  return z.union(values.map((value) => z.literal(value)));
}

function withNumberConstraints(schema, jsonSchema) {
  let next = schema;

  if (typeof jsonSchema.minimum === "number") {
    next = next.min(jsonSchema.minimum);
  }
  if (typeof jsonSchema.maximum === "number") {
    next = next.max(jsonSchema.maximum);
  }
  if (typeof jsonSchema.exclusiveMinimum === "number") {
    next = next.gt(jsonSchema.exclusiveMinimum);
  }
  if (typeof jsonSchema.exclusiveMaximum === "number") {
    next = next.lt(jsonSchema.exclusiveMaximum);
  }

  return next;
}

function withStringConstraints(schema, jsonSchema) {
  let next = schema;

  if (typeof jsonSchema.minLength === "number") {
    next = next.min(jsonSchema.minLength);
  }
  if (typeof jsonSchema.maxLength === "number") {
    next = next.max(jsonSchema.maxLength);
  }
  if (typeof jsonSchema.pattern === "string") {
    try {
      next = next.regex(new RegExp(jsonSchema.pattern));
    } catch {
      // Ignore invalid patterns from remote manifests instead of crashing startup.
    }
  }

  return next;
}

function withArrayConstraints(schema, jsonSchema) {
  let next = schema;

  if (typeof jsonSchema.minItems === "number") {
    next = next.min(jsonSchema.minItems);
  }
  if (typeof jsonSchema.maxItems === "number") {
    next = next.max(jsonSchema.maxItems);
  }

  return next;
}

function buildObjectSchema(jsonSchema) {
  const properties = isPlainObject(jsonSchema.properties) ? jsonSchema.properties : {};
  const required = new Set(Array.isArray(jsonSchema.required) ? jsonSchema.required : []);
  const shape = {};

  for (const [key, propertySchema] of Object.entries(properties)) {
    const childSchema = jsonSchemaToZod(propertySchema);
    shape[key] = required.has(key) ? childSchema : childSchema.optional();
  }

  let schema = z.object(shape);

  if (jsonSchema.additionalProperties === false) {
    schema = schema.strict();
  } else if (isPlainObject(jsonSchema.additionalProperties)) {
    schema = schema.catchall(jsonSchemaToZod(jsonSchema.additionalProperties));
  } else {
    schema = schema.passthrough();
  }

  return schema;
}

function buildUnionSchema(keyword, jsonSchema) {
  const variants = Array.isArray(jsonSchema[keyword]) ? jsonSchema[keyword] : [];
  if (variants.length === 0) {
    return z.unknown();
  }

  if (variants.length === 1) {
    return jsonSchemaToZod(variants[0]);
  }

  return z.union(variants.map((variant) => jsonSchemaToZod(variant)));
}

function buildTypeSchema(jsonSchema) {
  if (!isPlainObject(jsonSchema)) {
    return z.unknown();
  }

  if (Array.isArray(jsonSchema.type)) {
    const nonNullTypes = jsonSchema.type.filter((type) => type !== "null");
    const includesNull = nonNullTypes.length !== jsonSchema.type.length;

    if (nonNullTypes.length === 0) {
      return z.null();
    }

    const baseSchema =
      nonNullTypes.length === 1
        ? buildTypeSchema({ ...jsonSchema, type: nonNullTypes[0] })
        : z.union(nonNullTypes.map((type) => buildTypeSchema({ ...jsonSchema, type })));

    return includesNull ? baseSchema.nullable() : baseSchema;
  }

  if (jsonSchema.const !== undefined) {
    return z.literal(jsonSchema.const);
  }

  if (Array.isArray(jsonSchema.enum)) {
    return buildEnumSchema(jsonSchema.enum);
  }

  if (Array.isArray(jsonSchema.oneOf)) {
    return buildUnionSchema("oneOf", jsonSchema);
  }

  if (Array.isArray(jsonSchema.anyOf)) {
    return buildUnionSchema("anyOf", jsonSchema);
  }

  switch (jsonSchema.type) {
    case "object":
      return buildObjectSchema(jsonSchema);
    case "array":
      return withArrayConstraints(
        z.array(jsonSchemaToZod(jsonSchema.items ?? {})),
        jsonSchema
      );
    case "string":
      return withStringConstraints(z.string(), jsonSchema);
    case "integer":
      return withNumberConstraints(z.number().int(), jsonSchema);
    case "number":
      return withNumberConstraints(z.number(), jsonSchema);
    case "boolean":
      return z.boolean();
    case "null":
      return z.null();
    default:
      return z.unknown();
  }
}

export function jsonSchemaToZod(jsonSchema = {}) {
  let schema = buildTypeSchema(jsonSchema);

  if (jsonSchema && typeof jsonSchema === "object" && jsonSchema.nullable === true) {
    schema = schema.nullable();
  }

  return withDescription(schema, jsonSchema);
}
