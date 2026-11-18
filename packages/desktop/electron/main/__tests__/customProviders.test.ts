import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  customProviderSlug,
  fetchCustomModels,
  readCustomProviders,
  removeCustomProvider,
  upsertCustomProvider,
} from "../customProviders";

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
    upsertCustomProvider(
      { name: "Acme", baseUrl: "https://a.example", key: "k1", modelIds: ["m1"] },
      { modelsPath },
      deps(),
    );
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
    upsertCustomProvider(
      { name: "Acme", baseUrl: "https://a.example", key: "k1", modelIds: ["m1"] },
      { modelsPath },
      deps(),
    );
    upsertCustomProvider(
      { id: "custom-acme", name: "Acme", baseUrl: "https://a.example", key: "k2", modelIds: ["m1"] },
      { modelsPath },
      deps(),
    );
    expect(storedKeys.get("custom-acme")).toBe("k2");
  });

  it("should give a second same-slug name a numeric suffix", () => {
    upsertCustomProvider(
      { name: "Acme", baseUrl: "https://a.example", key: "k1", modelIds: ["m1"] },
      { modelsPath },
      deps(),
    );
    const second = upsertCustomProvider(
      { name: "ACME!", baseUrl: "https://b.example", key: "k2", modelIds: ["m1"] },
      { modelsPath },
      deps(),
    );
    expect(second).toEqual({ type: "done", id: "custom-acme-2" });
  });

  it("should reject a blank name, a non-http(s) URL, and an empty model list", () => {
    expect(
      upsertCustomProvider({ name: "  ", baseUrl: "https://a.example", modelIds: ["m1"] }, { modelsPath }, deps()).type,
    ).toBe("error");
    expect(
      upsertCustomProvider({ name: "A", baseUrl: "ftp://a.example", modelIds: ["m1"] }, { modelsPath }, deps()).type,
    ).toBe("error");
    expect(
      upsertCustomProvider({ name: "A", baseUrl: "https://a.example", modelIds: [" ", ""] }, { modelsPath }, deps())
        .type,
    ).toBe("error");
  });

  it("should refuse to write when models.json is corrupt", () => {
    writeFileSync(modelsPath, "{ nope");
    const result = upsertCustomProvider(
      { name: "A", baseUrl: "https://a.example", modelIds: ["m1"] },
      { modelsPath },
      deps(),
    );
    expect(result.type).toBe("error");
    expect((result as { message?: string }).message).toContain("not valid JSON");
  });

  it("should reject an edit id that is missing or not an app-managed custom provider", () => {
    expect(
      upsertCustomProvider(
        { id: "ollama", name: "A", baseUrl: "https://a.example", modelIds: ["m1"] },
        { modelsPath },
        deps(),
      ).type,
    ).toBe("error");
    expect(
      upsertCustomProvider(
        { id: "custom-ghost", name: "A", baseUrl: "https://a.example", modelIds: ["m1"] },
        { modelsPath },
        deps(),
      ).type,
    ).toBe("error");
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
    upsertCustomProvider(
      { name: "Acme", baseUrl: "https://a.example", key: "k1", modelIds: ["m1"] },
      { modelsPath },
      {},
    );
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

describe("fetchCustomModels()", () => {
  const okResponse = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

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
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 401 })),
    );
    expect(await fetchCustomModels("https://api.example.com/v1", "bad")).toEqual({
      ok: false,
      error: "HTTP 401 — check your API key",
    });
  });

  it("should report other non-200 statuses without the key hint", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 500 })),
    );
    expect(await fetchCustomModels("https://api.example.com/v1", "k")).toEqual({
      ok: false,
      error: "HTTP 500",
    });
  });

  it("should reject an empty model list", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => okResponse({ data: [] })),
    );
    expect(await fetchCustomModels("https://api.example.com/v1", "k")).toEqual({
      ok: false,
      error: "Endpoint responded but returned no models",
    });
  });

  it("should reject a malformed JSON response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("not json", { status: 200 })),
    );
    const result = await fetchCustomModels("https://api.example.com/v1", "k");
    expect(result).toEqual({ ok: false, error: "Endpoint returned an invalid response" });
  });

  it("should report network failures with the underlying message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.reject(new Error("ECONNREFUSED"))),
    );
    expect(await fetchCustomModels("https://api.example.com/v1", "k")).toEqual({
      ok: false,
      error: "Could not reach URL: ECONNREFUSED",
    });
  });

  it("should report timeouts as a timeout", async () => {
    const timeoutError = new Error("The operation was aborted due to timeout");
    timeoutError.name = "TimeoutError";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.reject(timeoutError)),
    );
    expect(await fetchCustomModels("https://api.example.com/v1", "k")).toEqual({
      ok: false,
      error: "Request timed out",
    });
  });
});
