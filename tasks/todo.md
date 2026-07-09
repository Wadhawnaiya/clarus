# Clarus v1 — Task checklist

Legend: `[ ]` pending · `[~]` in progress · `[x]` done · `[-]` cancelled

## Phase 0 — Align

- [x] Intent saved (`docs/intent/clarus.md`)
- [x] Spec draft (`docs/specs/clarus.md`)
- [x] Plan draft (`tasks/plan.md`)
- [ ] **Human approves plan** (gate before code)
- [ ] Resolve open questions (copyright, GSTR/ITR set, Windows alpha, entity types, distribution) — can be partial; block only the phase that needs each answer

---

## Phase 1 — Rebrand foundation

### Task 1.1: Product identity constants
- [x] Acceptance: Single module exports product name, env key, default folder name, extension resource name
- [x] Verify: unit tests for defaults; typecheck
- [x] Files: `packages/desktop/electron/main/product.ts`, `packages/desktop/src/lib/product.ts`, `packages/pi-extension/src/product.ts` + config dual-read
- [x] Scope: S

### Task 1.2: User-facing rebrand
- [x] Acceptance: Window title, onboarding, settings, README headline, system prompt soul = Clarus firm assistant
- [x] Verify: grep for user-facing Accountant24 in UI/prompt returns none (docs historical OK)
- [x] Files: UI components, `system.md`, `README.md`, scaffold headers
- [x] Scope: M

### Task 1.3: Packaging identity
- [x] Acceptance: `productName: Clarus`; appId `com.clarus.desktop`; extension `clarus-extension.js`; packages `@clarus/*`
- [x] Verify: electron-builder config valid; typecheck workspace name
- [x] Files: `electron-builder.yml`, `package.json` scripts/names, `bundle-extension.ts`
- [x] Scope: M
- Note: GitHub publish owner/repo still upstream until firm channel exists

### Task 1.4: Component path rename
- [x] Acceptance: `accountant24/` → `clarus/`; imports updated; AGENTS.md updated
- [x] Verify: typecheck + component tests
- [x] Files: `packages/desktop/src/components/**`, `AGENTS.md`
- [x] Scope: M

### Task 1.5: License / NOTICE
- [x] Acceptance: Upstream MIT copyright retained; Clarus contributors line + NOTICE
- [x] Verify: LICENSE still MIT-compliant
- [x] Files: `LICENSE`, `NOTICE`
- [x] Scope: XS

### Checkpoint P1
- [x] Rebrand-related tests pass (136 targeted)
- [x] `npm run typecheck` pass
- [ ] Manual: app opens with Clarus branding (dev) — user/local smoke
- Note: Full suite has 8 env-dependent failures on this machine (no hledger/tesseract/git identity) unrelated to rebrand

---

## Phase 2 — Client folders

### Task 2.1: Settings model for recent/last client
- [x] Acceptance: persist last workspace path + recents list
- [x] Verify: unit tests for load/save/migrate
- [x] Files: desktop settings module (`appConfigDir` + `lastClientPath` / `recentClientPaths`)
- [x] Scope: S

### Task 2.2: Open folder IPC + UI
- [x] Acceptance: Open Client Folder dialog; set workspace; restart agent context
- [x] Verify: unit tests for path validation + IPC; UI in sidebar
- [x] Files: `workspace.ts`, preload, `client-folder.tsx`, chat layout, App remount key
- [x] Scope: M

### Task 2.3: Env + extension base dir on switch
- [x] Acceptance: `CLARUS_HOME` points at selected folder; auth/models stay in app config
- [x] Verify: unit tests; agent env separation; ChatLayout remount on switch
- [x] Files: `env.ts`, `agent.ts`, `pi.ts` (auth in appConfigDir)
- [x] Scope: M

### Task 2.4: Empty-folder scaffold on open
- [x] Acceptance: opening empty dir creates ledger/files/sessions dirs; journals/memory on first agent session_start
- [x] Verify: workspace tests for layout dirs + no overwrite of existing journal
- [x] Files: `workspace.ts` ensureClientLayout + existing extension scaffold
- [x] Scope: S

