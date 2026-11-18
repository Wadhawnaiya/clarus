// Custom OpenAI-compatible providers — the app-managed slice of pi's models.json.
//
// Each user-added endpoint is stored as providers.custom-<slug> in
// ~/Clarus/models.json (api: "openai-completions") with its real API key in
// ~/Clarus/auth.json — the same files the pi agent child re-reads at startup.
// pi's ModelRegistry resolves auth.json before the models.json apiKey, so the
// placeholder below is never used to authenticate. Pure Node (fs + fetch): no
// electron imports, so vitest can test this module directly.

import { existsSync, readFileSync, writeFileSync } from "node:fs";

export const CUSTOM_PROVIDER_PREFIX = "custom-";
/** Placeholder written to models.json; the real key lives in auth.json. */
export const MANAGED_API_KEY_PLACEHOLDER = "managed-by-clarus";

export interface CustomProviderInfo {
  id: string;
  name: string;
  baseUrl: string;
  models: string[];
}

type ProviderEntry = {
  name?: string;
  baseUrl?: string;
  api?: string;
  apiKey?: string;
  models?: Array<{ id?: string; name?: string }>;
};
type ModelsJson = { providers?: Record<string, ProviderEntry> };

/** Parse models.json. Missing file → fresh config; corrupt file → error (we
 *  refuse to overwrite rather than destroy hand-authored providers). */
function readModelsFile(modelsPath: string): { config: ModelsJson; error?: string } {
  if (!existsSync(modelsPath)) return { config: {} };
  try {
    return { config: JSON.parse(readFileSync(modelsPath, "utf8")) as ModelsJson };
  } catch {
    return { config: {}, error: "models.json is not valid JSON; refusing to overwrite" };
  }
}

/** A `custom-<slug>` id for the display name, unique among the `taken` provider ids. */
export function customProviderSlug(name: string, taken: ReadonlySet<string>): string {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "api";
  let slug = base;
  let n = 2;
  while (taken.has(CUSTOM_PROVIDER_PREFIX + slug)) slug = `${base}-${n++}`;
  return slug;
}

/** The app-managed custom providers parsed from models.json (absent/corrupt file → []). */
export function readCustomProviders(modelsPath: string): CustomProviderInfo[] {
  const { config, error } = readModelsFile(modelsPath);
  if (error || !config.providers) return [];
  return Object.entries(config.providers)
    .filter(([id]) => id.startsWith(CUSTOM_PROVIDER_PREFIX))
    .map(([id, entry]) => ({
      id,
      name: entry.name ?? id,
      baseUrl: entry.baseUrl ?? "",
      models: (entry.models ?? []).map((m) => m.id ?? "").filter((mid) => mid.length > 0),
    }));
}

export type CustomUpsertInput = { id?: string; name: string; baseUrl: string; key?: string; modelIds: string[] };
export type CustomResult = { type: "done"; id: string } | { type: "error"; message: string };

/** I/O seams for auth.json, injected so this module stays pure. */
export interface CustomProviderDeps {
  storeKey?: (id: string, key: string) => void;
  deleteKey?: (id: string) => void;
}

const writeModelsFile = (modelsPath: string, config: ModelsJson) =>
  writeFileSync(modelsPath, `${JSON.stringify(config, null, 2)}\n`);

/** Add a custom provider, or update an existing one (id given). On edit, an
 *  omitted key keeps the stored one; a given key replaces it. */
export function upsertCustomProvider(
  input: CustomUpsertInput,
  paths: { modelsPath: string },
  deps: CustomProviderDeps = {},
): CustomResult {
  const name = input.name.trim();
  const baseUrl = input.baseUrl.trim().replace(/\/+$/, "");
  const modelIds = [...new Set(input.modelIds.map((m) => m.trim()).filter((m) => m.length > 0))];
  if (!name) return { type: "error", message: "Name is required" };
  if (!/^https?:\/\//i.test(baseUrl)) return { type: "error", message: "Base URL must start with http:// or https://" };
  if (modelIds.length === 0) return { type: "error", message: "At least one model is required" };

  const { config, error } = readModelsFile(paths.modelsPath);
  if (error) return { type: "error", message: error };

  let id = input.id?.trim();
  if (id) {
    if (!id.startsWith(CUSTOM_PROVIDER_PREFIX) || !config.providers?.[id]) {
      return { type: "error", message: `Unknown custom provider: ${id}` };
    }
  } else {
    id = CUSTOM_PROVIDER_PREFIX + customProviderSlug(name, new Set(Object.keys(config.providers ?? {})));
  }

  config.providers ??= {};
  config.providers[id] = {
    name,
    baseUrl,
    apiKey: MANAGED_API_KEY_PLACEHOLDER,
    api: "openai-completions",
    models: modelIds.map((mid) => ({ id: mid, name: mid })),
  };
  writeModelsFile(paths.modelsPath, config);

  const key = input.key?.trim();
  if (key) deps.storeKey?.(id, key);
  return { type: "done", id };
}

/** Delete a custom provider's models.json entry and its stored key. */
export function removeCustomProvider(
  id: string,
  paths: { modelsPath: string },
  deps: CustomProviderDeps = {},
): CustomResult {
  if (!id.startsWith(CUSTOM_PROVIDER_PREFIX)) return { type: "error", message: `Not a custom provider: ${id}` };
  const { config, error } = readModelsFile(paths.modelsPath);
  if (error) return { type: "error", message: error };
  if (!config.providers?.[id]) return { type: "done", id };
  delete config.providers[id];
  writeModelsFile(paths.modelsPath, config);
  deps.deleteKey?.(id);
  return { type: "done", id };
}

export type CustomTestResult = { ok: true; modelIds: string[] } | { ok: false; error: string };

/** GET {baseUrl}/models with Bearer auth — backs both "Test connection" and
 *  "Fetch models" (one request, two UI actions). */
export async function fetchCustomModels(baseUrl: string, key: string, timeoutMs = 15000): Promise<CustomTestResult> {
  const url = `${baseUrl.trim().replace(/\/+$/, "")}/models`;
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) {
      const hint = res.status === 401 || res.status === 403 ? " — check your API key" : "";
      return { ok: false, error: `HTTP ${res.status}${hint}` };
    }
    const data = (await res.json()) as { data?: Array<{ id?: string }> };
    const modelIds = (data.data ?? [])
      .map((m) => (typeof m?.id === "string" ? m.id.trim() : ""))
      .filter((id) => id.length > 0);
    if (modelIds.length === 0) return { ok: false, error: "Endpoint responded but returned no models" };
    return { ok: true, modelIds };
  } catch (e) {
    if (e instanceof Error && e.name === "TimeoutError") return { ok: false, error: "Request timed out" };
    if (e instanceof SyntaxError) return { ok: false, error: "Endpoint returned an invalid response" };
    return { ok: false, error: `Could not reach URL: ${e instanceof Error ? e.message : String(e)}` };
  }
}
