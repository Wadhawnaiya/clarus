/** UX hints for model providers (placeholders, featured cloud keys). */

/** Cloud API providers we surface first — alternatives to local Ollama. */
export const FEATURED_CLOUD_API_PROVIDERS = ["openrouter", "nvidia"] as const;

export type FeaturedCloudApiProvider = (typeof FEATURED_CLOUD_API_PROVIDERS)[number];

export function isFeaturedCloudApiProvider(provider: string): provider is FeaturedCloudApiProvider {
  return (FEATURED_CLOUD_API_PROVIDERS as readonly string[]).includes(provider);
}

/** Password-field placeholder for paste-API-key flows. */
export function apiKeyPlaceholder(provider: string): string {
  switch (provider) {
    case "openrouter":
      return "Paste OpenRouter key (sk-or-…)";
    case "nvidia":
      return "Paste NVIDIA NIM key (nvapi-…)";
    case "anthropic":
      return "Paste Anthropic key (sk-ant-…)";
    case "openai":
      return "Paste OpenAI key (sk-…)";
    case "google":
      return "Paste Gemini key";
    case "groq":
      return "Paste Groq key (gsk-…)";
    default:
      return "Paste API key";
  }
}

/** Short badge label for featured cloud rows. */
export function featuredCloudBadge(provider: string): string | undefined {
  switch (provider) {
    case "openrouter":
      return "Cloud · many models";
    case "nvidia":
      return "Cloud · NIM";
    default:
      return undefined;
  }
}
