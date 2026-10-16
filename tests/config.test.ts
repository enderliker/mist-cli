import { describe, it, expect } from "vitest";
import {
  resolveConfig,
  DEFAULT_MODEL,
  MISTRAL_API_ENDPOINT,
  CODESTRAL_API_ENDPOINT,
} from "../src/config.js";

describe("Config Resolution", () => {
  it("lanza un error si no hay ninguna API key definida", () => {
    expect(() => resolveConfig({})).toThrowError(/No se encontró ninguna API key válida/);
  });

  it("resuelve MISTRAL_API_KEY con endpoint estándar de api.mistral.ai", () => {
    const config = resolveConfig({
      MISTRAL_API_KEY: "test-mistral-key",
    });

    expect(config.apiKey).toBe("test-mistral-key");
    expect(config.serverURL).toBe(MISTRAL_API_ENDPOINT);
    expect(config.model).toBe(DEFAULT_MODEL);
  });

  it("resuelve CODESTRAL_API_KEY con endpoint de codestral.mistral.ai si solo existe CODESTRAL_API_KEY", () => {
    const config = resolveConfig({
      CODESTRAL_API_KEY: "test-codestral-key",
    });

    expect(config.apiKey).toBe("test-codestral-key");
    expect(config.serverURL).toBe(CODESTRAL_API_ENDPOINT);
    expect(config.model).toBe(DEFAULT_MODEL);
  });

  it("permite sobrescribir el endpoint con MISTRAL_BASE_URL", () => {
    const config = resolveConfig({
      MISTRAL_API_KEY: "key",
      MISTRAL_BASE_URL: "https://custom.mistral.local/v1",
    });

    expect(config.serverURL).toBe("https://custom.mistral.local/v1");
  });

  it("permite sobrescribir el modelo con MISTRAL_MODEL", () => {
    const config = resolveConfig({
      MISTRAL_API_KEY: "key",
      MISTRAL_MODEL: "codestral-2501",
    });

    expect(config.model).toBe("codestral-2501");
  });
});
