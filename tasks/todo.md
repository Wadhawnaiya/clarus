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
- [ ] Acceptance: New template with INR + core GST/capital accounts for chosen entity type
- [ ] Verify: scaffold tests; hledger validate clean
- [ ] Files: `scaffold/template/**`
- [ ] Scope: M

### Task 4.2: Query/report extensions (cashflow, TB helper)
- [ ] Acceptance: `cf` supported; TB helper returns consistent structure
- [ ] Verify: unit tests with fixture journal hardcoded expectations
- [ ] Files: `ledger/query.ts`, `tools/query.ts`
- [ ] Scope: M

### Task 4.3: FS pack generator
- [ ] Acceptance: Writes TB, P&L, BS, CF (+ notes stub) under client `reviews/…`
- [ ] Verify: fixture books → hardcoded expected key totals
- [ ] Files: new module under pi-extension + tool/command
- [ ] Scope: M

### Task 4.4: Agent prompt for firm FS workflow
- [ ] Acceptance: Prompt guides pack generation and review language
- [ ] Verify: prompt tests / eval smoke
- [ ] Files: `system.md`
- [ ] Scope: S

### Task 4.5: Evals for FS pack
- [ ] Acceptance: At least one eval case for FS pack path
- [ ] Verify: eval harness loads case
- [ ] Files: `packages/evals/cases/*`
- [ ] Scope: S

### Checkpoint P4
- [ ] Seed client → generate pack → numbers match hledger is/bs/bal/cf

---

## Phase 5 — GSTR review pack

### Task 5.1: Define pack schema (GSTR-1 / 3B or agreed set)
- [ ] Acceptance: Written schema + sample fixture
- [ ] Scope: S

### Task 5.2: Generator from ledger + docs
- [ ] Acceptance: Workpapers + checklist under `reviews/…/gstr/`
- [ ] Verify: fixture tests
- [ ] Scope: M–L

### Task 5.3: Agent workflow + labels (draft / not filed)
- [ ] Acceptance: Clear non-filing language in outputs
- [ ] Scope: S

### Checkpoint P5
- [ ] CA can review GSTR pack without portal automation

---

## Phase 6 — ITR review pack

### Task 6.1: Define pack schema (ITR-3/4 or agreed set)
- [ ] Acceptance: Written schema + fixture
- [ ] Scope: S

### Task 6.2: Computation / workpaper generator
- [ ] Acceptance: Sourced figures + gaps; under `reviews/…/itr/`
- [ ] Verify: hardcoded expected computations on fixture
- [ ] Scope: M–L

### Task 6.3: Document intake (AIS/26AS/Form 16) hooks
- [ ] Acceptance: Upload → extract → structured notes in pack
- [ ] Scope: M

### Checkpoint P6
- [ ] Review pack usable for manual portal entry

---

## Phase 7 — Pilot hardening

- [ ] Pilot install doc (Windows + client folder + pack flows)
- [ ] Expand evals
- [ ] Analytics / update feed brand cleanup
- [ ] Internal release checklist
- [ ] UAT round with firm staff

---

## Do not start until plan approval

No implementation commits for Phases 1–7 until Phase 0 gate is checked.
