import { describe, it, expect } from "vitest";
import {
  resolveConfig,
  DEFAULT_MODEL,
  MISTRAL_API_ENDPOINT,
  CODESTRAL_API_ENDPOINT,
} from "../src/config.js";

describe("Config Resolution", () => {
  it("throws an error if no API key is defined", () => {
    expect(() => resolveConfig({})).toThrowError(/No valid API key found/);
  });

  it("resolves MISTRAL_API_KEY with standard api.mistral.ai endpoint", () => {
    const config = resolveConfig({
      MISTRAL_API_KEY: "test-mistral-key",
    });

    expect(config.apiKey).toBe("test-mistral-key");
    expect(config.serverURL).toBe(MISTRAL_API_ENDPOINT);
    expect(config.model).toBe(DEFAULT_MODEL);
  });

  it("resolves CODESTRAL_API_KEY with codestral.mistral.ai endpoint when only codestral key is set", () => {
    const config = resolveConfig({
      CODESTRAL_API_KEY: "test-codestral-key",
    });

    expect(config.apiKey).toBe("test-codestral-key");
    expect(config.serverURL).toBe(CODESTRAL_API_ENDPOINT);
    expect(config.model).toBe(DEFAULT_MODEL);
  });

  it("allows overriding endpoint with MISTRAL_BASE_URL", () => {
    const config = resolveConfig({
      MISTRAL_API_KEY: "key",
      MISTRAL_BASE_URL: "https://custom.mistral.local/v1",
    });

    expect(config.serverURL).toBe("https://custom.mistral.local/v1");
  });

  it("allows overriding model with MISTRAL_MODEL", () => {
    const config = resolveConfig({
      MISTRAL_API_KEY: "key",
      MISTRAL_MODEL: "codestral-2501",
    });

    expect(config.model).toBe("codestral-2501");
  });
});
