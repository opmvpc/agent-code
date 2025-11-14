import { z } from "zod";
import { zodToJsonSchema } from "./zod-to-json-schema.js";

/**
 * Schema Zod pour la génération de code
 * L'AI doit retourner: { filename: "...", content: "..." }
 */
export const CodeGenerationSchema = z.object({
  filename: z.string().describe("Nom du fichier (avec extension)"),
  content: z.string().min(1).describe("Contenu complet du fichier (code source)"),
});

export type CodeGeneration = z.infer<typeof CodeGenerationSchema>;

/**
 * Parse et valide la réponse de génération de code
 */
export function parseCodeGeneration(rawResponse: string): {
  success: true;
  data: CodeGeneration;
} | {
  success: false;
  error: string;
  zodErrors?: string;
} {
  try {
    // 1. Nettoyer markdown code blocks si présents
    let cleaned = rawResponse.trim();
    const codeBlockMatch = cleaned.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
    if (codeBlockMatch) {
      cleaned = codeBlockMatch[1];
    }

    // 2. Parser JSON
    const parsed = JSON.parse(cleaned);

    // 3. Valider avec Zod
    const result = CodeGenerationSchema.safeParse(parsed);

    if (!result.success) {
      const zodErrors = result.error.errors
        .map(err => `  - ${err.path.join('.')}: ${err.message}`)
        .join('\n');

      return {
        success: false,
        error: "Code generation validation failed",
        zodErrors,
      };
    }

    return {
      success: true,
      data: result.data,
    };
  } catch (error) {
    return {
      success: false,
      error: `JSON parse error: ${(error as Error).message}`,
    };
  }
}

/**
 * Get JSON Schema for structured outputs (OpenRouter format)
 */
export function getCodeGenerationJsonSchema(): {
  type: "json_schema";
  jsonSchema: {  // camelCase pour le SDK officiel!
    name: string;
    strict: boolean;
    schema: any;
  };
} {
  return zodToJsonSchema(CodeGenerationSchema, "code_generation");
}
