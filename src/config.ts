import { Mistral } from "@mistralai/mistralai";
import dotenv from "dotenv";

// Cargar variables de entorno desde .env si existe
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
 * Resuelve la configuración de autenticación y endpoint para el CLI.
 * Detecta MISTRAL_API_KEY y CODESTRAL_API_KEY automáticamente,
 * permitiendo overrides con MISTRAL_BASE_URL y MISTRAL_MODEL.
 */
export function resolveConfig(env: NodeJS.ProcessEnv = process.env): MistralCliConfig {
  const mistralKey = env.MISTRAL_API_KEY?.trim();
  const codestralKey = env.CODESTRAL_API_KEY?.trim();
  const customBaseUrl = env.MISTRAL_BASE_URL?.trim();
  const customModel = env.MISTRAL_MODEL?.trim();

  if (!mistralKey && !codestralKey) {
    throw new Error(
      "No se encontró ninguna API key válida. Por favor define MISTRAL_API_KEY o CODESTRAL_API_KEY en tu entorno o en un archivo .env."
    );
  }

  let apiKey: string;
  let serverURL: string;

  if (mistralKey) {
    apiKey = mistralKey;
    serverURL = customBaseUrl || MISTRAL_API_ENDPOINT;
  } else {
    // Caso codestralKey exclusivamente
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

/**
 * Inicializa el cliente oficial de Mistral con la configuración resuelta.
 */
export function createMistralClient(config?: MistralCliConfig): Mistral {
  const resolved = config ?? resolveConfig();
  return new Mistral({
    apiKey: resolved.apiKey,
    serverURL: resolved.serverURL,
  });
}
