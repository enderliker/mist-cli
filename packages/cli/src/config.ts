import { Mistral } from "@mistralai/mistralai";
import dotenv from "dotenv";

dotenv.config();

export interface MistralCliConfig {
  apiKey: string;
  serverURL: string;
  model: string;
}

export const DEFAULT_MODEL = "codestral-latest";
export const MISTRAL_API_ENDPOINT = "https://api.mistral.ai";
export const CODESTRAL_API_ENDPOINT = "https://codestral.mistral.ai";

/**
 * Resolves authentication and API endpoint configuration.
 * Auto-detects MISTRAL_API_KEY and CODESTRAL_API_KEY,
 * while allowing overrides via MISTRAL_BASE_URL and MISTRAL_MODEL.
 */
export function resolveConfig(env: NodeJS.ProcessEnv = process.env): MistralCliConfig {
  const mistralKey = env.MISTRAL_API_KEY?.trim();
  const codestralKey = env.CODESTRAL_API_KEY?.trim();
  const customBaseUrl = env.MISTRAL_BASE_URL?.trim();
  const customModel = env.MISTRAL_MODEL?.trim();

  if (!mistralKey && !codestralKey) {
    throw new Error(
      "No valid API key found. Please define MISTRAL_API_KEY or CODESTRAL_API_KEY in your environment or in a .env file."
    );
  }

  let apiKey: string;
  let serverURL: string;

  if (mistralKey) {
    apiKey = mistralKey;
    serverURL = customBaseUrl || MISTRAL_API_ENDPOINT;
  } else {
    apiKey = codestralKey!;
    serverURL = customBaseUrl || CODESTRAL_API_ENDPOINT;
  }

  const model = customModel || DEFAULT_MODEL;

  return {
    apiKey,
    serverURL,
    model,
  };
}

export function createMistralClient(config?: MistralCliConfig): Mistral {
  const resolved = config ?? resolveConfig();
  return new Mistral({
    apiKey: resolved.apiKey,
    serverURL: resolved.serverURL,
  });
}
