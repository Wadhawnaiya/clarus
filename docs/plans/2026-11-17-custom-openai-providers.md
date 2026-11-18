# Custom OpenAI-compatible API Providers — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users connect any OpenAI-compatible endpoint (LM Studio, vLLM, hosted gateways) via base URL + API key + model list, with the models appearing in the composer like every other provider.

**Architecture:** A new pure-Node module `customProviders.ts` in the Electron main process owns the app-managed slice of pi's `models.json` (entries under `custom-<slug>` provider ids) and writes real keys to `auth.json` via `AuthStorage` — the exact files the pi agent child re-reads on restart. New IPC channels (`custom_list/upsert/remove/test`) are wired in `pi.ts`, allowlisted in preload, wrapped by `customApi` in the renderer, and surfaced as a new "Custom API (OpenAI-compatible)" section in Settings → Providers with an add/edit dialog.

**Tech Stack:** TypeScript, Electron IPC, pi SDK (`AuthStorage`), React + shadcn/ui (Dialog, Input, Textarea, Button), Vitest.

**Spec:** `docs/specs/custom-openai-compatible-providers.md`

**Note on commits:** The repo has no git identity configured, so `git commit` fails. Steps include commit commands — skip them (or configure `git config` first) when identity is missing; never configure git config without the user's approval.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `packages/desktop/electron/main/customProviders.ts` (create) | Pure Node: slug gen, models.json read/upsert/remove, `GET {baseUrl}/models` fetch/test. No electron imports → vitest-testable. |
| `packages/desktop/electron/main/__tests__/customProviders.test.ts` (create) | Tests for the module above. |
| `packages/desktop/electron/main/pi.ts` (modify) | IPC handlers `custom_*`, wiring module to `paths()` + `AuthStorage`. |
| `packages/desktop/electron/preload/index.ts` (modify) | Allowlist the 4 new channels. |
| `packages/desktop/src/rpc/types.ts` (modify) | `CustomProviderInfo`, `CustomUpsertInput`, `CustomTestResult`. |
| `packages/desktop/src/rpc/api.ts` (modify) | `customApi` client. |
| `packages/desktop/src/lib/modelListText.ts` (create) | `parseModelIds()` — textarea → deduped model ids. |
| `packages/desktop/src/lib/__tests__/modelListText.test.ts` (create) | Tests for `parseModelIds`. |
| `packages/desktop/src/components/clarus/settings/custom-provider-dialog.tsx` (create) | Add/edit dialog: name, URL, key, models (fetch + manual), test connection. |
| `packages/desktop/src/components/clarus/settings/providers-settings.tsx` (modify) | New section: rows with Edit/Remove + "Add provider" button, restart chain on save/remove. |

---

### Task 1: Slug generation + reading custom providers from models.json