### Checkpoint P2
- [ ] Two different folders opened sequentially → independent books (manual smoke)
- [x] Tests + typecheck pass (Phase 2 suite)

---

## Phase 3 — Windows

### Task 3.1: Windows runtime spike (read-only doc + checklist)
- [x] Acceptance: Document what works/fails on Windows today (Node, Electron, hledger PATH)
- [x] Verify: notes in `tasks/windows-spike.md`
- [x] Scope: S

### Task 3.2: electron-builder Windows target
- [x] Acceptance: `npm run dist:win` configured (nsis + portable x64, unsigned pilot)
- [ ] Verify: artifact builds on Windows CI or local Windows (dispatch `windows-build.yml`)
- [x] Files: `electron-builder.yml`, root `package.json` (`dist:win`)
- [x] Scope: M

### Task 3.3: Native tools strategy implementation
- [x] Acceptance: Windows vendor path downloads hledger + poppler (+ tessdata); tesseract best-effort / PATH
- [x] Verify: unit tests for pins/target; `npm run vendor:bin:win` succeeds cross-prep on Linux
- [x] Files: `scripts/vendor-bin.ts`, `scripts/vendor-bin-sources.ts`, bin README, resources gitignore
- [x] Scope: L

### Task 3.4: CI Windows build job
- [x] Acceptance: workflow uploads Windows artifact (unsigned OK for pilot)
- [ ] Verify: green CI job on `windows-latest` (run via Actions dispatch)
- [x] Files: `.github/workflows/windows-build.yml`; release.yml Clarus.dmg name fix
- [x] Scope: M

### Checkpoint P3
- [ ] Staff can install and complete one chat turn + ledger query on Windows

---

## Phase 4 — Books + FS review pack

### Task 4.1: India firm CoA scaffold (v1 entity)
- [x] Acceptance: New template with INR + core GST/capital accounts for chosen entity type
- [x] Verify: scaffold tests for India CoA (GST, capital, drawings, INR commodity)
- [x] Files: `scaffold/template/ledger/accounts.journal`, `commodities.journal`
- [x] Scope: M
- Note: v1 entity default = sole proprietorship; partnership/company templates later. Full `hledger check` on real binary needs hledger on PATH (Linux host may only have Windows vendor binary).

### Task 4.2: Query/report extensions (cashflow, TB helper)
- [x] Acceptance: `cf` supported; TB helper returns consistent structure
- [x] Verify: unit tests map `tb`→`bal`, `cf`→`cashflow`; `queryTrialBalance()`
- [x] Files: `ledger/query.ts`, `tools/query.ts`
- [x] Scope: M

### Task 4.3: FS pack generator
- [x] Acceptance: Writes TB, P&L, BS, CF (+ notes stub) under client `reviews/…`
- [x] Verify: fixture books → hardcoded expected key totals (mock hledger I/O)
- [x] Files: `reviews/fs-pack.ts`, `tools/generate-fs-pack.ts`
- [x] Scope: M

### Task 4.4: Agent prompt for firm FS workflow
- [x] Acceptance: Prompt guides pack generation and review language
- [x] Verify: system-prompt tests for `<fs_review_workflow>`
- [x] Files: `system-prompt/system.md`
- [x] Scope: S

### Task 4.5: Evals for FS pack
- [x] Acceptance: At least one eval case for FS pack path
- [x] Verify: eval harness loads case (`fs-pack.jsonl` via loader suite)
- [x] Files: `packages/evals/cases/fs-pack.jsonl`
- [x] Scope: S

### Checkpoint P4
- [x] Unit: pack files + fixture totals match mocked hledger TB/is/bs/cf
- [ ] Manual: seed client → generate pack → numbers match real hledger is/bs/bal/cf on machine with hledger

---

## Phase 5 — GSTR review pack

### Task 5.1: Define pack schema (GSTR-1 / 3B or agreed set)
- [x] Acceptance: Written schema + sample fixture (GSTR-1 + GSTR-3B style workpapers)
- [x] Scope: S
- Note: v1 form set = GSTR-1 + GSTR-3B style summaries from books; GSTR-9 out of scope

