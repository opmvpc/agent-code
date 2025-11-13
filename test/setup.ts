// test/setup.ts
/**
 * Setup global pour les tests
 * Charge les variables d'environnement de test
 */

import { config } from "dotenv";
import { resolve } from "path";

// Load .env.test
config({ path: resolve(process.cwd(), ".env.test") });

// Fallback to .env if .env.test not found
if (!process.env.OPENROUTER_API_KEY) {
  config({ path: resolve(process.cwd(), ".env") });
}

// Validate required env vars
if (!process.env.OPENROUTER_API_KEY) {
  console.warn(
    "⚠️  OPENROUTER_API_KEY not found in .env.test or .env - tests may fail!"
  );
}

// Force silence OpenAI logs during tests
process.env.OPENAI_LOG = "silent";
