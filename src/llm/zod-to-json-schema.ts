// src/llm/zod-to-json-schema.ts
/**
 * Convertisseur Zod → JSON Schema pour OpenRouter structured outputs
 * Pas un truc ultra-complexe, juste ce qu'il faut pour nos besoins! 🎯
 */

import { z } from "zod";

/**
 * Convertit un Zod schema en JSON Schema (OpenRouter format)
 * Gère les types de base: object, string, number, boolean, array, enum, record, optional
 */
export function zodToJsonSchema(zodSchema: z.ZodType, name: string = "response"): {
  type: "json_schema";
  jsonSchema: {  // camelCase pour le SDK officiel OpenRouter!
    name: string;
    strict: boolean;
    schema: any;
  };
} {
  const jsonSchema = convertZodType(zodSchema);

  return {
    type: "json_schema",
    jsonSchema: {  // camelCase!
      name,
      strict: true, // Always strict mode for type safety!
      schema: jsonSchema,
    },
  };
}

/**
 * Convertit récursivement un type Zod en JSON Schema
 */
function convertZodType(zodType: z.ZodType): any {
  const def = (zodType as any)._def;
  const typeName = def.typeName;

  // Handle optional/nullable wrappers
  if (typeName === "ZodOptional") {
    const innerSchema = convertZodType(def.innerType);
    // Don't add to required array (handled by parent object)
    return innerSchema;
  }

  if (typeName === "ZodNullable") {
    const innerSchema = convertZodType(def.innerType);
    return {
      ...innerSchema,
      nullable: true,
    };
  }

  // Handle primitive types
  switch (typeName) {
    case "ZodString":
      const stringSchema: any = { type: "string" };
      if (def.description) stringSchema.description = def.description;
      // Handle min/max length if present
      if (def.checks) {
        for (const check of def.checks) {
          if (check.kind === "min") stringSchema.minLength = check.value;
          if (check.kind === "max") stringSchema.maxLength = check.value;
        }
      }
      return stringSchema;

    case "ZodNumber":
      const numberSchema: any = { type: "number" };
      if (def.description) numberSchema.description = def.description;
      return numberSchema;

    case "ZodBoolean":
      const boolSchema: any = { type: "boolean" };
      if (def.description) boolSchema.description = def.description;
      return boolSchema;

    case "ZodEnum":
      return {
        type: "string",
        enum: def.values,
        description: def.description,
      };

    case "ZodArray":
      return {
        type: "array",
        items: convertZodType(def.type),
        description: def.description,
      };

    case "ZodObject":
      const shape = def.shape();
      const properties: any = {};
      const required: string[] = [];

      for (const [key, value] of Object.entries(shape)) {
        properties[key] = convertZodType(value as z.ZodType);
        
        // Check if field is required (not optional)
        const fieldDef = (value as any)._def;
        if (fieldDef.typeName !== "ZodOptional") {
          required.push(key);
        }
      }

      const objectSchema: any = {
        type: "object",
        properties,
        additionalProperties: false, // Strict mode!
      };

      if (required.length > 0) {
        objectSchema.required = required;
      }

      if (def.description) {
        objectSchema.description = def.description;
      }

      return objectSchema;

    case "ZodRecord":
      // Record<string, any> → additionalProperties pattern
      return {
        type: "object",
        additionalProperties: convertZodType(def.valueType),
        description: def.description,
      };

    case "ZodAny":
      // For z.any(), allow any type
      return {
        description: def.description || "Any value",
      };

    case "ZodUnion":
      // Handle union types (e.g., z.string().or(z.number()))
      return {
        anyOf: def.options.map((opt: z.ZodType) => convertZodType(opt)),
        description: def.description,
      };

    default:
      console.warn(`[Zod→JSON] Unsupported Zod type: ${typeName}, falling back to any`);
      return {
        description: def.description || "Unsupported type, falling back to any",
      };
  }
}

/**
 * Helper pour extraire la description d'un Zod schema
 */
export function getSchemaDescription(zodSchema: z.ZodType): string | undefined {
  return (zodSchema as any)._def?.description;
}