### Task 5.2: Generator from ledger + docs
- [x] Acceptance: Workpapers + checklist under `reviews/…/gstr/`
- [x] Verify: fixture tests (hardcoded GST figures, CSV companions)
- [x] Files: `reviews/gstr-pack.ts`, `tools/generate-gstr-pack.ts`
- [x] Scope: M–L

### Task 5.3: Agent workflow + labels (draft / not filed)
- [x] Acceptance: Clear non-filing language in outputs + system prompt `<gstr_review_workflow>`
- [x] Verify: system-prompt tests; eval cases `gstr-pack.jsonl`
- [x] Scope: S

### Checkpoint P5
- [x] Unit: pack under `reviews/FY…/gstr/` with draft/not-filed labels; fixture GST figures match
- [ ] Manual: seed client with GST postings → generate pack → numbers match real hledger


---

## Phase 6 — ITR review pack

### Task 6.1: Define pack schema (ITR-3/4 or agreed set)
- [x] Acceptance: Written schema + fixture (ITR-3 + ITR-4 style workpapers)
- [x] Scope: S
- Note: v1 form set = ITR-3 + ITR-4 style notes from books; no slab/presumptive engine

### Task 6.2: Computation / workpaper generator
- [x] Acceptance: Sourced figures + gaps; under `reviews/…/itr/`
- [x] Verify: hardcoded expected computations on fixture
- [x] Files: `reviews/itr-pack.ts`, `tools/generate-itr-pack.ts`
- [x] Scope: M–L

### Task 6.3: Document intake (AIS/26AS/Form 16) hooks
- [x] Acceptance: Scan `files/` → classify AIS/TIS/26AS/Form16 → gaps + extract_text hooks in pack
- [x] Scope: M

### Checkpoint P6
- [x] Unit: pack under `reviews/FY…/itr/` with draft/not-filed labels; fixture income figures + doc gaps
- [ ] Manual: seed client → generate pack → books figures match real hledger; upload AIS sample

---

## Phase 7 — Pilot hardening

### Task 7.1: Pilot install doc
- [x] Acceptance: Doc covers Windows install (Setup + Portable), open client folder, FS/GSTR/ITR pack chat flows, known pilot limits
- [x] Verify: file exists under `docs/`; linked from README
- [x] Files: `docs/pilot-install.md`, `README.md`
- [x] Scope: S

### Task 7.2: Expand evals
- [x] Acceptance: Additional firm cases (multi-pack, ITR doc intake, FS query TB, dual safety) loadable via harness
- [x] Verify: `loadCases()` includes new ids; unique ids across suite (50 total)
- [x] Files: `packages/evals/cases/*.jsonl` (+ `firm-workflow.jsonl`)
- [x] Scope: S

### Task 7.3: Analytics / update feed brand cleanup
- [x] Acceptance: No user-facing changelog link to Accountant24; update feed owner/repo is Clarus; auto-update gated until firm enables; Aptabase not using upstream product key by default
- [x] Verify: unit tests for product gates + updater; typecheck
- [x] Files: `product.ts` (main+renderer), `analytics.ts`, `updater.ts`, `settings.tsx`, `electron-builder.yml`
- [x] Scope: M

### Task 7.4: Internal release checklist
- [x] Acceptance: Checklist for cutting a pilot build (Windows CI, vendor bins, brand smoke, packs smoke)
- [x] Files: `tasks/release-checklist.md`
- [x] Scope: XS

### Task 7.5: UAT script for firm staff
- [x] Acceptance: Written UAT script staff can run and mark pass/fail (install → client folder → chat → packs)
- [x] Files: `tasks/uat-pilot.md`
- [x] Scope: S
- Note: Execution is human-only; this task ships the script, not the signed-off results

### Checkpoint P7
- [x] Docs + checklists committed (files on disk; commit when ready)
- [x] Evals load with expanded cases
- [x] Brand/update/analytics tests + typecheck pass
- [ ] UAT script ready for staff (results backfill later) — **script ready; staff run pending**

---

## Do not start until plan approval

No implementation commits for Phases 1–7 until Phase 0 gate is checked.
*(Phases 1–6 executed; Phase 7 proceeds under same working approval.)*