**Files:**
- Create: `packages/desktop/electron/main/customProviders.ts`
- Test: `packages/desktop/electron/main/__tests__/customProviders.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// packages/desktop/electron/main/__tests__/customProviders.test.ts
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CUSTOM_PROVIDER_PREFIX, customProviderSlug, readCustomProviders } from "../customProviders";

describe("customProviderSlug()", () => {
  it("should slugify a display name to lowercase hyphenated form", () => {
    expect(customProviderSlug("Acme Gateway", new Set())).toBe("acme-gateway");
  });

  it("should collapse runs of non-alphanumerics into a single hyphen", () => {
    expect(customProviderSlug("My  API -- v2!", new Set())).toBe("my-api-v2");
  });

  it("should fall back to 'api' when the name has no alphanumerics", () => {
    expect(customProviderSlug("---", new Set())).toBe("api");
  });

  it("should add a numeric suffix when the slug is already taken", () => {
    const taken = new Set(["custom-acme", "custom-acme-2"]);
    expect(customProviderSlug("Acme", taken)).toBe("acme-3");
  });
});

describe("readCustomProviders()", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "clarus-custom-"));
  });
  afterEach(() => rmSync(dir, { force: true, recursive: true }));

  const write = (content: string) => {
    const modelsPath = join(dir, "models.json");
    if (content) writeFileSync(modelsPath, content);
    return modelsPath;
  };

  it("should return only entries whose id starts with the custom- prefix", () => {
    const modelsPath = write(
      JSON.stringify({
        providers: {
          ollama: { name: "Ollama", baseUrl: "http://localhost:11434/v1", models: [{ id: "llama3" }] },
          "custom-acme": {
            name: "Acme",
            baseUrl: "https://acme.example/v1",
            apiKey: "managed-by-clarus",
            api: "openai-completions",
            models: [{ id: "m1", name: "m1" }],
          },
        },
      }),
    );
    expect(readCustomProviders(modelsPath)).toEqual([
      { id: "custom-acme", name: "Acme", baseUrl: "https://acme.example/v1", models: ["m1"] },
    ]);
  });

  it("should return an empty list when models.json is missing or invalid JSON", () => {
    expect(readCustomProviders(join(dir, "missing.json"))).toEqual([]);
    expect(readCustomProviders(write("not json"))).toEqual([]);
  });

  it("should return an empty list when there are no custom entries", () => {
    const modelsPath = write(JSON.stringify({ providers: { ollama: { models: [{ id: "llama3" }] } } }));
    expect(readCustomProviders(modelsPath)).toEqual([]);
  });

  it("should drop models without ids and fall back to the entry id as name", () => {
    const modelsPath = write(
      JSON.stringify({
        providers: { "custom-x": { baseUrl: "https://x.example", models: [{ id: "" }, { id: "ok" }] } },
      }),
    );
    expect(readCustomProviders(modelsPath)).toEqual([
      { id: "custom-x", name: "custom-x", baseUrl: "https://x.example", models: ["ok"] },
    ]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/desktop/electron/main/__tests__/customProviders.test.ts`
Expected: FAIL — cannot resolve `../customProviders`.

- [ ] **Step 3: Write the minimal implementation**

```ts
// packages/desktop/electron/main/customProviders.ts
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
      models: (entry.models ?? [])
        .map((m) => m.id ?? "")
        .filter((mid) => mid.length > 0),
    }));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/desktop/electron/main/__tests__/customProviders.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit** `feat(desktop): custom provider slug + models.json reading`

---

### Task 2: Upsert + remove custom providers

**Files:**
- Modify: `packages/desktop/electron/main/customProviders.ts`
- Test: `packages/desktop/electron/main/__tests__/customProviders.test.ts`

- [ ] **Step 1: Write the failing tests** (append)

```ts
import { upsertCustomProvider, removeCustomProvider } from "../customProviders";

