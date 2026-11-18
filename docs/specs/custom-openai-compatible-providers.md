# Spec: Custom OpenAI-compatible API providers

**Status:** Approved
**Date:** 2026-11-17

## Objective

Let users connect any OpenAI-compatible API endpoint (LM Studio, vLLM, corporate
proxies, hosted gateways) by providing a **base URL, API key, and model list** —
in addition to the existing cloud providers (OpenRouter, NVIDIA NIM, OAuth
accounts). Custom providers behave exactly like the built-in cloud providers:
their models appear in the composer model selector, persist across client
folder switches, and work immediately after saving.

## User-facing behavior

- Settings → Providers gains a **"Custom API (OpenAI-compatible)"** section
  below "Cloud API keys".
- **Add provider** opens a dialog with:
  - **Display name** (required, e.g. "LM Studio", "Acme Gateway")
  - **Base URL** (required, e.g. `https://api.example.com/v1`)
  - **API key** (required; stored like other cloud keys)
  - **Models** (required, at least one): a **Fetch models** button queries
    `GET {baseUrl}/models` with the key and auto-fills the list; a manual
    text field (comma/newline separated model IDs) is the fallback when the
    endpoint does not implement `/models`.
  - **Test connection** button: calls `/models`, shows inline
    success ("Connected — N models found") or failure ("401 Unauthorized —
    check your key", "Could not reach URL") without saving anything.
- Saving an entry makes its models selectable in the composer immediately.
- Each custom provider row shows name, URL, and model count, with **Edit**
  (reopens the dialog pre-filled; key field empty = keep existing) and
  **Remove** (deletes the entry and its key).
- Multiple custom providers are supported simultaneously.

## Provider identity

- Each entry gets a stable id `custom-<slug>` derived from the display name
  ("Acme Gateway" → `custom-acme-gateway`). Slug = lowercase, non-alphanumerics
  collapsed to `-`, trimmed. Duplicate slugs get a numeric suffix
  (`custom-acme-gateway-2`).
- Slugs never contain `/` (pi parses model refs as `provider/modelId` on the
  first slash), so `provider/id` refs stay unambiguous.
- Renames keep the original provider id (rename changes display name only) so
  stored keys and per-client model selections survive.

## Storage (single source of truth: pi config dir `~/Clarus/`)

No new registry file. The set of custom providers is derived from
`models.json` entries whose provider id starts with `custom-`.

- `models.json` → `providers.<custom-id>`:
  ```json
  {
    "name": "Acme Gateway",
    "baseUrl": "https://api.example.com/v1",
    "apiKey": "managed-by-clarus",
    "api": "openai-completions",
    "models": [
      { "id": "llama-3.1-70b", "name": "llama-3.1-70b", "reasoning": false, "input": ["text"] }
    ]
  }
  ```
  The placeholder `apiKey` satisfies pi's schema requirement that custom
  providers define `apiKey`; at request time pi resolves auth.json first, so the
  real key is never read from models.json.
- `auth.json` → `"<custom-id>": { "type": "api_key", "key": "<real key>" }` —
  identical to how OpenRouter/NVIDIA keys are stored.
- pi defaults apply for omitted model fields (`contextWindow: 128000`,
  `maxTokens: 16384`, `input: ["text"]`).

## Main process

New module `packages/desktop/electron/main/customProviders.ts`; handlers wired
in `pi.ts`, channels allowlisted in `preload/index.ts`.

- `custom_list` — parse models.json, return `custom-*` entries with the key
  masked (never send the raw key to the renderer).
- `custom_upsert({ id?, name, baseUrl, key?, modelIds })` — add or update:
  write/update the models.json entry; store the key in auth.json when
  provided (add, or explicit replace on edit).
- `custom_remove(id)` — delete the models.json entry and
  `authStorage.logout(id)`.
- `custom_test({ baseUrl, key })` — `GET {baseUrl}/models` with
  `Authorization: Bearer <key>` via Node `fetch`; returns `{ ok, modelIds?, error? }`.
- `custom_fetch_models({ baseUrl, key })` — same request, returns parsed model
  IDs for auto-fill.
- Every mutation restarts the agent (existing `agentApi.restart()` chain) so
  the pi child re-reads models.json/auth.json, and enables the provider's
  models in `settings.enabledModels` (reuse `enableProviderModels` flow).

## Renderer

- `rpc/api.ts`: add `customApi` client (list/upsert/remove/test/fetchModels).
- `rpc/types.ts`: `CustomProviderInfo { id, name, baseUrl, models: string[] }`.
- New `clarus/settings/custom-provider-dialog.tsx`: shadcn Dialog with the form
  described above; inline validation (name/URL/model list required, URL must
  start with `http://` or `https://`); fetch/test errors shown inline.
- `providers-settings.tsx`: new section listing custom providers with
  Edit/Remove; "Add provider" button; after save/remove, reuse the existing
  restart + reload chain.

## Error handling

- Fetch/test failures surface the HTTP status or network message inline
  ("401 Unauthorized — check your key", "Could not reach URL — check the
  address").
- models.json schema errors are impossible by construction (we only write
  valid entries); if the file is otherwise corrupt, pi already surfaces its
  own load error and the app shows built-in models only.
- Removing a provider that is the current `defaultModel` clears the default
  (same as existing disconnect flow).

## Testing (Vitest, spec-style)

- Slug generation: sanitize, collapse, dedupe suffixes.
- Upsert/remove: temp-dir models.json + auth.json state after each operation,
  including edit (key preserved when omitted) and rename (id stable).
- `/models` parsing: happy path (`data[].id`), empty list, malformed JSON,
  non-200 status, network failure.
- Renderer helpers: validation of name/URL/model list.
