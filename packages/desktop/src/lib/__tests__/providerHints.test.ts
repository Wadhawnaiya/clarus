import { describe, expect, it } from "vitest";
import {
  apiKeyPlaceholder,
  FEATURED_CLOUD_API_PROVIDERS,
  featuredCloudBadge,
  isFeaturedCloudApiProvider,
} from "../providerHints";

describe("FEATURED_CLOUD_API_PROVIDERS", () => {
  it("should feature OpenRouter and NVIDIA as cloud API alternatives to Ollama", () => {
    expect(FEATURED_CLOUD_API_PROVIDERS).toEqual(["openrouter", "nvidia"]);
  });
});

describe("isFeaturedCloudApiProvider()", () => {
  it("should return true for openrouter and nvidia", () => {
    expect(isFeaturedCloudApiProvider("openrouter")).toBe(true);
    expect(isFeaturedCloudApiProvider("nvidia")).toBe(true);
  });

  it("should return false for ollama and unknown ids", () => {
    expect(isFeaturedCloudApiProvider("ollama")).toBe(false);
    expect(isFeaturedCloudApiProvider("anthropic")).toBe(false);
  });
});

describe("apiKeyPlaceholder()", () => {
  it("should use OpenRouter sk-or placeholder", () => {
    expect(apiKeyPlaceholder("openrouter")).toContain("sk-or");
  });

  it("should use NVIDIA nvapi placeholder", () => {
    expect(apiKeyPlaceholder("nvidia")).toContain("nvapi");
  });

  it("should fall back to a generic paste prompt for unknown providers", () => {
    expect(apiKeyPlaceholder("custom-llm")).toBe("Paste API key");
  });
});

describe("featuredCloudBadge()", () => {
  it("should label openrouter and nvidia for the Available list", () => {
    expect(featuredCloudBadge("openrouter")).toMatch(/Cloud/i);
    expect(featuredCloudBadge("nvidia")).toMatch(/NIM/i);
  });

  it("should return undefined for non-featured providers", () => {
    expect(featuredCloudBadge("openai")).toBeUndefined();
  });
});