describe("upsertCustomProvider()", () => {
  let dir: string;
  let modelsPath: string;
  let storedKeys: Map<string, string>;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "clarus-custom-"));
    modelsPath = join(dir, "models.json");
    storedKeys = new Map();
  });
  afterEach(() => rmSync(dir, { force: true, recursive: true }));

  const deps = () => ({ storeKey: (id: string, key: string) => void storedKeys.set(id, key) });

  it("should create a provider entry and store its key on add", () => {
    const result = upsertCustomProvider(
      { name: "Acme Gateway", baseUrl: "https://acme.example/v1/", key: "sk-test", modelIds: ["m1", "m2"] },
      { modelsPath },
      deps(),
    );
    expect(result).toEqual({ type: "done", id: "custom-acme-gateway" });
    const config = JSON.parse(readFileSync(modelsPath, "utf8"));
    expect(config.providers["custom-acme-gateway"]).toEqual({
      name: "Acme Gateway",
      baseUrl: "https://acme.example/v1", // trailing slash trimmed
      apiKey: "managed-by-clarus",
      api: "openai-completions",
      models: [
        { id: "m1", name: "m1" },
        { id: "m2", name: "m2" },
      ],
    });
    expect(storedKeys.get("custom-acme-gateway")).toBe("sk-test");
  });

  it("should overwrite the entry on edit, keeping the id and stored key", () => {
    upsertCustomProvider({ name: "Acme", baseUrl: "https://a.example", key: "k1", modelIds: ["m1"] }, { modelsPath }, deps());
    const result = upsertCustomProvider(
      { id: "custom-acme", name: "Acme Renamed", baseUrl: "https://b.example", modelIds: ["m2"] },
      { modelsPath },
      deps(),
    );
    expect(result).toEqual({ type: "done", id: "custom-acme" });
    const config = JSON.parse(readFileSync(modelsPath, "utf8"));
    expect(config.providers["custom-acme"].name).toBe("Acme Renamed");
    expect(config.providers["custom-acme"].baseUrl).toBe("https://b.example");
    expect(storedKeys.get("custom-acme")).toBe("k1"); // no key given → untouched
  });

  it("should store a new key on edit when one is given", () => {
    upsertCustomProvider({ name: "Acme", baseUrl: "https://a.example", key: "k1", modelIds: ["m1"] }, { modelsPath }, deps());
    upsertCustomProvider({ id: "custom-acme", name: "Acme", baseUrl: "https://a.example", key: "k2", modelIds: ["m1"] }, { modelsPath }, deps());
    expect(storedKeys.get("custom-acme")).toBe("k2");
  });

  it("should give a second same-slug name a numeric suffix", () => {
    upsertCustomProvider({ name: "Acme", baseUrl: "https://a.example", key: "k1", modelIds: ["m1"] }, { modelsPath }, deps());
    const second = upsertCustomProvider({ name: "ACME!", baseUrl: "https://b.example", key: "k2", modelIds: ["m1"] }, { modelsPath }, deps());
    expect(second).toEqual({ type: "done", id: "custom-acme-2" });
  });

  it("should reject a blank name, a non-http(s) URL, and an empty model list", () => {
    expect(upsertCustomProvider({ name: "  ", baseUrl: "https://a.example", modelIds: ["m1"] }, { modelsPath }, deps()).type).toBe("error");
    expect(upsertCustomProvider({ name: "A", baseUrl: "ftp://a.example", modelIds: ["m1"] }, { modelsPath }, deps()).type).toBe("error");
    expect(upsertCustomProvider({ name: "A", baseUrl: "https://a.example", modelIds: [" ", ""] }, { modelsPath }, deps()).type).toBe("error");
  });

  it("should refuse to write when models.json is corrupt", () => {
    writeFileSync(modelsPath, "{ nope");
    const result = upsertCustomProvider({ name: "A", baseUrl: "https://a.example", modelIds: ["m1"] }, { modelsPath }, deps());
    expect(result.type).toBe("error");
    expect((result as { message?: string }).message).toContain("not valid JSON");
  });

  it("should reject an edit id that is missing or not an app-managed custom provider", () => {
    expect(upsertCustomProvider({ id: "ollama", name: "A", baseUrl: "https://a.example", modelIds: ["m1"] }, { modelsPath }, deps()).type).toBe("error");
    expect(upsertCustomProvider({ id: "custom-ghost", name: "A", baseUrl: "https://a.example", modelIds: ["m1"] }, { modelsPath }, deps()).type).toBe("error");
  });
});

describe("removeCustomProvider()", () => {
  let dir: string;
  let modelsPath: string;
  let deleted: string[];

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "clarus-custom-"));
    modelsPath = join(dir, "models.json");
    deleted = [];
  });
  afterEach(() => rmSync(dir, { force: true, recursive: true }));

  const deps = () => ({ deleteKey: (id: string) => void deleted.push(id) });

  it("should delete the models.json entry and the stored key", () => {
    upsertCustomProvider({ name: "Acme", baseUrl: "https://a.example", key: "k1", modelIds: ["m1"] }, { modelsPath }, {});
    const result = removeCustomProvider("custom-acme", { modelsPath }, deps());
    expect(result).toEqual({ type: "done", id: "custom-acme" });
    const config = JSON.parse(readFileSync(modelsPath, "utf8"));
    expect(config.providers["custom-acme"]).toBeUndefined();
    expect(deleted).toEqual(["custom-acme"]);
  });

  it("should succeed as a no-op when the entry does not exist", () => {
    expect(removeCustomProvider("custom-ghost", { modelsPath }, deps())).toEqual({ type: "done", id: "custom-ghost" });
    expect(deleted).toEqual([]);
  });

  it("should refuse to remove a non-custom provider", () => {
    expect(removeCustomProvider("ollama", { modelsPath }, deps()).type).toBe("error");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/desktop/electron/main/__tests__/customProviders.test.ts`
Expected: FAIL — `upsertCustomProvider` is not exported.

- [ ] **Step 3: Write the minimal implementation** (append to `customProviders.ts`)

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/desktop/electron/main/__tests__/customProviders.test.ts`
Expected: PASS (all).

- [ ] **Step 5: Commit** `feat(desktop): custom provider upsert/remove in models.json`

---

### Task 3: Fetch models / test connection against the endpoint

**Files:**
- Modify: `packages/desktop/electron/main/customProviders.ts`
- Test: `packages/desktop/electron/main/__tests__/customProviders.test.ts`

- [ ] **Step 1: Write the failing tests** (append; `vi` from vitest)

```ts
import { vi } from "vitest";
import { fetchCustomModels } from "../customProviders";

const okResponse = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

describe("fetchCustomModels()", () => {
  it("should return model ids from a standard OpenAI /models response", async () => {
    const fetchMock = vi.fn(async () => okResponse({ data: [{ id: "gpt-4o" }, { id: "llama-3.1-70b" }] }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await fetchCustomModels("https://api.example.com/v1/", "sk-test");
    expect(result).toEqual({ ok: true, modelIds: ["gpt-4o", "llama-3.1-70b"] });
  });

  it("should GET {baseUrl}/models with a Bearer header", async () => {
    const fetchMock = vi.fn(async () => okResponse({ data: [{ id: "m" }] }));
    vi.stubGlobal("fetch", fetchMock);
    await fetchCustomModels("https://api.example.com/v1", "sk-test");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.example.com/v1/models");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer sk-test");
  });

  it("should report 401/403 as authorization errors", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 401 })));
    expect(await fetchCustomModels("https://api.example.com/v1", "bad")).toEqual({
      ok: false,
      error: "HTTP 401 — check your API key",
    });
  });

  it("should report other non-200 statuses without the key hint", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 500 })));
    expect(await fetchCustomModels("https://api.example.com/v1", "k")).toEqual({
      ok: false,
      error: "HTTP 500",
    });
  });

  it("should reject an empty model list", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => okResponse({ data: [] })));
    expect(await fetchCustomModels("https://api.example.com/v1", "k")).toEqual({
      ok: false,
      error: "Endpoint responded but returned no models",
    });
  });

  it("should reject a malformed JSON response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("not json", { status: 200 })));
    const result = await fetchCustomModels("https://api.example.com/v1", "k");
    expect(result).toEqual({ ok: false, error: "Endpoint returned an invalid response" });
  });

  it("should report network failures with the underlying message", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("ECONNREFUSED"))));
    expect(await fetchCustomModels("https://api.example.com/v1", "k")).toEqual({
      ok: false,
      error: "Could not reach URL: ECONNREFUSED",
    });
  });

  it("should report timeouts as a timeout", async () => {
    const timeoutError = new Error("The operation was aborted due to timeout");
    timeoutError.name = "TimeoutError";
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(timeoutError)));
    expect(await fetchCustomModels("https://api.example.com/v1", "k")).toEqual({ ok: false, error: "Request timed out" });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/desktop/electron/main/__tests__/customProviders.test.ts`
Expected: FAIL — `fetchCustomModels` is not exported.

- [ ] **Step 3: Write the minimal implementation** (append)

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/desktop/electron/main/__tests__/customProviders.test.ts`
Expected: PASS (all).

- [ ] **Step 5: Commit** `feat(desktop): fetch/test custom endpoint /models`

---

### Task 4: IPC wiring (main + preload)

**Files:**
- Modify: `packages/desktop/electron/main/pi.ts` (import block + before `registerPiIpc` + inside it)
- Modify: `packages/desktop/electron/preload/index.ts` (INVOKE_CHANNELS)

- [ ] **Step 1: Add to `pi.ts` imports**

```ts
import {
  fetchCustomModels,
  readCustomProviders,
  removeCustomProvider,
  upsertCustomProvider,
  type CustomResult,
  type CustomUpsertInput,
} from "./customProviders";
```

- [ ] **Step 2: Add handler functions in `pi.ts`** (after `removeOllama()`)

```ts
// ---- custom OpenAI-compatible providers (app-managed models.json slice) ----

function customList() {
  return readCustomProviders(paths().modelsPath);
}

function customUpsert(input: CustomUpsertInput): CustomResult {
  const { modelsPath } = paths();
  const { authStorage } = createRegistry();
  return upsertCustomProvider(
    input,
    { modelsPath },
    {
      storeKey: (id, key) => {
        authStorage.set(id, { type: "api_key", key });
        trackProviderConnected(id, "api_key");
      },
      deleteKey: (id) => createRegistry().authStorage.logout(id),
    },
  );
}

function customRemove(id: string): CustomResult {
  return removeCustomProvider(id, { modelsPath: paths().modelsPath }, {
    deleteKey: (pid) => createRegistry().authStorage.logout(pid),
  });
}

/** "Test connection" / "Fetch models". When editing and the key field is left
 *  blank, fall back to the key already stored in auth.json. */
async function customTest(baseUrl: string, key: string | undefined, id: string | undefined) {
  const storedKey = !key?.trim() && id ? await createRegistry().authStorage.getApiKey(id, { includeFallback: false }) : undefined;
  return fetchCustomModels(baseUrl, key?.trim() || storedKey || "");
}
```

- [ ] **Step 3: Register channels in `registerPiIpc()`** (after the `auth_remove_ollama` line)

```ts
ipcMain.handle("custom_list", () => customList());
ipcMain.handle("custom_upsert", (_e, input: CustomUpsertInput) => customUpsert(input));
ipcMain.handle("custom_remove", (_e, { id }: { id: string }) => customRemove(id));
ipcMain.handle("custom_test", (_e, { baseUrl, key, id }: { baseUrl: string; key?: string; id?: string }) =>
  customTest(baseUrl, key, id),
);
```

- [ ] **Step 4: Allowlist in `preload/index.ts`** (after `"auth_remove_ollama"`)

```ts
  "custom_list",
  "custom_upsert",
  "custom_remove",
  "custom_test",
```

- [ ] **Step 5: Verify typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit** `feat(desktop): custom provider IPC channels`

---

### Task 5: Renderer types + `customApi` client

**Files:**
- Modify: `packages/desktop/src/rpc/types.ts`
- Modify: `packages/desktop/src/rpc/api.ts`

- [ ] **Step 1: Add types to `types.ts`** (after the `OllamaInfo` block)

```ts
// ---- Custom OpenAI-compatible providers (Settings → Providers) -----------

/** An app-managed custom provider parsed from models.json (id starts with "custom-"). */
export interface CustomProviderInfo {
  id: string;
  name: string;
  baseUrl: string;
  models: string[];
}

/** On add, `id` is omitted (derived from the name). On edit, `id` selects the
 *  entry and an omitted `key` keeps the stored one. */
export interface CustomUpsertInput {
  id?: string;
  name: string;
  baseUrl: string;
  key?: string;
  modelIds: string[];
}

export type CustomTestResult = { ok: true; modelIds: string[] } | { ok: false; error: string };
```

- [ ] **Step 2: Add `customApi` to `api.ts`** (import the new types; append after `authApi`)

```ts
export const customApi = {
  list: () => api.invoke<CustomProviderInfo[]>("custom_list"),
  upsert: (input: CustomUpsertInput) =>
    api.invoke<{ type: string; id?: string; message?: string }>("custom_upsert", input),
  remove: (id: string) => api.invoke<{ type: string; message?: string }>("custom_remove", { id }),
  /** "Test connection" + "Fetch models": GET {baseUrl}/models. When `id` is given
   *  and `key` is blank, main falls back to the stored key. */
  test: (baseUrl: string, key: string, id?: string) =>
    api.invoke<CustomTestResult>("custom_test", { baseUrl, key, id }),
};
```

- [ ] **Step 3: Verify typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit** `feat(desktop): customApi renderer client`

---

### Task 6: `parseModelIds` helper

**Files:**
- Create: `packages/desktop/src/lib/modelListText.ts`
- Test: `packages/desktop/src/lib/__tests__/modelListText.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { parseModelIds } from "../modelListText";

describe("parseModelIds()", () => {
  it("should split on newlines and commas", () => {
    expect(parseModelIds("gpt-4o\nllama-3.1, m2")).toEqual(["gpt-4o", "llama-3.1", "m2"]);
  });

  it("should trim whitespace and drop empty items", () => {
    expect(parseModelIds("  a ,\n\n , b \n")).toEqual(["a", "b"]);
  });

  it("should dedupe, case-sensitively", () => {
    expect(parseModelIds("m1, m1, M1")).toEqual(["m1", "M1"]);
  });

  it("should return an empty list for blank input", () => {
    expect(parseModelIds("")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run packages/desktop/src/lib/__tests__/modelListText.test.ts` → FAIL.

- [ ] **Step 3: Implement**

```ts
// packages/desktop/src/lib/modelListText.ts
/** Parse the manual model-list field (comma and/or newline separated) into a
 *  deduped list of model ids. */
export function parseModelIds(text: string): string[] {
  return [...new Set(text.split(/[\n,]/).map((s) => s.trim()).filter((s) => s.length > 0))];
}
```

- [ ] **Step 4: Run to verify pass** — expected PASS.

- [ ] **Step 5: Commit** `feat(desktop): parseModelIds helper`

---

### Task 7: `CustomProviderDialog` component

**Files:**
- Create: `packages/desktop/src/components/clarus/settings/custom-provider-dialog.tsx`

- [ ] **Step 1: Implement the dialog**

```tsx
// Add/edit dialog for a custom OpenAI-compatible provider. "Test connection"
// and "Fetch models" hit the same GET {baseUrl}/models probe (main falls back
// to the stored key when editing with a blank key field); saving goes through
// custom_upsert and the parent restarts the agent.

import { useEffect, useState } from "react";
import { Button } from "@/components/shadcn/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/shadcn/dialog";
import { Input } from "@/components/shadcn/input";
import { Textarea } from "@/components/shadcn/textarea";
import { parseModelIds } from "@/lib/modelListText";
import { customApi } from "@/rpc/api";
import type { CustomProviderInfo } from "@/rpc/types";
import { ErrorBanner } from "./parts";

export interface CustomProviderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Set when editing an existing provider; unset for "Add". */
  editing: CustomProviderInfo | null;
  onSaved: (id: string) => void | Promise<void>;
}

const URL_PATTERN = /^https?:\/\/\S+$/i;

export function CustomProviderDialog({ open, onOpenChange, editing, onSaved }: CustomProviderDialogProps) {
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [key, setKey] = useState("");
  const [modelsText, setModelsText] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Re-initialize the form each time the dialog opens.
  useEffect(() => {
    if (!open) return;
    setName(editing?.name ?? "");
    setBaseUrl(editing?.baseUrl ?? "");
    setKey("");
    setModelsText(editing?.models.join("\n") ?? "");
    setStatus(null);
    setError(null);
  }, [open, editing]);

  const models = parseModelIds(modelsText);
  const urlOk = URL_PATTERN.test(baseUrl.trim());
  const canSave = !busy && name.trim().length > 0 && urlOk && models.length > 0;
  // Add mode has no stored key to fall back on, so probing needs one typed.
  const canProbe = !busy && urlOk && (editing !== null || key.trim().length > 0);
  const keyPlaceholder = editing ? "Stored — leave blank to keep" : "sk-…";

  const probe = async (fillModels: boolean) => {
    setBusy(true);
    setStatus(null);
    setError(null);
    try {
      const result = await customApi.test(baseUrl.trim(), key.trim(), editing?.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setStatus(`Connected — ${result.modelIds.length} model${result.modelIds.length === 1 ? "" : "s"} found`);
      if (fillModels) setModelsText(result.modelIds.join("\n"));
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    if (!canSave) return;
    setBusy(true);
    setError(null);
    try {
      const result = await customApi.upsert({
        id: editing?.id,
        name: name.trim(),
        baseUrl: baseUrl.trim(),
        key: key.trim() || undefined,
        modelIds: models,
      });
      if (result.type === "error") throw new Error(result.message ?? "Failed to save provider");
      onOpenChange(false);
      await onSaved(result.id ?? editing?.id ?? "");
    } catch (e) {
      setError(String(e));
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? "Edit custom API" : "Add custom API"}</DialogTitle>
          <DialogDescription>Any OpenAI-compatible endpoint — LM Studio, vLLM, or a hosted gateway.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <Field label="Display name">
            <Input value={name} placeholder="Acme Gateway" onChange={(e) => setName(e.currentTarget.value)} />
          </Field>
          <Field label="Base URL">
            <Input
              value={baseUrl}
              placeholder="https://api.example.com/v1"
              onChange={(e) => setBaseUrl(e.currentTarget.value)}
            />
          </Field>
          <Field label="API key">
            <Input
              type="password"
              value={key}
              placeholder={keyPlaceholder}
              onChange={(e) => setKey(e.currentTarget.value)}
            />
          </Field>
          <Field label={`Models${models.length > 0 ? ` (${models.length})` : ""}`}>
            <Textarea
              value={modelsText}
              rows={4}
              placeholder={"gpt-4o\nllama-3.1-70b\n—one per line, or comma separated"}
              onChange={(e) => setModelsText(e.currentTarget.value)}
            />
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => void probe(true)} disabled={!canProbe}>
                {busy ? "Working…" : "Fetch models"}
              </Button>
              <Button size="sm" variant="outline" onClick={() => void probe(false)} disabled={!canProbe}>
                Test connection
              </Button>
            </div>
            {status && <p className="text-muted-foreground text-xs">{status}</p>}
          </Field>
          {error && <ErrorBanner message={error} />}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={!canSave}>
            {busy ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">{label}</span>
      {children}
    </label>
  );
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit** `feat(desktop): custom provider add/edit dialog`

---

### Task 8: Section in Providers settings

**Files:**
- Modify: `packages/desktop/src/components/clarus/settings/providers-settings.tsx`

- [ ] **Step 1: Add imports + state** (in `ProvidersList`)

```tsx
import { customApi } from "@/rpc/api";           // add to existing rpc/api import
import type { AuthProviderRow, AuthStatus, CustomProviderInfo } from "@/rpc/types";
import { CustomProviderDialog } from "./custom-provider-dialog";
```

```tsx
const [customProviders, setCustomProviders] = useState<CustomProviderInfo[]>([]);
const [customDialogOpen, setCustomDialogOpen] = useState(false);
const [customEditing, setCustomEditing] = useState<CustomProviderInfo | null>(null);
const [customError, setCustomError] = useState<string | null>(null);

const reloadCustom = useCallback(async () => {
  try {
    setCustomProviders(await customApi.list());
  } catch {
    // Best-effort: the section can lag one render behind on failure.
  }
}, []);

useEffect(() => {
  void reloadCustom();
}, [reloadCustom]);
```

- [ ] **Step 2: Add save/remove handlers** (after `afterAdd`)

```tsx
const savedCustom = useCallback(
  async (id: string) => {
    // Same chain as cloud keys: restart so the agent re-reads models.json/auth.json,
    // widen the composer's enabled list, refresh both provider views.
    await afterAdd(id);
    await reloadCustom();
  },
  [afterAdd, reloadCustom],
);

const removeCustom = useCallback(
  async (id: string) => {
    setCustomError(null);
    try {
      const result = await customApi.remove(id);
      if (result.type === "error") throw new Error(result.message ?? "Failed to remove provider");
      const settings = await settingsApi.get();
      if (parseModelId(settings.defaultModel ?? "")?.provider === id)
        await settingsApi.set({ defaultModel: undefined });
      await agentApi.restart();
      await reloadCustom();
      await reload();
    } catch (e) {
      setCustomError(String(e));
    }
  },
  [reload, reloadCustom],
);
```

- [ ] **Step 3: Render the section** (between the "Cloud API keys" and "Available" sections; also render the dialog once at the bottom of the fragment)

```tsx
<Section
  title="Custom API (OpenAI-compatible)"
  description="Point Clarus at any OpenAI-compatible endpoint — LM Studio, vLLM, or a hosted gateway."
>
  {customProviders.length > 0 && (
    <div className="flex flex-col gap-1">
      {customProviders.map((cp) => (
        <div
          key={cp.id}
          className="hover:bg-muted/50 flex items-center justify-between gap-3 rounded-md px-2 py-1.5"
        >
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">{cp.name}</div>
            <div className="text-muted-foreground truncate text-xs">
              {cp.baseUrl} · {cp.models.length} model{cp.models.length === 1 ? "" : "s"}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setCustomError(null);
                setCustomEditing(cp);
                setCustomDialogOpen(true);
              }}
            >
              Edit
            </Button>
            <Button size="sm" variant="outline" className="w-28" onClick={() => void removeCustom(cp.id)}>
              Remove
            </Button>
          </div>
        </div>
      ))}
      {customError && <ErrorBanner message={customError} />}
    </div>
  )}
  <div className={customProviders.length > 0 ? "pt-1" : ""}>
    <Button
      size="sm"
      variant="outline"
      onClick={() => {
        setCustomError(null);
        setCustomEditing(null);
        setCustomDialogOpen(true);
      }}
    >
      Add provider
    </Button>
  </div>
</Section>
```

and before the closing `</>`:

```tsx
<CustomProviderDialog
  open={customDialogOpen}
  onOpenChange={setCustomDialogOpen}
  editing={customEditing}
  onSaved={savedCustom}
/>
```

- [ ] **Step 4: Verify typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit** `feat(desktop): custom API section in Providers settings`

---

### Task 9: Full verification

- [ ] **Step 1:** `npx vitest run` — all tests pass.
- [ ] **Step 2:** `npm run typecheck` — passes.
- [ ] **Step 3:** `npx biome check packages/desktop` — no lint/format errors (run `npx biome check --write packages/desktop` to auto-fix formatting first).
- [ ] **Step 4:** `npm run build` — production build succeeds.
- [ ] **Step 5:** Manual smoke (optional, needs display): `npm start` → Settings → Providers → Add provider → point at a real endpoint → models appear in composer.
